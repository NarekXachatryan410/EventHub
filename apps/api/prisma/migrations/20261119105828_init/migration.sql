-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'EVENT_MANAGER', 'CHECK_IN_STAFF');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('OPEN_DAY', 'WORKSHOP', 'INFORMATION_SESSION', 'GUEST_VISIT', 'MEETUP', 'GRADUATION_CEREMONY', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EVENT_MANAGER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "type" "EventType" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "registrationDeadline" TIMESTAMPTZ(6) NOT NULL,
    "maxAttendees" INTEGER,
    "organizerId" UUID NOT NULL,
    "contactEmail" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
