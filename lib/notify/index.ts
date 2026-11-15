import { after } from "next/server";
import { prisma } from "@/lib/db";
import { withLink, type Message, type NotifyType } from "./messages";
import { backoffMs, canRetry, isPermanentSlackError, MAX_ATTEMPTS } from "./retry";
import { lookupUserIdByEmail, postDirectMessage, SlackError } from "./slack";

// NOTIFY_MODE: "off" writes nothing, "log" (default) records the message and
// logs it instead of sending, "slack" really sends. Local, test and staging
// environments stay on "log" unless someone opts in.
export type NotifyMode = "off" | "log" | "slack";

export function notifyMode(): NotifyMode {
  const v = (process.env.NOTIFY_MODE ?? "log").trim().toLowerCase();
  return v === "off" || v === "slack" ? v : "log";
}

// Optional comma-separated emails. When set, only they receive real Slack
// messages (use it to trial notifications on a few people).
function allowed(email: string): boolean {
  const list = (process.env.NOTIFY_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

export type Outgoing = {
  type: NotifyType;
  recipientEmail: string;
  message: Message;
  // Same key, same notification: enqueueing twice never sends twice.
  dedupeKey: string;
};

// Records the notifications, then sends them after the response so a slow or
// failing Slack never holds up (or fails) the user's action. Never throws.
export function notify(items: Outgoing[]): void {
  if (notifyMode() === "off" || items.length === 0) return;
  after(async () => {
    try {
      await enqueue(items);
      for (const item of items) await deliverByKey(item.dedupeKey);
    } catch (e) {
      console.error("[notify] enqueue/deliver failed", e);
    }
  });
}

export async function enqueue(items: Outgoing[]): Promise<void> {
  await prisma.notification.createMany({
    data: items.map((i) => ({
      type: i.type,
      recipientEmail: i.recipientEmail.toLowerCase(),
      payload: i.message,
      dedupeKey: i.dedupeKey,
    })),
    skipDuplicates: true,
  });
}

// Records and sends right now, for jobs that already run in the background
// (the daily cron). Never throws for one bad row.
export async function sendNow(items: Outgoing[]): Promise<number> {
  if (notifyMode() === "off" || items.length === 0) return 0;
  await enqueue(items);
  for (const item of items) {
    try {
      await deliverByKey(item.dedupeKey);
    } catch (e) {
      console.error("[notify] deliver failed", e);
    }
  }
  return items.length;
}

async function deliverByKey(dedupeKey: string): Promise<void> {
  const row = await prisma.notification.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (row) await deliver(row.id);
}

// Claim the row (so two workers can't both send it), send, record the result.
// `force` ignores the retry schedule and attempt cap (manual retry).
export async function deliver(id: string, force = false): Promise<void> {
  const now = new Date();
  const claimed = await prisma.notification.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "FAILED"] },
      ...(force ? {} : { nextAttemptAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } }),
    },
    // Lease: if this process dies mid-send, the sweeper picks it up later.
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 5 * 60_000) },
  });
  if (claimed.count === 0) return;

  const n = await prisma.notification.findUniqueOrThrow({ where: { id } });
  const text = withLink(n.payload as Message, process.env.APP_URL);
  const mode = notifyMode();

  if (mode !== "slack") {
    console.log(`[notify:${mode}] to ${n.recipientEmail}: ${text}`);
    await prisma.notification.update({
      where: { id },
      data: { status: "LOGGED", lastError: `NOTIFY_MODE=${mode}` },
    });
    return;
  }
  if (!allowed(n.recipientEmail)) {
    await prisma.notification.update({
      where: { id },
      data: { status: "SKIPPED", lastError: "Not in NOTIFY_ALLOWLIST" },
    });
    return;
  }

  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new SlackError("SLACK_BOT_TOKEN is not set");
    const slackUserId = await slackIdFor(token, n.recipientEmail);
    await postDirectMessage(token, slackUserId, text);
    await prisma.notification.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "unexpected_error";
    const permanent = e instanceof SlackError && isPermanentSlackError(e.code);
    const attempts = permanent ? MAX_ATTEMPTS : n.attempts;
    const wait = e instanceof SlackError && e.retryAfterMs ? e.retryAfterMs : backoffMs(attempts);
    await prisma.notification.update({
      where: { id },
      data: {
        status: "FAILED",
        lastError: code,
        attempts,
        nextAttemptAt: new Date(Date.now() + wait),
      },
    });
    if (!canRetry(attempts)) console.error(`[notify] giving up on ${id}: ${code}`);
  }
}

async function slackIdFor(token: string, email: string): Promise<string> {
  const cached = await prisma.slackUser.findUnique({ where: { email } });
  if (cached) return cached.slackUserId;
  const slackUserId = await lookupUserIdByEmail(token, email);
  await prisma.slackUser.upsert({
    where: { email },
    update: { slackUserId },
    create: { email, slackUserId },
  });
  return slackUserId;
}

// Retry everything that is due. Called by the cron route.
export async function sweep(limit = 50): Promise<{ processed: number }> {
  const due = await prisma.notification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) await deliver(id);
  return { processed: due.length };
}
