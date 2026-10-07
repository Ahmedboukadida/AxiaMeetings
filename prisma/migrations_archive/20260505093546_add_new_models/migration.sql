/*
  Warnings:

  - You are about to drop the column `title` on the `meetings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "turn_request_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FINISHED');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "contact_adress" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "favicon_file_name" TEXT,
ADD COLUMN     "linkedin" TEXT,
ADD COLUMN     "logo_file_name" TEXT,
ADD COLUMN     "tiktok" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "login_endpoint_id" INTEGER,
ADD COLUMN     "users_endpoint_id" INTEGER;

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "title";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "identifiant_extern" INTEGER,
ADD COLUMN     "phone" TEXT;

-- DropEnum
DROP TYPE "default_status";

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
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request" JSONB,
    "payload" JSONB,
    "response" JSONB,
    "user_id" INTEGER NOT NULL,
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
    "identifiant_extern" INTEGER,
    "company_id" INTEGER NOT NULL,

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

-- AddForeignKey
ALTER TABLE "packs_lines" ADD CONSTRAINT "packs_lines_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_login_endpoint_id_fkey" FOREIGN KEY ("login_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_users_endpoint_id_fkey" FOREIGN KEY ("users_endpoint_id") REFERENCES "companies_apis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
