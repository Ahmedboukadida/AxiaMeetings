-- Performance: PostgreSQL does not index foreign keys automatically.
-- These cover the filters/joins used on every meeting page, live room
-- (vote tallies by point_id, participant lookups), overview and logs.
-- IF NOT EXISTS keeps it safe on databases where some were added by hand.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ia_token_usage_token_id_idx" ON "ia_token_usage"("token_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "companies_apis_company_id_idx" ON "companies_apis"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_points_meeting_id_idx" ON "meetings_points"("meeting_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_documents_meeting_id_idx" ON "meetings_documents"("meeting_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_participants_meeting_id_idx" ON "meetings_participants"("meeting_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_participants_email_idx" ON "meetings_participants"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_invitations_meeting_id_idx" ON "meetings_invitations"("meeting_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_invitations_meetings_participant_id_idx" ON "meetings_invitations"("meetings_participant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_attendances_meeting_id_idx" ON "meetings_attendances"("meeting_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_attendances_meetings_participant_id_idx" ON "meetings_attendances"("meetings_participant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_votes_point_id_idx" ON "meetings_votes"("point_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_votes_meetings_participant_id_idx" ON "meetings_votes"("meetings_participant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "logs_timestamp_idx" ON "logs"("timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_turn_requests_meeting_id_status_idx" ON "meetings_turn_requests"("meeting_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_turn_requests_meetings_participant_id_idx" ON "meetings_turn_requests"("meetings_participant_id");
