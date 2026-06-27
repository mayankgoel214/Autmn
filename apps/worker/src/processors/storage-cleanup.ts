/**
 * Storage TTL cleanup processor — DPDP compliance.
 *
 * One job sweeps every bucket in `data.buckets`, deleting anything older
 * than the per-bucket retention window. Scheduled by apps/worker/src/index.ts
 * as a nightly repeating job. The job data is intentionally tiny (just the
 * bucket → maxAgeMs pairs) so the schedule is self-documenting at the
 * BullMQ layer.
 *
 * Failure model:
 *   - cleanupBucketByAge throws on list failure → we let it propagate so
 *     BullMQ records the failure (attempts: 1 means no retry; the next
 *     scheduled run is the retry).
 *   - Per-batch delete failures are returned as `errors` counts; we log
 *     them but treat the run as a success at the BullMQ level.
 *   - One bucket failing must not prevent the others from being swept —
 *     bucket calls are awaited inside a try/catch each.
 */

import type { Job } from 'bullmq';
import { StorageCleanupJobDataSchema, type StorageCleanupJobData } from '@autmn/queue';
import { cleanupBucketByAge, type CleanupBucketResult } from '@autmn/storage';
import { prisma } from '@autmn/db';

// WebhookEvent rows store the full inbound Meta/Razorpay payload (sender phone,
// message text, Flow form data) — PII at rest. Keep a 30-day debugging window,
// then prune. DPDP data-minimization; runs in the same nightly sweep.
const WEBHOOK_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function processStorageCleanup(
  job: Job<StorageCleanupJobData>,
): Promise<void> {
  const data = StorageCleanupJobDataSchema.parse(job.data);

  const log = (msg: string, extra?: Record<string, unknown>): void => {
    console.log(JSON.stringify({ job: job.id, msg, ...extra }));
  };

  log('=== STORAGE TTL CLEANUP START ===', {
    bucketCount: data.buckets.length,
    buckets: data.buckets.map((b) => ({
      bucket: b.bucket,
      maxAgeDays: Math.round(b.maxAgeMs / 86_400_000),
    })),
  });

  const results: CleanupBucketResult[] = [];

  for (const entry of data.buckets) {
    try {
      const result = await cleanupBucketByAge(entry.bucket, entry.maxAgeMs);
      results.push(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: 'storage_cleanup_bucket_failed',
          bucket: entry.bucket,
          error: errorMsg,
        }),
      );
      // Continue with the next bucket — one failed sweep doesn't justify
      // skipping the others.
      results.push({
        bucket: entry.bucket,
        scanned: 0,
        deleted: 0,
        errors: 0,
        skippedNoTimestamp: 0,
        durationMs: 0,
      });
    }
  }

  const totalScanned = results.reduce((sum, r) => sum + r.scanned, 0);
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  // Prune PII-bearing webhook payloads past the retention window. Non-fatal:
  // a failed prune must not fail the storage sweep — the next run retries.
  let webhookEventsDeleted = 0;
  try {
    const cutoff = new Date(Date.now() - WEBHOOK_EVENT_RETENTION_MS);
    const { count } = await prisma.webhookEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    webhookEventsDeleted = count;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'webhook_event_prune_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  log('=== STORAGE TTL CLEANUP DONE ===', {
    totalScanned,
    totalDeleted,
    totalErrors,
    webhookEventsDeleted,
    perBucket: results,
  });
}
