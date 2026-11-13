import { describe, expect, it } from "vitest";
import { canCancelMeeting } from "./meeting";

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
