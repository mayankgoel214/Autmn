import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), override: true });

import { Worker } from 'bullmq';
import {
  getRedisConnection,
  QueueNames,
  getStorageCleanupQueue,
} from '@autmn/queue';
import { prisma } from '@autmn/db';
import { initSentry, captureException } from '@autmn/ai';
import { initMetrics, startMetricsServer, instrumentProcessor } from '@autmn/metrics';
import { getConfig } from './config.js';
import { processImageJob } from './processors/image-processing.js';
import { processPaymentCheck } from './processors/payment-check.js';
import { processSessionTimeout } from './processors/session-timeout.js';
import { processStorageCleanup } from './processors/storage-cleanup.js';

// ---------------------------------------------------------------------------
// Storage TTL cleanup — DPDP compliance.
//
// 30 days for the three buckets that hold raw customer-supplied content:
//   - raw-images:     unaltered product photos
//   - voice-notes:    transcription-input voice notes
//   - refund-reasons: voice-note refund reasons
//
// Derived outputs (processed-images, cutouts) are NOT swept — the user
// paid for them and a future "Make a change" flow may need them as
// input. brand-assets is held longer too (curated business content,
// not derivable from anything else); skip from this list.
// ---------------------------------------------------------------------------
const STORAGE_TTL_BUCKETS = [
  { bucket: 'raw-images', maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  { bucket: 'voice-notes', maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
  { bucket: 'refund-reasons', maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
] as const;

/** Daily at 21:30 UTC (03:00 IST) — low-traffic window. */
const STORAGE_CLEANUP_CRON = '30 21 * * *';

async function main() {
  const config = getConfig();

  if (config.NODE_ENV === 'production' && process.env.PAYMENT_BYPASS === 'true') {
    console.error('FATAL: PAYMENT_BYPASS must not be set in production');
    process.exit(1);
  }

  console.log(`Marquee Worker starting (${config.NODE_ENV})`);

  // V1 compromise #4 — Sentry transport for alert.* + uncaught errors.
  // No-op when SENTRY_DSN is unset.
  initSentry({
    dsn: config.SENTRY_DSN,
    service: 'worker',
    environment: config.NODE_ENV,
    release: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  });

  // Started before the workers so the first job is already being counted. The
  // queue-depth gauge is registered by importing @autmn/metrics; it reads Redis
  // at scrape time rather than on a timer.
  initMetrics('worker');
  startMetricsServer(Number(process.env.METRICS_PORT ?? 9101));

  // Each BullMQ Worker MUST have its own Redis connection
  const imageWorker = new Worker(
    QueueNames.IMAGE_PROCESSING,
    instrumentProcessor(QueueNames.IMAGE_PROCESSING, processImageJob),
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 3,
      lockDuration: 600000, // 10 min — V2 pipeline with retries can take 7+ min
      limiter: { max: 10, duration: 60_000 },
    },
  );

  const paymentWorker = new Worker(
    QueueNames.PAYMENT_CHECK,
    instrumentProcessor(QueueNames.PAYMENT_CHECK, processPaymentCheck),
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 5,
    },
  );

  const sessionWorker = new Worker(
    QueueNames.SESSION_TIMEOUT,
    instrumentProcessor(QueueNames.SESSION_TIMEOUT, processSessionTimeout),
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 10,
    },
  );

  // Storage TTL cleanup worker — concurrency 1 because we want at most
  // one sweep in flight at any time. The lockDuration covers the
  // longest expected run (large buckets paginate through many list
  // calls).
  const storageCleanupWorker = new Worker(
    QueueNames.STORAGE_CLEANUP,
    instrumentProcessor(QueueNames.STORAGE_CLEANUP, processStorageCleanup),
    {
      connection: getRedisConnection().duplicate(),
      concurrency: 1,
      lockDuration: 30 * 60 * 1000, // 30 min ceiling for the sweep
    },
  );

  // Register the nightly repeating job. upsertJobScheduler is idempotent
  // so re-deploying the worker doesn't multiply the schedule.
  try {
    const storageCleanupQueue = getStorageCleanupQueue();
    await storageCleanupQueue.upsertJobScheduler(
      'storage-ttl-nightly',
      { pattern: STORAGE_CLEANUP_CRON },
      {
        name: 'storage-ttl-nightly',
        data: { buckets: [...STORAGE_TTL_BUCKETS] },
      },
    );
    console.log(
      JSON.stringify({
        event: 'storage_cleanup_scheduled',
        cron: STORAGE_CLEANUP_CRON,
        buckets: STORAGE_TTL_BUCKETS.map((b) => ({
          bucket: b.bucket,
          maxAgeDays: Math.round(b.maxAgeMs / 86_400_000),
        })),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'storage_cleanup_schedule_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    captureException(err, { component: 'storage_cleanup_scheduler' });
  }

  // Error handlers
  const workers = [
    { name: 'image', worker: imageWorker },
    { name: 'payment', worker: paymentWorker },
    { name: 'session', worker: sessionWorker },
    { name: 'storage-cleanup', worker: storageCleanupWorker },
  ];

  for (const { name, worker } of workers) {
    worker.on('failed', (job, err) => {
      console.error(JSON.stringify({
        worker: name,
        jobId: job?.id,
        error: err.message,
        msg: 'Job failed',
      }));
      // V1 compromise #4 — surface the exception (no-op without Sentry DSN).
      captureException(err, {
        worker: name,
        jobId: job?.id,
        queueName: job?.queueName,
        attemptsMade: job?.attemptsMade,
      });
    });

    worker.on('completed', (job) => {
      console.log(JSON.stringify({
        worker: name,
        jobId: job.id,
        msg: 'Job completed',
      }));
    });
  }

  console.log('All workers running');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down workers...`);

    await Promise.all(
      workers.map(({ name, worker }) =>
        worker.close().then(() => console.log(`${name} worker closed`)),
      ),
    );

    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
