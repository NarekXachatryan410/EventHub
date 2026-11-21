ALTER TABLE "EmailLog"
DROP CONSTRAINT "EmailLog_registrationId_fkey";

ALTER TABLE "EmailLog"
ALTER COLUMN "registrationId" DROP NOT NULL;

ALTER TABLE "EmailLog"
ADD CONSTRAINT "EmailLog_registrationId_fkey"
FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "EmailLog"
WHERE "registrationId" IN (
  SELECT registration."id"
  FROM "EventRegistration" AS registration
  INNER JOIN "Event" AS event ON event."id" = registration."eventId"
  WHERE event."status" IN ('REGISTRATION_CLOSED', 'CANCELLED')
)
AND "type" <> 'EVENT_CANCELLATION';

DELETE FROM "Event"
WHERE "status" IN ('REGISTRATION_CLOSED', 'CANCELLED');
