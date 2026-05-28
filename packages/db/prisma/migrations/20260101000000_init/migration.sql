-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('IDLE', 'SETUP_LANGUAGE', 'SETUP_NAME', 'SETUP_CATEGORY', 'SETUP_CATEGORY_OTHER', 'SETUP_STYLE', 'AWAITING_PHOTO', 'AWAITING_PAYMENT', 'PROCESSING', 'DELIVERED', 'EDIT_PROCESSING', 'AWAITING_REVISION_PAYMENT', 'CHANGE_SETTINGS_MENU', 'BRAND_DETAILS_COLLECTING', 'BRAND_DETAILS_EDITING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'payment_pending', 'payment_confirmed', 'processing', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'captured', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "JobPipeline" AS ENUM ('primary', 'fallback', 'kontext', 'segmentation', 'bria', 'nano_banana', 'composite', 'video_multi_shot');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('whatsapp', 'razorpay');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT,
    "brand_name" TEXT,
    "brand_tone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'hinglish',
    "business_type" TEXT,
    "style_preference" TEXT,
    "last_style_used" TEXT,
    "style_history" JSONB,
    "saved_styles" JSONB,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "total_images" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'IDLE',
    "current_order_id" UUID,
    "style_selection" TEXT,
    "style_selections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "style_pick_step" INTEGER NOT NULL DEFAULT 0,
    "voice_instructions" TEXT,
    "image_media_ids" TEXT[],
    "image_storage_urls" TEXT[],
    "early_photo_media_id" TEXT,
    "pending_edit_style" TEXT,
    "pending_edit_instructions" TEXT,
    "in_change_settings" BOOLEAN NOT NULL DEFAULT false,
    "last_user_message_at" TIMESTAMP(3),
    "state_entered_at" TIMESTAMP(3),
    "csw_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "image_count" INTEGER NOT NULL DEFAULT 1,
    "style" TEXT,
    "styles_ordered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product_profile" JSONB,
    "primary_input_image_url" TEXT,
    "output_style_count" INTEGER NOT NULL DEFAULT 1,
    "voice_instructions" TEXT,
    "input_image_urls" TEXT[],
    "output_image_urls" TEXT[],
    "cutout_urls" TEXT[],
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "amount" INTEGER NOT NULL,
    "revisions_used" INTEGER NOT NULL DEFAULT 0,
    "max_free_revisions" INTEGER NOT NULL DEFAULT 2,
    "razorpay_payment_link_id" TEXT,
    "razorpay_payment_link_url" TEXT,
    "razorpay_payment_id" TEXT,
    "razorpay_revision_link_id" TEXT,
    "razorpay_revision_link_url" TEXT,
    "qa_best_score" DOUBLE PRECISION,
    "qa_attempts" INTEGER NOT NULL DEFAULT 0,
    "product_category" TEXT,
    "processing_started_at" TIMESTAMP(3),
    "processing_completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "razorpay_payment_id" TEXT NOT NULL,
    "razorpay_payment_link_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "order_id" UUID NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "razorpay_refund_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_id" UUID NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_jobs" (
    "id" UUID NOT NULL,
    "input_image_url" TEXT NOT NULL,
    "output_image_url" TEXT,
    "cutout_url" TEXT,
    "style" TEXT,
    "style_index" INTEGER,
    "revisions_used" INTEGER NOT NULL DEFAULT 0,
    "max_free_revisions" INTEGER NOT NULL DEFAULT 1,
    "prompt_used" TEXT,
    "pipeline" "JobPipeline" NOT NULL DEFAULT 'primary',
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "qa_score" DOUBLE PRECISION,
    "qa_attempts" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "video_output_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "order_id" UUID NOT NULL,

    CONSTRAINT "image_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_messages" (
    "message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "event_type" TEXT NOT NULL,
    "external_id" TEXT,
    "raw_payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "style_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "category_overrides" JSONB,
    "avg_qa_score" DOUBLE PRECISION,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "logoUrl" TEXT,
    "tagline" TEXT,
    "brandColors" TEXT[],
    "vibe" TEXT,
    "websiteUrl" TEXT,
    "summary" TEXT,
    "summaryUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_assets" (
    "id" UUID NOT NULL,
    "brandProfileId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "storageUrl" TEXT,
    "rawText" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "aiDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_summary_versions" (
    "id" UUID NOT NULL,
    "brandProfileId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_summary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_phone_number_key" ON "sessions"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_user_id_key" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "orders_phone_number_idx" ON "orders"("phone_number");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_razorpay_payment_link_id_idx" ON "orders"("razorpay_payment_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_razorpay_refund_id_key" ON "refunds"("razorpay_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "image_jobs_order_id_idx" ON "image_jobs"("order_id");

-- CreateIndex
CREATE INDEX "image_jobs_status_idx" ON "image_jobs"("status");

-- CreateIndex
CREATE INDEX "webhook_events_source_event_type_idx" ON "webhook_events"("source", "event_type");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");

-- CreateIndex
CREATE INDEX "prompt_templates_style_id_active_idx" ON "prompt_templates"("style_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_style_id_version_key" ON "prompt_templates"("style_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_userId_key" ON "brand_profiles"("userId");

-- CreateIndex
CREATE INDEX "brand_assets_brandProfileId_idx" ON "brand_assets"("brandProfileId");

-- CreateIndex
CREATE INDEX "brand_summary_versions_brandProfileId_createdAt_idx" ON "brand_summary_versions"("brandProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_summary_versions" ADD CONSTRAINT "brand_summary_versions_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

