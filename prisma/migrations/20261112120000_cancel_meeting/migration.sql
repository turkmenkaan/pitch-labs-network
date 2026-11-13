-- AlterTable
ALTER TABLE "MeetingRequest" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT;
