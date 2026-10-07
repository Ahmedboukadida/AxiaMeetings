-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "users_roles" AS ENUM ('DEVELOPER', 'ADMIN', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "formated_response_type" AS ENUM ('PAYLOAD', 'RESPONSE');

-- CreateEnum
CREATE TYPE "meetings_types" AS ENUM ('ORDINAIRE', 'EXTRAORDINAIRE', 'COMPLEMENTAIRE', 'DELEGUES');

-- CreateEnum
CREATE TYPE "meetings_statut" AS ENUM ('SCHEDULED', 'CANCELLED', 'STARTED', 'FINISHED');

-- CreateEnum
CREATE TYPE "meetings_modes" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "meetings_isonline" AS ENUM ('TRUE', 'FALSE');

-- CreateEnum
CREATE TYPE "meetings_duration" AS ENUM ('ONE_HOUR', 'TWO_HOURS', 'THREE_HOURS', 'FOUR_HOURS', 'FIVE_HOURS');

-- CreateEnum
CREATE TYPE "meetings_points_types" AS ENUM ('SIMPLE', 'VOTE');

-- CreateEnum
CREATE TYPE "meetings_invitations_response_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "meetings_attendances_status" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "meetings_votes_response" AS ENUM ('OUI', 'NON', 'NEUTRE');

-- CreateEnum
CREATE TYPE "turn_request_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FINISHED');

-- CreateTable
CREATE TABLE "app_settings" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "email_password" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "ssl" BOOLEAN NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "contact_adress" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "facebook" TEXT,
    "favicon_file_name" TEXT,
    "linkedin" TEXT,
    "logo_file_name" TEXT,
    "tiktok" TEXT,
    "term_of_use" TEXT,
    "privacy_policy" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_tokens_keys" (
    "id" SERIAL NOT NULL,
    "provider" TEXT,
    "name" TEXT,
    "credit_limit" TEXT,
    "expiration" TIMESTAMP(3),
    "websocket_url" TEXT,
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT,
    "project_name" TEXT,
    "project_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_tokens_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_token_usage" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "feature" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ia_token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "references" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logo_file_name" TEXT NOT NULL,
    "website" TEXT NOT NULL,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price_month" DOUBLE PRECISION NOT NULL,
    "price_year" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packs_lines" (
    "id" SERIAL NOT NULL,
    "pack_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "packs_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "database_schema" TEXT NOT NULL,
    "have_notifications_service" BOOLEAN NOT NULL DEFAULT false,
    "notifications_service_endpoint_id" INTEGER,
    "have_messages_service" BOOLEAN NOT NULL DEFAULT false,
    "messages_service_endpoint_id" INTEGER,
    "have_sms_service" BOOLEAN NOT NULL DEFAULT false,
    "sms_service_endpoint_id" INTEGER,
    "mail_is_active" BOOLEAN NOT NULL DEFAULT false,
    "have_mail_service" BOOLEAN NOT NULL DEFAULT false,
    "push_mails_endpoint_id" INTEGER,
    "login_endpoint_id" INTEGER,
    "users_endpoint_id" INTEGER,
    "ai_is_active" BOOLEAN NOT NULL DEFAULT false,
    "meeting_time_limit" "meetings_duration" DEFAULT 'ONE_HOUR',
    "users_number_limit" INTEGER DEFAULT 10,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies_apis" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload_example" JSONB,
    "method" TEXT NOT NULL,
    "response_example" JSONB,
    "company_id" INTEGER NOT NULL,

    CONSTRAINT "companies_apis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formated_response" (
    "id" SERIAL NOT NULL,
    "endpoint_id" INTEGER NOT NULL,
    "response_key" TEXT NOT NULL,
    "formated_response_key" TEXT NOT NULL,
    "format_for" "formated_response_type" NOT NULL DEFAULT 'RESPONSE',

    CONSTRAINT "formated_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "meetings_types" NOT NULL DEFAULT 'ORDINAIRE',
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "mode" "meetings_modes" NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT NOT NULL DEFAULT '',
    "duration" "meetings_duration" NOT NULL DEFAULT 'ONE_HOUR',
    "description" TEXT,
    "isonline" "meetings_isonline" NOT NULL DEFAULT 'FALSE',
    "status" "meetings_statut" NOT NULL DEFAULT 'SCHEDULED',
    "creator_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editor_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" INTEGER NOT NULL,
    "summary" TEXT,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_points" (
    "id" SERIAL NOT NULL,
    "point" TEXT NOT NULL,
    "description" TEXT,
    "type" "meetings_points_types" NOT NULL DEFAULT 'SIMPLE',
    "meeting_id" INTEGER NOT NULL,
    "parent_id" INTEGER,

    CONSTRAINT "meetings_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_documents" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "file_title" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,

    CONSTRAINT "meetings_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_participants" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "meetings_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "fullname" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT,
    "role" "users_roles" DEFAULT 'PARTICIPANT',
    "company_id" INTEGER,
    "identifiant_extern" INTEGER,
    "phone" TEXT,
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_invitations" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "meetings_participant_id" INTEGER NOT NULL,
    "meetings_invitation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "meetings_invitations_response_status" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "meetings_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_attendances" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "meetings_participant_id" INTEGER NOT NULL,
    "meetings_attendances_status" "meetings_attendances_status" NOT NULL DEFAULT 'ABSENT',

    CONSTRAINT "meetings_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_votes" (
    "id" SERIAL NOT NULL,
    "point_id" INTEGER NOT NULL,
    "meetings_participant_id" INTEGER NOT NULL,
    "vote" "meetings_votes_response" NOT NULL DEFAULT 'NEUTRE',

    CONSTRAINT "meetings_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request" JSONB,
    "payload" JSONB,
    "response" JSONB,
    "user_id" INTEGER,
    "company_id" INTEGER,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies_admins_login" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "token_id" TEXT,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "identifiant_extern" INTEGER,

    CONSTRAINT "companies_admins_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings_turn_requests" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "meetings_participant_id" INTEGER NOT NULL,
    "status" "turn_request_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_turn_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "role" TEXT,
    "messages" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "session_id" TEXT,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "sender_name" TEXT,
    "sender_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reply_content" TEXT,
    "replied_at" TIMESTAMP(3),

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_requests" (
    "id" SERIAL NOT NULL,
    "fullname" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_url" TEXT,
    "pack_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "provisioned_company_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ia_token_usage_used_at_idx" ON "ia_token_usage"("used_at");

-- CreateIndex
CREATE INDEX "meetings_company_id_idx" ON "meetings"("company_id");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "logs_user_id_idx" ON "logs"("user_id");

-- CreateIndex
CREATE INDEX "logs_company_id_idx" ON "logs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_session_id_key" ON "chat_sessions"("session_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "ia_token_usage" ADD CONSTRAINT "ia_token_usage_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "ia_tokens_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packs_lines" ADD CONSTRAINT "packs_lines_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_login_endpoint_id_fkey" FOREIGN KEY ("login_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_messages_service_endpoint_id_fkey" FOREIGN KEY ("messages_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_notifications_service_endpoint_id_fkey" FOREIGN KEY ("notifications_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_sms_service_endpoint_id_fkey" FOREIGN KEY ("sms_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_push_mails_endpoint_id_fkey" FOREIGN KEY ("push_mails_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_users_endpoint_id_fkey" FOREIGN KEY ("users_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies_apis" ADD CONSTRAINT "companies_apis_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formated_response" ADD CONSTRAINT "formated_response_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "companies_apis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_points" ADD CONSTRAINT "meetings_points_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_points" ADD CONSTRAINT "meetings_points_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "meetings_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_documents" ADD CONSTRAINT "meetings_documents_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_participants" ADD CONSTRAINT "meetings_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_invitations" ADD CONSTRAINT "meetings_invitations_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_invitations" ADD CONSTRAINT "meetings_invitations_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_attendances" ADD CONSTRAINT "meetings_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_attendances" ADD CONSTRAINT "meetings_attendances_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_votes" ADD CONSTRAINT "meetings_votes_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_votes" ADD CONSTRAINT "meetings_votes_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "meetings_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies_admins_login" ADD CONSTRAINT "companies_admins_login_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies_admins_login" ADD CONSTRAINT "companies_admins_login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_turn_requests" ADD CONSTRAINT "meetings_turn_requests_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_turn_requests" ADD CONSTRAINT "meetings_turn_requests_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
