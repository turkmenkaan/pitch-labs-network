import { prisma } from "@/lib/db";
import { openProposal } from "@/lib/slots";
import { sendNow } from "./index";
import {
  MEETING_SOON_HOURS,
  planReminders,
  REQUEST_NUDGES_DAYS,
  type ReminderMeeting,
} from "./reminders";

const DAY = 24 * 60 * 60 * 1000;

// Finds what is open, works out which reminders are due and sends them. Runs
// from the daily cron (app/api/notifications/sweep). Safe to run twice: every
// reminder has a dedupe key.
export async function runReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const include = { advisor: true, founder: true, slots: { where: { status: "OPEN" } } };

  const [pending, accepted, conflicts, admins] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: {
        status: "PENDING",
        createdAt: { lte: new Date(now.getTime() - REQUEST_NUDGES_DAYS[0] * DAY) },
      },
      include,
    }),
    // Accepted meetings still waiting on a time, or whose time is near or past.
    prisma.meetingRequest.findMany({
      where: {
        status: "ACCEPTED",
        adminMet: null,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date(now.getTime() + MEETING_SOON_HOURS * 60 * 60 * 1000) } },
        ],
      },
      include,
    }),
    prisma.adminNotification.findMany({
      where: { type: "MEETING_CONFLICT", resolved: false },
      include: { meetingRequest: { select: { topic: true } } },
    }),
    prisma.admin.findMany({ select: { id: true, email: true } }),
  ]);

  const meetings: ReminderMeeting[] = [...pending, ...accepted].map((m) => {
    const proposal = openProposal(m.slots, now);
    return {
      id: m.id,
      topic: m.topic,
      status: m.status,
      createdAt: m.createdAt,
      decidedAt: m.decidedAt,
      scheduledAt: m.scheduledAt,
      meetingUrl: m.meetingUrl,
      advisorMet: m.advisorMet,
      founderMet: m.founderMet,
      adminMet: m.adminMet,
      // All slots in a round are created together, so any one gives the round's start.
      proposal: proposal
        ? { by: proposal.by, createdAt: proposal.slots[0].createdAt }
        : null,
      advisor: m.advisor,
      founder: m.founder,
    };
  });

  const items = planReminders(
    meetings,
    conflicts.map((c) => ({ createdAt: c.createdAt, topic: c.meetingRequest.topic })),
    admins,
    now
  );
  return { sent: await sendNow(items) };
}
