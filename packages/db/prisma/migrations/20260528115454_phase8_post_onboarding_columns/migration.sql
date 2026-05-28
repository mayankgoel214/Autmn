-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "amount_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "instruction_mapping_json" JSONB,
ADD COLUMN     "is_first_free" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "num_styles_picked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rated_at" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "refund_decided_at" TIMESTAMP(3),
ADD COLUMN     "refund_decision_note" TEXT,
ADD COLUMN     "refund_reason" TEXT,
ADD COLUMN     "refund_reason_voice_url" TEXT,
ADD COLUMN     "refund_requested_at" TIMESTAMP(3),
ADD COLUMN     "refund_status" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "pending_instructions" TEXT,
ADD COLUMN     "pending_instructions_voice_url" TEXT,
ADD COLUMN     "pending_mapping" JSONB;
