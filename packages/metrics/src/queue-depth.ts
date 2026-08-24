import { Gauge } from 'prom-client';
import {
  QueueNames,
  getImageQueue,
  getPaymentCheckQueue,
  getSessionTimeoutQueue,
  getStorageCleanupQueue,
} from '@autmn/queue';
import { registry } from './registry.js';

/**
 * Only the one method is used, so this is typed structurally rather than by
 * depending on bullmq here purely for a type import.
 */
interface CountsReader {
  getJobCounts(...states: string[]): Promise<Record<string, number>>;
}

const STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

const QUEUES: Array<[string, () => CountsReader]> = [
  [QueueNames.IMAGE_PROCESSING, getImageQueue],
  [QueueNames.PAYMENT_CHECK, getPaymentCheckQueue],
  [QueueNames.SESSION_TIMEOUT, getSessionTimeoutQueue],
  [QueueNames.STORAGE_CLEANUP, getStorageCleanupQueue],
];

/**
 * Queue depth is the operational signal for this system: an image job takes
 * minutes and three run at a time, so a backlog is the first visible sign that
 * something upstream broke — long before any error rate moves.
 *
 * Read from Redis when Prometheus scrapes rather than on a timer, so a sample
 * is never stale, and one failing read cannot take the endpoint down with it.
 */
export const queueDepth = new Gauge({
  name: 'autmn_queue_depth',
  help: 'Jobs in each queue by state',
  labelNames: ['queue', 'state'] as const,
  registers: [registry],
  collect: async function () {
    await Promise.all(
      QUEUES.map(async ([name, getQueue]) => {
        try {
          const counts = await getQueue().getJobCounts(...STATES);
          for (const state of STATES) {
            this.labels(name, state).set(counts[state] ?? 0);
          }
        } catch {
          // Redis unreachable, or this queue was never created in this process.
          // Reporting nothing is honest; reporting zero would read as an empty
          // queue rather than an unknown one.
        }
      }),
    );
  },
});
