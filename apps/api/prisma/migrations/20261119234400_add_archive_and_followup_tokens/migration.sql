ALTER TYPE "EventStatus" ADD VALUE 'ARCHIVED';
ALTER TYPE "EmailStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "Ticket" ADD COLUMN "feedbackTokenHash" TEXT;
CREATE UNIQUE INDEX "Ticket_feedbackTokenHash_key" ON "Ticket"("feedbackTokenHash");
