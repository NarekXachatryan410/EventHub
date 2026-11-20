ALTER TYPE "CrmSyncStatus" ADD VALUE 'PROCESSING';
ALTER TABLE "CrmSyncLog" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "CrmSyncLog" ("id", "registrationId", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), registration."id", 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "EventRegistration" AS registration
ON CONFLICT ("registrationId") DO NOTHING;
