import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweep } from "@/lib/notify";
import { runReminders } from "@/lib/notify/reminders-run";

export const maxDuration = 60;

// The daily job: sends the reminders that are due, then retries notifications
// that failed or were never sent. Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok =
    !!secret &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A reminder problem must not stop the retries (or the other way round).
  const reminders = await runReminders().catch((e) => {
    console.error("[notify] reminders failed", e);
    return { sent: 0, error: true };
  });
  return NextResponse.json({ ...(await sweep()), reminders });
}
