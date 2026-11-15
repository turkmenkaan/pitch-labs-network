import { describe, expect, it } from "vitest";
import {
  planReminders,
  type AdminRecipient,
  type OpenConflict,
  type ReminderMeeting,
} from "./reminders";

const NOW = new Date("2026-11-16T13:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const ahead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

const person = (id: string, deactivated = false) => ({
  id,
  name: `${id} name`,
  email: `${id}@x.test`,
  deactivatedAt: deactivated ? ago(1) : null,
});

function meeting(over: Partial<ReminderMeeting> = {}): ReminderMeeting {
  return {
    id: "m1",
    topic: "Pricing",
    status: "ACCEPTED",
    createdAt: ago(10),
    decidedAt: ago(10),
    scheduledAt: null,
    meetingUrl: null,
    advisorMet: null,
    founderMet: null,
    adminMet: null,
    proposal: null,
    advisor: person("adv"),
    founder: person("fnd"),
    ...over,
  };
}

const plan = (
  m: ReminderMeeting[],
  conflicts: OpenConflict[] = [],
  admins: AdminRecipient[] = []
) =>
  planReminders(m, conflicts, admins, NOW);

describe("unanswered requests", () => {
  const pending = (days: number, over: Partial<ReminderMeeting> = {}) =>
    meeting({ status: "PENDING", createdAt: ago(days), decidedAt: null, ...over });

  it("waits two days, then nudges the advisor", () => {
    expect(plan([pending(1.9)])).toHaveLength(0);
    const [n] = plan([pending(2)]);
    expect(n).toMatchObject({ type: "REMINDER_REQUEST", recipientEmail: "adv@x.test" });
    expect(n.dedupeKey).toBe("reminder:request:m1:1");
    expect(n.message.text).toContain("2 days");
  });

  it("sends only the latest nudge due, once at five days", () => {
    const out = plan([pending(6)]);
    expect(out.map((o) => o.dedupeKey)).toEqual(["reminder:request:m1:2"]);
  });

  it("skips a deactivated advisor", () => {
    expect(plan([pending(3, { advisor: person("adv", true) })])).toHaveLength(0);
  });
});

describe("accepted but no time agreed", () => {
  it("waits two days from acceptance, then nudges the advisor to propose", () => {
    expect(plan([meeting({ decidedAt: ago(1.5) })])).toHaveLength(0);
    const [n] = plan([meeting({ decidedAt: ago(2.5) })]);
    expect(n).toMatchObject({ type: "REMINDER_NEEDS_TIME", recipientEmail: "adv@x.test" });
    expect(n.message.text).toContain("Propose a few times");
  });

  it("nudges the founder to pick when the advisor proposed", () => {
    const [n] = plan([meeting({ proposal: { by: "advisor", createdAt: ago(3) } })]);
    expect(n.recipientEmail).toBe("fnd@x.test");
    expect(n.message.text).toContain("Pick one");
    expect(n.message.path).toBe("/founder/meetings");
  });

  it("nudges the advisor to pick when the founder proposed", () => {
    const [n] = plan([meeting({ proposal: { by: "founder", createdAt: ago(3) } })]);
    expect(n.recipientEmail).toBe("adv@x.test");
    expect(n.message.text).toContain("Pick one");
  });

  it("starts the clock again for a new proposal", () => {
    const a = plan([meeting({ proposal: { by: "advisor", createdAt: ago(3) } })]);
    const b = plan([meeting({ proposal: { by: "advisor", createdAt: ago(2.5) } })]);
    expect(a[0].dedupeKey).not.toBe(b[0].dedupeKey);
    expect(plan([meeting({ proposal: { by: "advisor", createdAt: ago(1) } })])).toHaveLength(0);
  });

  it("is quiet once anyone has reported an outcome", () => {
    expect(plan([meeting({ founderMet: true })])).toHaveLength(0);
  });
});

describe("meeting coming up", () => {
  it("tells both sides within 36 hours, with the video link", () => {
    const out = plan([
      meeting({ scheduledAt: ahead(30), meetingUrl: "https://meet.google.com/abc-defg-hij" }),
    ]);
    expect(out.map((o) => o.recipientEmail).sort()).toEqual(["adv@x.test", "fnd@x.test"]);
    expect(out.every((o) => o.type === "REMINDER_MEETING_SOON")).toBe(true);
    expect(out[0].message.text).toContain("Join the video call");
    expect(out[0].message.text).toMatch(/ET/);
  });

  it("leaves out the link when there isn't one", () => {
    const [n] = plan([meeting({ scheduledAt: ahead(10) })]);
    expect(n.message.text).not.toContain("Join the video call");
  });

  it("ignores meetings further out than that or already past", () => {
    expect(plan([meeting({ scheduledAt: ahead(40) })])).toHaveLength(0);
    expect(plan([meeting({ scheduledAt: ahead(-0.5) })])).toHaveLength(0);
  });

  it("sends once per agreed time", () => {
    const a = plan([meeting({ scheduledAt: ahead(30) })]);
    const b = plan([meeting({ scheduledAt: ahead(20) })]);
    expect(a[0].dedupeKey).not.toBe(b[0].dedupeKey);
    expect(plan([meeting({ scheduledAt: ahead(30) })])[0].dedupeKey).toBe(a[0].dedupeKey);
  });

  it("skips a deactivated side only", () => {
    const out = plan([meeting({ scheduledAt: ahead(10), founder: person("fnd", true) })]);
    expect(out.map((o) => o.recipientEmail)).toEqual(["adv@x.test"]);
  });

  it("ignores cancelled meetings", () => {
    expect(plan([meeting({ status: "CANCELLED", scheduledAt: ahead(10) })])).toHaveLength(0);
  });
});

describe("did it happen?", () => {
  const past = (days: number, over: Partial<ReminderMeeting> = {}) =>
    meeting({ scheduledAt: ago(days), ...over });

  it("waits a day after the meeting, then asks both", () => {
    expect(plan([past(0.5)])).toHaveLength(0);
    const out = plan([past(1.2)]);
    expect(out.map((o) => o.dedupeKey).sort()).toEqual([
      "reminder:outcome:m1:advisor:1",
      "reminder:outcome:m1:founder:1",
    ]);
  });

  it("only asks the side that hasn't answered", () => {
    const out = plan([past(2, { advisorMet: true })]);
    expect(out).toHaveLength(1);
    expect(out[0].recipientEmail).toBe("fnd@x.test");
  });

  it("sends the second nudge only after three days, and no more", () => {
    expect(plan([past(3.5)]).map((o) => o.dedupeKey)).toEqual([
      "reminder:outcome:m1:advisor:2",
      "reminder:outcome:m1:founder:2",
    ]);
  });

  it("stops once an admin has ruled, or when the meeting isn't accepted", () => {
    expect(plan([past(2, { adminMet: true })])).toHaveLength(0);
    expect(plan([past(2, { status: "CANCELLED" })])).toHaveLength(0);
  });
});

describe("unresolved conflicts", () => {
  const admins = [
    { id: "a1", email: "a1@x.test" },
    { id: "a2", email: "a2@x.test" },
  ];
  const conflict = (days: number, topic = "T") => ({ createdAt: ago(days), topic });

  it("waits three days, then sends each admin one digest", () => {
    expect(plan([], [conflict(2)], admins)).toHaveLength(0);
    const out = plan([], [conflict(4, "Alpha"), conflict(5, "Beta")], admins);
    expect(out.map((o) => o.recipientEmail)).toEqual(["a1@x.test", "a2@x.test"]);
    expect(out[0].message.text).toContain("2 meeting conflicts");
    expect(out[0].message.text).toContain("Beta");
    expect(out[0].message.path).toBe("/admin/conflicts");
  });

  it("counts only the stale ones and lists at most five", () => {
    const many = Array.from({ length: 8 }, (_, i) => conflict(4 + i, `Topic ${i}`));
    const [n] = plan([], [...many, conflict(1, "Fresh")], admins);
    expect(n.message.text).toContain("8 meeting conflicts");
    expect(n.message.text).toContain("and 3 more");
    expect(n.message.text).not.toContain("Fresh");
  });

  it("uses one key per admin per three-day window", () => {
    const a = planReminders([], [conflict(4)], admins, NOW);
    const sameWindow = planReminders([], [conflict(4)], admins, new Date(NOW.getTime() + 3_600_000));
    expect(a[0].dedupeKey).toBe(sameWindow[0].dedupeKey);
    expect(a[0].dedupeKey).not.toBe(a[1].dedupeKey);
  });
});
