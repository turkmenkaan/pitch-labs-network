import { describe, expect, it } from "vitest";
import { parseEasternInput, toEasternInput } from "./time";

describe("parseEasternInput", () => {
  it("reads winter times as EST (UTC-5)", () => {
    expect(parseEasternInput("2026-11-13T15:00")?.toISOString()).toBe("2026-11-13T20:00:00.000Z");
  });
  it("reads summer times as EDT (UTC-4)", () => {
    expect(parseEasternInput("2026-07-13T15:00")?.toISOString()).toBe("2026-07-13T19:00:00.000Z");
  });
  it("handles the day daylight saving ends and starts", () => {
    expect(parseEasternInput("2026-11-01T12:00")?.toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(parseEasternInput("2026-03-08T12:00")?.toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });
  it("rejects times that don't exist, and malformed input", () => {
    expect(parseEasternInput("2026-03-08T02:30")).toBeNull(); // skipped by spring-forward
    expect(parseEasternInput("2026-02-31T10:00")).toBeNull();
    expect(parseEasternInput("tomorrow")).toBeNull();
    expect(parseEasternInput("")).toBeNull();
  });
});

describe("toEasternInput", () => {
  it("round-trips with parseEasternInput", () => {
    for (const raw of ["2026-11-13T15:00", "2026-07-04T09:30", "2026-12-31T23:59", "2027-01-01T00:00"]) {
      expect(toEasternInput(parseEasternInput(raw)!)).toBe(raw);
    }
  });
  it("shows midnight as 00:00, not 24:00", () => {
    expect(toEasternInput(new Date("2026-11-13T05:00:00Z"))).toBe("2026-11-13T00:00");
  });
});
