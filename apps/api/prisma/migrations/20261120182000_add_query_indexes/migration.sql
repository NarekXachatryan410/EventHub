CREATE INDEX "EventRegistration_eventId_registeredAt_idx"
    ON "EventRegistration"("eventId", "registeredAt");

CREATE INDEX "EmailLog_status_scheduledAt_idx"
    ON "EmailLog"("status", "scheduledAt");

CREATE INDEX "CrmSyncLog_status_attempts_lastAttemptAt_idx"
    ON "CrmSyncLog"("status", "attempts", "lastAttemptAt");
