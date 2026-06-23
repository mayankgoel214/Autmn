-- Guided brand-details flow — tracks which of the 3 questions
-- (0 = colours, 1 = logo, 2 = tagline) the user is currently on.
ALTER TABLE "sessions" ADD COLUMN "brand_details_step" INTEGER NOT NULL DEFAULT 0;
