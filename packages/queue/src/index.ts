// Connection
export { getRedisConnection } from "./connection.js";

// Queue names
export { QueueNames } from "./names.js";
export type { QueueName } from "./names.js";

// Job schemas and types
export {
  ImageProcessingJobDataSchema,
  PaymentCheckJobDataSchema,
  SessionTimeoutJobDataSchema,
  BrandAnalysisJobDataSchema,
  StorageCleanupJobDataSchema,
} from "./jobs.js";
export type {
  ImageProcessingJobData,
  PaymentCheckJobData,
  SessionTimeoutJobData,
  BrandAnalysisJobData,
  StorageCleanupJobData,
  AnyJobData,
} from "./jobs.js";

// Queue instances
export {
  getImageQueue,
  getPaymentCheckQueue,
  getSessionTimeoutQueue,
  getBrandAnalysisQueue,
  getStorageCleanupQueue,
} from "./queues.js";
