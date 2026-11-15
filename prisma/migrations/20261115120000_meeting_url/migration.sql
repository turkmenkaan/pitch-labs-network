-- AlterTable
ALTER TABLE "Advisor" ADD COLUMN     "defaultMeetingUrl" TEXT;

-- AlterTable
ALTER TABLE "MeetingRequest" ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "meetingUrlSetAt" TIMESTAMP(3),
ADD COLUMN     "meetingUrlSetBy" TEXT;
