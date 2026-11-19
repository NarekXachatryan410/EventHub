/*
  Warnings:

  - You are about to drop the column `coverImageUrl` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `endsAt` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `Event` table. All the data in the column will be lost.
  - Added the required column `endDate` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'CHECKED_IN', 'CANCELLED', 'INVALID');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('REGISTRATION_CONFIRMATION', 'EVENT_REMINDER', 'REGISTRATION_CANCELLATION', 'EVENT_CANCELLATION', 'POST_EVENT_THANK_YOU', 'FEEDBACK_REQUEST', 'EVENT_MATERIALS');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- DropIndex
DROP INDEX "Event_status_startsAt_idx";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "coverImageUrl",
DROP COLUMN "endsAt",
DROP COLUMN "startsAt",
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "endDate" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMPTZ(6) NOT NULL;

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "checkedInBy" UUID NOT NULL,
    "checkedInAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "templateId" UUID,
    "type" "EmailType" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMPTZ(6),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "contentRating" INTEGER,
    "organizationRating" INTEGER,
    "comment" TEXT,
    "interestedInPrograms" BOOLEAN,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_normalizedEmail_key" ON "EventRegistration"("eventId", "normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_registrationId_key" ON "Ticket"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tokenHash_key" ON "Ticket"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_ticketId_key" ON "CheckIn"("ticketId");

-- CreateIndex
CREATE INDEX "CheckIn_checkedInBy_checkedInAt_idx" ON "CheckIn"("checkedInBy", "checkedInAt");

-- CreateIndex
CREATE INDEX "EmailLog_registrationId_type_status_idx" ON "EmailLog"("registrationId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_registrationId_key" ON "Feedback"("registrationId");

-- CreateIndex
CREATE INDEX "Event_status_startDate_idx" ON "Event"("status", "startDate");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_checkedInBy_fkey" FOREIGN KEY ("checkedInBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
