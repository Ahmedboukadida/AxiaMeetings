-- CreateEnum
CREATE TYPE "default_status" AS ENUM ('ACTIVE', 'INACTIVE');

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
CREATE TYPE "users_roles" AS ENUM ('DEVELOPER', 'ADMIN', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "meetings_invitations_response_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "meetings_attendances_status" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "meetings_votes_response" AS ENUM ('OUI', 'NON', 'NEUTRE');

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

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "formated_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "meetings_types" NOT NULL DEFAULT 'ORDINAIRE',
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "mode" "meetings_modes" NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT NOT NULL DEFAULT '',
    "duration" "meetings_duration" NOT NULL DEFAULT 'ONE_HOUR',
    "description" TEXT NOT NULL,
    "isonline" "meetings_isonline" NOT NULL DEFAULT 'FALSE',
    "status" "meetings_statut" NOT NULL DEFAULT 'SCHEDULED',
    "creator_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editor_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" INTEGER NOT NULL,

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

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_notifications_service_endpoint_id_fkey" FOREIGN KEY ("notifications_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_messages_service_endpoint_id_fkey" FOREIGN KEY ("messages_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_sms_service_endpoint_id_fkey" FOREIGN KEY ("sms_service_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies_apis" ADD CONSTRAINT "companies_apis_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formated_response" ADD CONSTRAINT "formated_response_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "companies_apis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_points" ADD CONSTRAINT "meetings_points_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_points" ADD CONSTRAINT "meetings_points_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "meetings_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_documents" ADD CONSTRAINT "meetings_documents_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_participants" ADD CONSTRAINT "meetings_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_invitations" ADD CONSTRAINT "meetings_invitations_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_invitations" ADD CONSTRAINT "meetings_invitations_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_attendances" ADD CONSTRAINT "meetings_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_attendances" ADD CONSTRAINT "meetings_attendances_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_votes" ADD CONSTRAINT "meetings_votes_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "meetings_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings_votes" ADD CONSTRAINT "meetings_votes_meetings_participant_id_fkey" FOREIGN KEY ("meetings_participant_id") REFERENCES "meetings_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
