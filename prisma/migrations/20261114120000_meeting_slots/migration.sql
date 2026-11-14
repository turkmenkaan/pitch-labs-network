-- CreateTable
CREATE TABLE "MeetingSlot" (
    "id" TEXT NOT NULL,
    "meetingRequestId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSlot_meetingRequestId_status_idx" ON "MeetingSlot"("meetingRequestId", "status");

-- AddForeignKey
ALTER TABLE "MeetingSlot" ADD CONSTRAINT "MeetingSlot_meetingRequestId_fkey" FOREIGN KEY ("meetingRequestId") REFERENCES "MeetingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
