import { randomBytes } from "node:crypto";
import { currentMonth } from "../../lib/types";
import { db } from "./db";

// Creates a meeting request straight in the database, in any state. Use it to
// set up the situation a test starts from; drive the behaviour under test
// through the UI. Fixture teardown deletes these along with their members.
export async function createRequest(options: {
  advisorId: string;
  founderId: string;
  topic?: string;
  hours?: number;
  status?: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  scheduledAt?: Date | null;
  meetingUrl?: string | null;
  advisorMet?: boolean | null;
  founderMet?: boolean | null;
  adminMet?: boolean | null;
}) {
  return db().meetingRequest.create({
    data: {
      advisorId: options.advisorId,
      founderId: options.founderId,
      topic: options.topic ?? `Seeded ${randomBytes(3).toString("hex")}`,
      message: "Created by the end-to-end test suite.",
      estimatedHours: options.hours ?? 1,
      month: currentMonth(),
      status: options.status ?? "PENDING",
      scheduledAt: options.scheduledAt ?? null,
      ...(options.meetingUrl && {
        meetingUrl: options.meetingUrl,
        meetingUrlSetBy: "advisor",
        meetingUrlSetAt: new Date(),
      }),
      advisorMet: options.advisorMet ?? null,
      founderMet: options.founderMet ?? null,
      adminMet: options.adminMet ?? null,
    },
  });
}

// A time safely in the past, for meetings that "have already happened".
export function anHourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}

export function uniqueTopic(label: string): string {
  return `${label} ${randomBytes(3).toString("hex")}`;
}
