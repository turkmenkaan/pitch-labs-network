import { describe, expect, it } from "vitest";
import { canCancelMeeting, getFounderStage, getMeetingStage } from "./meeting";

const now = new Date("2026-11-12T12:00:00Z");
const hour = 60 * 60 * 1000;
const meeting = (over = {}) => ({
  status: "ACCEPTED",
  scheduledAt: null as Date | null,
  advisorMet: null as boolean | null,
  founderMet: null as boolean | null,
  adminMet: null as boolean | null,
  ...over,
});

describe("canCancelMeeting", () => {
  it("allows an accepted meeting with no time yet", () => {
    expect(canCancelMeeting(meeting(), now)).toBe(true);
  });
  it("allows one scheduled in the future", () => {
    expect(canCancelMeeting(meeting({ scheduledAt: new Date(now.getTime() + hour) }), now)).toBe(true);
  });
  it("refuses once the scheduled time has passed", () => {
    expect(canCancelMeeting(meeting({ scheduledAt: new Date(now.getTime() - hour) }), now)).toBe(false);
  });
  it("refuses once anyone has said whether it happened", () => {
    expect(canCancelMeeting(meeting({ advisorMet: true }), now)).toBe(false);
    expect(canCancelMeeting(meeting({ founderMet: false }), now)).toBe(false);
    expect(canCancelMeeting(meeting({ adminMet: true }), now)).toBe(false);
  });
  it("only applies to accepted meetings", () => {
    for (const status of ["PENDING", "REJECTED", "WITHDRAWN", "CANCELLED"]) {
      expect(canCancelMeeting(meeting({ status }), now)).toBe(false);
    }
  });
});

describe("stages while a time is being agreed", () => {
  const base = {
    status: "ACCEPTED",
    scheduledAt: null as Date | null,
    advisorMet: null as boolean | null,
    founderMet: null as boolean | null,
    adminMet: null as boolean | null,
    advisorFeedback: null as string | null,
  };

  it("tells each side whose move it is", () => {
    expect(getMeetingStage(base, now)).toBe("NEEDS_SCHEDULE");
    expect(getMeetingStage({ ...base, proposedBy: "advisor" }, now)).toBe("TIME_PROPOSED");
    expect(getMeetingStage({ ...base, proposedBy: "founder" }, now)).toBe("PICK_A_TIME");

    expect(getFounderStage(base, now)).toBe("ACCEPTED");
    expect(getFounderStage({ ...base, proposedBy: "founder" }, now)).toBe("TIME_PROPOSED");
    expect(getFounderStage({ ...base, proposedBy: "advisor" }, now)).toBe("PICK_A_TIME");
  });

  it("ignores proposals once a time is agreed", () => {
    const scheduledAt = new Date(now.getTime() + hour);
    expect(getMeetingStage({ ...base, scheduledAt, proposedBy: "founder" }, now)).toBe("UPCOMING");
    expect(getFounderStage({ ...base, scheduledAt, proposedBy: "advisor" }, now)).toBe("UPCOMING");
  });
});
