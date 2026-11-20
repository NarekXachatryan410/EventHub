CREATE TYPE "PlanningTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

CREATE TABLE "PlanningTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "EventType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "PlanningTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningTemplateTask" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "daysBeforeEvent" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PlanningTemplateTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventPlanningChecklist" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "templateId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "EventPlanningChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningTask" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedToId" UUID,
    "dueAt" TIMESTAMPTZ(6),
    "status" "PlanningTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "PlanningTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPlanningChecklist_eventId_key" ON "EventPlanningChecklist"("eventId");
CREATE INDEX "PlanningTemplate_eventType_isSystem_idx" ON "PlanningTemplate"("eventType", "isSystem");
CREATE INDEX "PlanningTemplateTask_templateId_position_idx" ON "PlanningTemplateTask"("templateId", "position");
CREATE INDEX "PlanningTask_checklistId_status_dueAt_idx" ON "PlanningTask"("checklistId", "status", "dueAt");
CREATE INDEX "PlanningTask_assignedToId_status_idx" ON "PlanningTask"("assignedToId", "status");

ALTER TABLE "PlanningTemplate"
    ADD CONSTRAINT "PlanningTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningTemplateTask"
    ADD CONSTRAINT "PlanningTemplateTask_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PlanningTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPlanningChecklist"
    ADD CONSTRAINT "EventPlanningChecklist_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPlanningChecklist"
    ADD CONSTRAINT "EventPlanningChecklist_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PlanningTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningTask"
    ADD CONSTRAINT "PlanningTask_checklistId_fkey"
    FOREIGN KEY ("checklistId") REFERENCES "EventPlanningChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningTask"
    ADD CONSTRAINT "PlanningTask_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PlanningTemplate" ("id", "name", "description", "eventType", "isSystem", "updatedAt")
VALUES
    ('c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Graduation ceremony', 'Plan the ceremony, guest experience, and day-of operations.', 'GRADUATION_CEREMONY', true, CURRENT_TIMESTAMP),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Guest visit', 'Coordinate a smooth and welcoming visit for guests.', 'GUEST_VISIT', true, CURRENT_TIMESTAMP),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Partner event', 'Prepare a collaborative event with an Academy partner.', 'MEETUP', true, CURRENT_TIMESTAMP);

INSERT INTO "PlanningTemplateTask" ("id", "templateId", "title", "daysBeforeEvent", "position")
VALUES
    ('c19d67e8-454d-4c0d-850d-cb32f3f25201', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Confirm ceremony date, venue, and capacity', 90, 0),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25202', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Plan stage, seating, and accessibility', 60, 1),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25203', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Coordinate graduate names, attire, and procession', 45, 2),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25204', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Send invitations and confirm guest counts', 30, 3),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25205', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Finalize catering, audio, and visual requirements', 14, 4),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25206', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Approve the run of show and assign day-of roles', 7, 5),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25207', 'c19d67e8-454d-4c0d-850d-cb32f3f25101', 'Complete venue walkthrough and print materials', 1, 6),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25208', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Confirm visit purpose, date, and schedule', 30, 0),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25209', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Confirm guest list and accessibility needs', 14, 1),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25210', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Assign a host and prepare the visit agenda', 7, 2),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25211', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Coordinate room access, catering, and security', 5, 3),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25212', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Test presentation equipment and prepare materials', 2, 4),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25213', 'c19d67e8-454d-4c0d-850d-cb32f3f25102', 'Confirm arrival instructions with all participants', 1, 5),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25214', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Agree on event outcomes, format, and agenda', 45, 0),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25215', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Confirm partner speakers and contributors', 30, 1),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25216', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Coordinate venue, equipment, and branding', 21, 2),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25217', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Publish invitations and align partner messaging', 14, 3),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25218', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Finalize attendee list, run of show, and owners', 2, 4),
    ('c19d67e8-454d-4c0d-850d-cb32f3f25219', 'c19d67e8-454d-4c0d-850d-cb32f3f25103', 'Prepare partner follow-up and outcome review', 0, 5);
