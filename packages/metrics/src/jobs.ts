import { Counter, Histogram } from 'prom-client';
import { registry } from './registry.js';

/**
 * Buckets span three orders of magnitude because these queues do not have one
 * shape: a session timeout finishes in milliseconds, while a single image can
 * take seven minutes through the full generation pipeline. Default buckets top
 * out at 10s and would put every image job in +Inf.
 */
const DURATION_BUCKETS = [0.1, 0.5, 1, 5, 15, 30, 60, 120, 300, 600, 900];

export const jobDuration = new Histogram({
  name: 'autmn_job_duration_seconds',
  help: 'Time a queue job spent being processed',
  labelNames: ['queue', 'outcome'] as const,
  buckets: DURATION_BUCKETS,
  registers: [registry],
});

export const jobsTotal = new Counter({
  name: 'autmn_jobs_total',
  help: 'Queue jobs by terminal outcome',
  labelNames: ['queue', 'outcome'] as const,
  registers: [registry],
});

/**
 * Wraps a processor so every path through it is recorded, including the
 * throwing one. Returning the timing from a finally block rather than after the
 * await is deliberate — a failed job that took six minutes is exactly the
 * measurement worth having.
 */
export function instrumentProcessor<A extends unknown[], R>(
  queue: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const start = process.hrtime.bigint();
    let outcome: 'completed' | 'failed' = 'completed';
    try {
      return await fn(...args);
    } catch (err) {
      outcome = 'failed';
      throw err;
    } finally {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      jobDuration.labels(queue, outcome).observe(seconds);
      jobsTotal.labels(queue, outcome).inc();
    }
  };
}
