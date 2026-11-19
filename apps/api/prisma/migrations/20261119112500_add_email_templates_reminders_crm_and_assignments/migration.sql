-- CreateEnum
CREATE TYPE "CrmSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "providerId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "registrationQuestions" JSONB,
ADD COLUMN "reminderOffsetsHours" INTEGER[] DEFAULT ARRAY[24, 2]::INTEGER[];

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "additionalAnswers" JSONB,
ADD COLUMN "interestedInPrograms" BOOLEAN;

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" UUID NOT NULL,
    "type" "EmailType" NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStaffAssignment" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSyncLog" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "status" "CrmSyncStatus" NOT NULL DEFAULT 'PENDING',
    "contactId" TEXT,
    "leadId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(6),
    "syncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CrmSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_type_key" ON "EmailTemplate"("type");

-- CreateIndex
CREATE INDEX "EventStaffAssignment_staffId_idx" ON "EventStaffAssignment"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "EventStaffAssignment_eventId_staffId_key" ON "EventStaffAssignment"("eventId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncLog_registrationId_key" ON "CrmSyncLog"("registrationId");

-- CreateIndex
CREATE INDEX "CrmSyncLog_status_updatedAt_idx" ON "CrmSyncLog"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncLog" ADD CONSTRAINT "CrmSyncLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
