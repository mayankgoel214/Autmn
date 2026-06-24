import { z } from "zod";

// ---------------------------------------------------------------------------
// Image Processing Job
// ---------------------------------------------------------------------------

export const ImageProcessingJobDataSchema = z.object({
  orderId: z.string().uuid(),
  imageJobId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  inputImageUrl: z.string().url(),
  style: z.string().optional(),
  voiceInstructions: z.string().optional(),
  originalVoiceInstructions: z.string().optional(),
  productCategory: z.string().optional(),
  brandName: z.string().optional(),
  pipeline: z.enum(["primary", "fallback", "nano_banana", "segmentation", "bria", "composite"]).default("composite"),
});

export type ImageProcessingJobData = z.infer<typeof ImageProcessingJobDataSchema>;

// ---------------------------------------------------------------------------
// Payment Check Job
// ---------------------------------------------------------------------------

export const PaymentCheckJobDataSchema = z.object({
  orderId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  paymentLinkId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
});

export type PaymentCheckJobData = z.infer<typeof PaymentCheckJobDataSchema>;

// ---------------------------------------------------------------------------
// Session Timeout Job
// ---------------------------------------------------------------------------

export const SessionTimeoutJobDataSchema = z.object({
  phoneNumber: z.string().min(10),
  expectedState: z.string().min(1),
  action: z.enum(["nudge", "expire", "advance_images", "advance_photos", "show_photo_buttons", "nudge_photo_ready"]),
  expectedImageCount: z.number().int().nonnegative().optional(),
});

export type SessionTimeoutJobData = z.infer<typeof SessionTimeoutJobDataSchema>;

// ---------------------------------------------------------------------------
// Storage TTL Cleanup Job — DPDP compliance.
//
// Fired by a BullMQ repeating schedule (see apps/worker/src/index.ts).
// One job sweeps every bucket in `buckets`. Each entry pairs a bucket
// name with its retention window in milliseconds; objects older than
// that are deleted. Worker-side default is 30 days for customer-supplied
// content (raw-images, voice-notes, refund-reasons).
// ---------------------------------------------------------------------------

export const StorageCleanupJobDataSchema = z.object({
  buckets: z
    .array(
      z.object({
        bucket: z.string().min(1),
        maxAgeMs: z.number().int().positive(),
      }),
    )
    .min(1),
});

export type StorageCleanupJobData = z.infer<typeof StorageCleanupJobDataSchema>;

// ---------------------------------------------------------------------------
// Union helpers — useful for worker type narrowing
// ---------------------------------------------------------------------------

export type AnyJobData =
  | ImageProcessingJobData
  | PaymentCheckJobData
  | SessionTimeoutJobData
  | StorageCleanupJobData;
