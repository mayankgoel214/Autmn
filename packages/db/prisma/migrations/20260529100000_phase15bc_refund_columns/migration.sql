-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "razorpay_refund_error" TEXT,
ADD COLUMN     "razorpay_refund_id" TEXT,
ADD COLUMN     "short_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_short_id_key" ON "orders"("short_id");

