-- Brand details collapsed to a single "brand colours" question — the guided
-- multi-step flow (and its step counter) is gone.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "brand_details_step";
