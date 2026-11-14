import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweep } from "@/lib/notify";

export const maxDuration = 60;

// Retries notifications that failed or were never sent. Vercel Cron calls this
// with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok =
    !!secret &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await sweep());
}
