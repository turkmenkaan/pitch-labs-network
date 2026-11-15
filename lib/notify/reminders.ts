// When to nudge people. Pure: given snapshots of what is open and a clock, says
// which reminders are due. The runner (reminders-run.ts) feeds it from the
// database and sends the result.
//
// Every reminder has a dedupe key, so the daily run can never send one twice,
// and each kind is capped (see the notes on each rule).
import { fmtMeetingTime } from "../format";
import type { Outgoing } from "./index";
import {
  conflictsReminderMessage,
  meetingSoonMessage,
  needsTimeReminderMessage,
  outcomeReminderMessage,
  requestReminderMessage,
} from "./messages";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// How long to wait before each nudge.
export const REQUEST_NUDGES_DAYS = [2, 5] as const; // unanswered request
export const NEEDS_TIME_AFTER_DAYS = 2; // no time agreed / proposal unanswered
export const MEETING_SOON_HOURS = 36; // "coming up" window
export const OUTCOME_NUDGES_DAYS = [1, 3] as const; // after the meeting's time
export const CONFLICT_AFTER_DAYS = 3; // admin digest threshold and cadence
const CONFLICT_LIST_MAX = 5;

type Person = { id: string; name: string; email: string; deactivatedAt: Date | null };

export type OpenProposal = { by: "advisor" | "founder"; createdAt: Date } | null;

export type ReminderMeeting = {
  id: string;
  topic: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  scheduledAt: Date | null;
  meetingUrl: string | null;
  advisorMet: boolean | null;
  founderMet: boolean | null;
  adminMet: boolean | null;
  proposal: OpenProposal;
  advisor: Person;
  founder: Person;
};

export type OpenConflict = { createdAt: Date; topic: string };
export type AdminRecipient = { id: string; email: string };

// The highest nudge number whose delay has passed (0 = none yet).
function nudgeNumber(elapsedMs: number, afterDays: readonly number[]): number {
  let n = 0;
  afterDays.forEach((d, i) => {
    if (elapsedMs >= d * DAY) n = i + 1;
  });
  return n;
}

export function planReminders(
  meetings: ReminderMeeting[],
  conflicts: OpenConflict[],
  admins: AdminRecipient[],
  now: Date
): Outgoing[] {
  const out: Outgoing[] = [];
  const t = now.getTime();

  for (const m of meetings) {
    const who = (side: "advisor" | "founder") => (side === "advisor" ? m.advisor : m.founder);
    const other = (side: "advisor" | "founder") => (side === "advisor" ? m.founder : m.advisor);
    const active = (side: "advisor" | "founder") => !who(side).deactivatedAt;

    // 1. A request nobody has answered. Goes to the advisor, whose answer the
    //    founder's held hours are waiting on. At most two nudges, and only the
    //    latest one due is sent if several have piled up.
    if (m.status === "PENDING") {
      const n = nudgeNumber(t - m.createdAt.getTime(), REQUEST_NUDGES_DAYS);
      if (n > 0 && active("advisor")) {
        out.push({
          type: "REMINDER_REQUEST",
          recipientEmail: m.advisor.email,
          dedupeKey: `reminder:request:${m.id}:${n}`,
          message: requestReminderMessage({
            founderName: m.founder.name,
            topic: m.topic,
            ageDays: Math.floor((t - m.createdAt.getTime()) / DAY),
          }),
        });
      }
      continue;
    }

    // Everything below is about an accepted meeting nobody has reported on.
    const open =
      m.status === "ACCEPTED" &&
      m.adminMet == null &&
      m.advisorMet == null &&
      m.founderMet == null;

    // 2. Accepted but no time agreed. Nudges whoever must act next: the advisor
    //    if nothing is proposed, otherwise the side that has to answer. One
    //    nudge per round (a fresh proposal starts the clock again).
    if (open && !m.scheduledAt) {
      const anchor = m.proposal?.createdAt ?? m.decidedAt ?? m.createdAt;
      if (t - anchor.getTime() >= NEEDS_TIME_AFTER_DAYS * DAY) {
        const recipient: "advisor" | "founder" =
          m.proposal?.by === "advisor" ? "founder" : "advisor";
        if (active(recipient)) {
          out.push({
            type: "REMINDER_NEEDS_TIME",
            recipientEmail: who(recipient).email,
            dedupeKey: `reminder:needs-time:${m.id}:${anchor.getTime()}`,
            message: needsTimeReminderMessage({
              otherName: other(recipient).name,
              topic: m.topic,
              recipient,
              action: m.proposal ? "pick" : "propose",
            }),
          });
        }
      }
      continue;
    }

    if (m.status !== "ACCEPTED" || m.adminMet != null || !m.scheduledAt) continue;
    const until = m.scheduledAt.getTime() - t;

    // 3. A meeting in the next day and a half, to both. Sent once per agreed
    //    time, so rescheduling brings a fresh reminder.
    if (open && until > 0 && until <= MEETING_SOON_HOURS * HOUR) {
      for (const side of ["advisor", "founder"] as const) {
        if (!active(side)) continue;
        out.push({
          type: "REMINDER_MEETING_SOON",
          recipientEmail: who(side).email,
          dedupeKey: `reminder:soon:${m.id}:${m.scheduledAt.getTime()}:${side}`,
          message: meetingSoonMessage({
            otherName: other(side).name,
            topic: m.topic,
            time: fmtMeetingTime(m.scheduledAt, { weekday: true }),
            recipient: side,
            meetingUrl: m.meetingUrl,
          }),
        });
      }
    }

    // 4. The time has passed and someone hasn't said whether it happened. Each
    //    side is asked only about their own missing answer. At most two nudges.
    if (until < 0) {
      const n = nudgeNumber(-until, OUTCOME_NUDGES_DAYS);
      if (n > 0) {
        for (const side of ["advisor", "founder"] as const) {
          const answered = side === "advisor" ? m.advisorMet != null : m.founderMet != null;
          if (answered || !active(side)) continue;
          out.push({
            type: "REMINDER_OUTCOME",
            recipientEmail: who(side).email,
            dedupeKey: `reminder:outcome:${m.id}:${side}:${n}`,
            message: outcomeReminderMessage({
              otherName: other(side).name,
              topic: m.topic,
              time: fmtMeetingTime(m.scheduledAt),
              recipient: side,
            }),
          });
        }
      }
    }
  }

  // 5. Conflicts that have sat unresolved: one digest per admin, repeated every
  //    CONFLICT_AFTER_DAYS while any remain.
  const stale = conflicts
    .filter((c) => t - c.createdAt.getTime() >= CONFLICT_AFTER_DAYS * DAY)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (stale.length > 0) {
    const bucket = Math.floor(t / (CONFLICT_AFTER_DAYS * DAY));
    const message = conflictsReminderMessage({
      topics: stale.slice(0, CONFLICT_LIST_MAX).map((c) => c.topic),
      total: stale.length,
    });
    for (const admin of admins) {
      out.push({
        type: "REMINDER_CONFLICTS",
        recipientEmail: admin.email,
        dedupeKey: `reminder:conflicts:${bucket}:${admin.id}`,
        message,
      });
    }
  }

  return out;
}
