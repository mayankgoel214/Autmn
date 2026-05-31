import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.js";
import { QueueNames } from "./names.js";
import type {
  ImageProcessingJobData,
  PaymentCheckJobData,
  SessionTimeoutJobData,
  BrandAnalysisJobData,
  StorageCleanupJobData,
} from "./jobs.js";

// Shared default job options applied to all queues
const defaultJobOptions = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2000 },
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5000,
  },
} as const;

// ---------------------------------------------------------------------------
// Lazy singletons — instantiated on first call so that importing this module
// at the top level (before env vars are loaded) does not throw.
// ---------------------------------------------------------------------------

let _imageQueue: Queue<ImageProcessingJobData> | null = null;
let _paymentCheckQueue: Queue<PaymentCheckJobData> | null = null;
let _sessionTimeoutQueue: Queue<SessionTimeoutJobData> | null = null;
let _brandAnalysisQueue: Queue<BrandAnalysisJobData> | null = null;
let _storageCleanupQueue: Queue<StorageCleanupJobData> | null = null;

export function getImageQueue(): Queue<ImageProcessingJobData> {
  if (!_imageQueue) {
    _imageQueue = new Queue<ImageProcessingJobData>(QueueNames.IMAGE_PROCESSING, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }
  return _imageQueue;
}

export function getPaymentCheckQueue(): Queue<PaymentCheckJobData> {
  if (!_paymentCheckQueue) {
    _paymentCheckQueue = new Queue<PaymentCheckJobData>(QueueNames.PAYMENT_CHECK, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        // Payment checks have tighter retry windows — UPI times out in 5 min
        attempts: 5,
        backoff: {
          type: "fixed" as const,
          delay: 60_000, // 1 minute between each poll attempt
        },
      },
    });
  }
  return _paymentCheckQueue;
}

export function getSessionTimeoutQueue(): Queue<SessionTimeoutJobData> {
  if (!_sessionTimeoutQueue) {
    _sessionTimeoutQueue = new Queue<SessionTimeoutJobData>(
      QueueNames.SESSION_TIMEOUT,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          ...defaultJobOptions,
          // Timeouts are fire-and-check — a single attempt is enough; the
          // worker validates expectedState before acting, so retries are safe.
          attempts: 2,
        },
      }
    );
  }
  return _sessionTimeoutQueue;
}

export function getBrandAnalysisQueue(): Queue<BrandAnalysisJobData> {
  if (!_brandAnalysisQueue) {
    _brandAnalysisQueue = new Queue<BrandAnalysisJobData>(
      QueueNames.BRAND_ANALYSIS,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          ...defaultJobOptions,
          // AI calls + Playwright can transiently fail; allow generous retries
          // with exponential backoff so a single Gemini blip doesn't drop the
          // brand profile silently.
          attempts: 4,
          backoff: {
            type: "exponential" as const,
            delay: 10_000,
          },
        },
      }
    );
  }
  return _brandAnalysisQueue;
}

export function getStorageCleanupQueue(): Queue<StorageCleanupJobData> {
  if (!_storageCleanupQueue) {
    _storageCleanupQueue = new Queue<StorageCleanupJobData>(
      QueueNames.STORAGE_CLEANUP,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          // Repeating cron job — if a sweep fails (Supabase outage etc),
          // skip and wait for the next scheduled run. Retrying inside the
          // same window risks re-listing buckets we just half-processed.
          attempts: 1,
          // Keep more history than the other queues — auditors may want to
          // see N nightly runs to confirm DPDP retention is enforced.
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 200 },
        },
      },
    );
  }
  return _storageCleanupQueue;
}
