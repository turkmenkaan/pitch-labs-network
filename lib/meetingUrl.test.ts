import { describe, expect, it } from "vitest";
import {
  canEditMeetingLink,
  parseMeetingUrl,
  visibleMeetingUrl,
} from "./meetingUrl";

describe("parseMeetingUrl", () => {
  it("treats empty as no link", () => {
    expect(parseMeetingUrl("  ")).toEqual({ url: null });
  });

  it("accepts allowed https hosts and their subdomains", () => {
    for (const ok of [
      "https://meet.google.com/abc-defg-hij",
      "https://us02web.zoom.us/j/123?pwd=x",
      "https://zoom.us/j/123",
      "https://teams.microsoft.com/l/meetup-join/abc",
      "https://whereby.com/room",
    ]) {
      expect(parseMeetingUrl(ok)).toEqual({ url: new URL(ok).toString() });
    }
  });

  it("refuses other schemes, hosts, look-alikes and credentials", () => {
    for (const bad of [
      "http://meet.google.com/abc",
      "javascript:alert(1)",
      "https://example.com/room",
      "https://zoom.us.evil.com/j/1",
      "https://notzoom.us/j/1",
      "https://user:pw@zoom.us/j/1",
      "meet.google.com/abc",
    ]) {
      expect(parseMeetingUrl(bad)).toHaveProperty("error");
    }
  });

  it("refuses very long links", () => {
    expect(parseMeetingUrl(`https://zoom.us/j/${"1".repeat(600)}`)).toHaveProperty("error");
  });
});

const base = {
  status: "ACCEPTED",
  scheduledAt: null as Date | null,
  advisorMet: null,
  founderMet: null,
  adminMet: null,
  meetingUrl: null as string | null,
  meetingUrlSetBy: null as string | null,
};
const link = "https://zoom.us/j/1";

describe("visibleMeetingUrl", () => {
  it("shows an accepted meeting's link, even before a time is agreed", () => {
    expect(visibleMeetingUrl({ ...base, meetingUrl: link })).toBe(link);
  });
  it("hides it once cancelled, or once anyone has recorded an outcome", () => {
    expect(visibleMeetingUrl({ ...base, meetingUrl: link, status: "CANCELLED" })).toBeNull();
    expect(visibleMeetingUrl({ ...base, meetingUrl: link, founderMet: true })).toBeNull();
  });
  it("hides a stored value that fails the checks", () => {
    expect(visibleMeetingUrl({ ...base, meetingUrl: "https://evil.example/x" })).toBeNull();
  });
});

describe("canEditMeetingLink", () => {
  const when = new Date();
  it("lets either side add a link only once a time is agreed", () => {
    expect(canEditMeetingLink(base, "advisor")).toBe(false);
    expect(canEditMeetingLink({ ...base, scheduledAt: when }, "advisor")).toBe(true);
    expect(canEditMeetingLink({ ...base, scheduledAt: when }, "founder")).toBe(true);
  });
  it("lets only the setter change an existing link, before or after the time", () => {
    const mine = { ...base, meetingUrl: link, meetingUrlSetBy: "advisor" };
    expect(canEditMeetingLink(mine, "advisor")).toBe(true);
    expect(canEditMeetingLink(mine, "founder")).toBe(false);
    expect(canEditMeetingLink({ ...mine, scheduledAt: when }, "founder")).toBe(false);
  });
  it("is closed once cancelled or an outcome exists", () => {
    const m = { ...base, scheduledAt: when };
    expect(canEditMeetingLink({ ...m, status: "CANCELLED" }, "advisor")).toBe(false);
    expect(canEditMeetingLink({ ...m, advisorMet: true }, "advisor")).toBe(false);
  });
});
