-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackUser" (
    "email" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackUser_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
