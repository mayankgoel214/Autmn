-- Order-level dedup latch for the one-time "taking longer than usual" notice.
ALTER TABLE "orders" ADD COLUMN "retry_notice_sent_at" TIMESTAMP(3);
