export const QueueNames = {
  IMAGE_PROCESSING: "image-processing",
  PAYMENT_CHECK: "payment-check",
  SESSION_TIMEOUT: "session-timeout",
  BRAND_ANALYSIS: "brand-analysis",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
