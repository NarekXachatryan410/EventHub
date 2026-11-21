CREATE TYPE "CrmCustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CrmActivityType" AS ENUM (
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'REGISTRATION_CREATED',
  'TICKET_CANCELLED',
  'CHECKED_IN',
  'ATTENDED',
  'NOTE_ADDED',
  'REMINDER_CREATED',
  'REMINDER_COMPLETED',
  'COMMUNICATION_RECORDED'
);
CREATE TYPE "CrmReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CrmCommunicationChannel" AS ENUM ('EMAIL', 'PHONE_CALL', 'MEETING', 'OTHER');
CREATE TYPE "CrmCommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CrmCommunicationStatus" AS ENUM ('RECORDED', 'PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

ALTER TABLE "EventRegistration" ADD COLUMN "crmCustomerId" UUID;

CREATE TABLE "CrmCustomer" (
  "id" UUID NOT NULL,
  "organizerId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "birthday" DATE,
  "profileImageUrl" TEXT,
  "status" "CrmCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "marketingConsentAt" TIMESTAMPTZ(6),
  "marketingConsentSource" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CrmCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCustomerNote" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "authorId" UUID,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CrmCustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCustomerActivity" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "actorId" UUID,
  "eventId" UUID,
  "type" "CrmActivityType" NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "sourceKey" TEXT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCustomerActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCustomerTag" (
  "id" UUID NOT NULL,
  "organizerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'indigo',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCustomerTagAssignment" (
  "customerId" UUID NOT NULL,
  "tagId" UUID NOT NULL,
  "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCustomerTagAssignment_pkey" PRIMARY KEY ("customerId", "tagId")
);

CREATE TABLE "CrmCustomerSegment" (
  "id" UUID NOT NULL,
  "organizerId" UUID NOT NULL,
  "createdById" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "criteria" JSONB NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CrmCustomerSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCustomerSegmentMembership" (
  "segmentId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "matchedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCustomerSegmentMembership_pkey" PRIMARY KEY ("segmentId", "customerId")
);

CREATE TABLE "CrmCustomerReminder" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "assignedToId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "CrmReminderStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CrmCustomerReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCommunicationRecord" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "createdById" UUID,
  "channel" "CrmCommunicationChannel" NOT NULL,
  "direction" "CrmCommunicationDirection" NOT NULL,
  "status" "CrmCommunicationStatus" NOT NULL DEFAULT 'RECORDED',
  "subject" TEXT,
  "summary" TEXT NOT NULL,
  "providerId" TEXT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCommunicationRecord_pkey" PRIMARY KEY ("id")
);

-- Create one CRM customer for each unique organizer/email pair.
INSERT INTO "CrmCustomer" (
  "id", "organizerId", "email", "normalizedEmail", "firstName", "lastName",
  "phone", "marketingConsent", "marketingConsentAt", "marketingConsentSource",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  event."organizerId",
  (array_agg(registration."email" ORDER BY registration."registeredAt" ASC))[1],
  LOWER(BTRIM(registration."email")),
  (array_agg(registration."firstName" ORDER BY registration."registeredAt" ASC))[1],
  (array_agg(registration."lastName" ORDER BY registration."registeredAt" ASC))[1],
  (array_agg(registration."phone" ORDER BY registration."registeredAt" ASC) FILTER (WHERE registration."phone" IS NOT NULL))[1],
  BOOL_OR(registration."marketingConsent"),
  MIN(registration."registeredAt") FILTER (WHERE registration."marketingConsent"),
  CASE WHEN BOOL_OR(registration."marketingConsent") THEN 'EVENT_REGISTRATION' ELSE NULL END,
  MIN(registration."registeredAt"),
  CURRENT_TIMESTAMP
FROM "EventRegistration" AS registration
JOIN "Event" AS event ON event."id" = registration."eventId"
GROUP BY event."organizerId", LOWER(BTRIM(registration."email"));

UPDATE "EventRegistration" AS registration
SET "crmCustomerId" = customer."id"
FROM "Event" AS event, "CrmCustomer" AS customer
WHERE event."id" = registration."eventId"
  AND customer."organizerId" = event."organizerId"
  AND customer."normalizedEmail" = LOWER(BTRIM(registration."email"));

INSERT INTO "CrmCustomerActivity" (
  "id", "customerId", "eventId", "type", "summary", "metadata", "sourceKey", "occurredAt"
)
SELECT
  gen_random_uuid(),
  registration."crmCustomerId",
  event."id",
  'REGISTRATION_CREATED',
  'Registered for ' || event."title",
  jsonb_build_object('registrationStatus', registration."status"::text, 'eventTitle', event."title"),
  'registration-created:' || registration."id"::text,
  registration."registeredAt"
FROM "EventRegistration" AS registration
JOIN "Event" AS event ON event."id" = registration."eventId"
WHERE registration."crmCustomerId" IS NOT NULL;

CREATE UNIQUE INDEX "CrmCustomer_organizerId_normalizedEmail_key"
  ON "CrmCustomer"("organizerId", "normalizedEmail");
CREATE INDEX "CrmCustomer_organizerId_status_createdAt_idx"
  ON "CrmCustomer"("organizerId", "status", "createdAt");
CREATE INDEX "CrmCustomer_organizerId_lastName_firstName_idx"
  ON "CrmCustomer"("organizerId", "lastName", "firstName");
CREATE INDEX "EventRegistration_crmCustomerId_registeredAt_idx"
  ON "EventRegistration"("crmCustomerId", "registeredAt");
CREATE INDEX "CrmCustomerNote_customerId_createdAt_idx"
  ON "CrmCustomerNote"("customerId", "createdAt");
CREATE UNIQUE INDEX "CrmCustomerActivity_sourceKey_key"
  ON "CrmCustomerActivity"("sourceKey");
CREATE INDEX "CrmCustomerActivity_customerId_occurredAt_idx"
  ON "CrmCustomerActivity"("customerId", "occurredAt");
CREATE INDEX "CrmCustomerActivity_eventId_occurredAt_idx"
  ON "CrmCustomerActivity"("eventId", "occurredAt");
CREATE UNIQUE INDEX "CrmCustomerTag_organizerId_name_key"
  ON "CrmCustomerTag"("organizerId", "name");
CREATE INDEX "CrmCustomerTag_organizerId_name_idx"
  ON "CrmCustomerTag"("organizerId", "name");
CREATE INDEX "CrmCustomerTagAssignment_tagId_customerId_idx"
  ON "CrmCustomerTagAssignment"("tagId", "customerId");
CREATE UNIQUE INDEX "CrmCustomerSegment_organizerId_name_key"
  ON "CrmCustomerSegment"("organizerId", "name");
CREATE INDEX "CrmCustomerSegment_organizerId_isSystem_name_idx"
  ON "CrmCustomerSegment"("organizerId", "isSystem", "name");
CREATE INDEX "CrmCustomerSegmentMembership_customerId_segmentId_idx"
  ON "CrmCustomerSegmentMembership"("customerId", "segmentId");
CREATE INDEX "CrmCustomerReminder_customerId_dueAt_status_idx"
  ON "CrmCustomerReminder"("customerId", "dueAt", "status");
CREATE INDEX "CrmCustomerReminder_assignedToId_dueAt_status_idx"
  ON "CrmCustomerReminder"("assignedToId", "dueAt", "status");
CREATE INDEX "CrmCommunicationRecord_customerId_occurredAt_idx"
  ON "CrmCommunicationRecord"("customerId", "occurredAt");
CREATE INDEX "CrmCommunicationRecord_status_occurredAt_idx"
  ON "CrmCommunicationRecord"("status", "occurredAt");

ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_crmCustomerId_fkey"
  FOREIGN KEY ("crmCustomerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerNote" ADD CONSTRAINT "CrmCustomerNote_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerNote" ADD CONSTRAINT "CrmCustomerNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerActivity" ADD CONSTRAINT "CrmCustomerActivity_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerActivity" ADD CONSTRAINT "CrmCustomerActivity_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerActivity" ADD CONSTRAINT "CrmCustomerActivity_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerTag" ADD CONSTRAINT "CrmCustomerTag_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerTagAssignment" ADD CONSTRAINT "CrmCustomerTagAssignment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerTagAssignment" ADD CONSTRAINT "CrmCustomerTagAssignment_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "CrmCustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerSegment" ADD CONSTRAINT "CrmCustomerSegment_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerSegment" ADD CONSTRAINT "CrmCustomerSegment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerSegmentMembership" ADD CONSTRAINT "CrmCustomerSegmentMembership_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "CrmCustomerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerSegmentMembership" ADD CONSTRAINT "CrmCustomerSegmentMembership_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerReminder" ADD CONSTRAINT "CrmCustomerReminder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerReminder" ADD CONSTRAINT "CrmCustomerReminder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmCustomerReminder" ADD CONSTRAINT "CrmCustomerReminder_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCommunicationRecord" ADD CONSTRAINT "CrmCommunicationRecord_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCommunicationRecord" ADD CONSTRAINT "CrmCommunicationRecord_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
