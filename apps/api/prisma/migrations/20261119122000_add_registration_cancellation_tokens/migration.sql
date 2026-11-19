-- AlterEnum
ALTER TYPE "EmailType" ADD VALUE 'WAITLIST_CONFIRMATION';

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "cancellationTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_cancellationTokenHash_key" ON "EventRegistration"("cancellationTokenHash");
