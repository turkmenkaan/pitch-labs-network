import { describe, expect, it } from "vitest";
import {
  callsLeftWith,
  checkNewRequest,
  limitsFor,
  summarizeUsage,
} from "./guardrails";

const req = (over: Partial<Parameters<typeof summarizeUsage>[0][number]> = {}) => ({
  advisorId: "a1",
  estimatedHours: 1,
  status: "PENDING",
  advisorMet: null,
  adminMet: null,
  ...over,
});
const defaults = limitsFor({ monthlyHoursLimit: null, advisorCallLimit: null });

describe("limitsFor", () => {
  it("uses 4 hours and 2 calls by default", () => {
    expect(defaults).toEqual({ monthlyHours: 4, callsPerAdvisor: 2 });
  });
  it("uses admin overrides", () => {
    expect(limitsFor({ monthlyHoursLimit: 6, advisorCallLimit: 3 })).toEqual({
      monthlyHours: 6,
      callsPerAdvisor: 3,
    });
  });
});

describe("summarizeUsage", () => {
  it("counts pending and accepted hours", () => {
    const u = summarizeUsage(
      [req({ estimatedHours: 2 }), req({ status: "ACCEPTED", advisorId: "a2" })],
      defaults
    );
    expect(u.hoursUsed).toBe(3);
    expect(u.hoursLeft).toBe(1);
  });
  it("ignores rejected and withdrawn requests", () => {
    const u = summarizeUsage(
      [req({ status: "REJECTED" }), req({ status: "WITHDRAWN" })],
      defaults
    );
    expect(u.hoursUsed).toBe(0);
  });
  it("gives hours back when an accepted meeting is cancelled", () => {
    const u = summarizeUsage([req({ status: "CANCELLED", estimatedHours: 2 })], defaults);
    expect(u.hoursUsed).toBe(0);
    expect(u.callsByAdvisor).toEqual({});
  });
  it("gives hours back when the meeting did not happen", () => {
    const u = summarizeUsage(
      [req({ status: "ACCEPTED", advisorMet: false })],
      defaults
    );
    expect(u.hoursUsed).toBe(0);
  });
  it("lets the admin ruling override the advisor's answer", () => {
    const happened = req({ status: "ACCEPTED", advisorMet: false, adminMet: true });
    expect(summarizeUsage([happened], defaults).hoursUsed).toBe(1);
  });
});

describe("checkNewRequest", () => {
  it("allows a request within both limits", () => {
    const u = summarizeUsage([req()], defaults);
    expect(checkNewRequest(u, "a1", 1)).toBeNull();
  });
  it("blocks a third call with the same advisor", () => {
    const u = summarizeUsage([req(), req({ status: "ACCEPTED" })], defaults);
    expect(callsLeftWith(u, "a1")).toBe(0);
    expect(checkNewRequest(u, "a1", 1)).toMatch(/at most 2 calls/);
    expect(checkNewRequest(u, "a2", 1)).toBeNull();
  });
  it("blocks requests that go over 4 hours", () => {
    const u = summarizeUsage([req({ estimatedHours: 3, advisorId: "a2" })], defaults);
    expect(checkNewRequest(u, "a1", 2)).toMatch(/1 hour left/);
    expect(checkNewRequest(u, "a1", 1)).toBeNull();
  });
  it("blocks everything once all hours are used", () => {
    const u = summarizeUsage([req({ estimatedHours: 4 })], defaults);
    expect(checkNewRequest(u, "a2", 1)).toMatch(/used all 4/);
  });
  it("honours raised limits", () => {
    const limits = limitsFor({ monthlyHoursLimit: 6, advisorCallLimit: 3 });
    const u = summarizeUsage([req({ estimatedHours: 4 }), req()], limits);
    expect(checkNewRequest(u, "a1", 1)).toBeNull();
  });
});
