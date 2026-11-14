import { describe, expect, it } from "vitest";
import {
  escapeSlack,
  meetingCancelledMessage,
  meetingConflictMessage,
  requestDecidedMessage,
  requestSentMessage,
  withLink,
} from "./messages";
import { backoffMs, canRetry, isPermanentSlackError, MAX_ATTEMPTS } from "./retry";

describe("escapeSlack", () => {
  it("neutralises Slack control characters", () => {
    expect(escapeSlack("<!channel> & <@U1>")).toBe("&lt;!channel&gt; &amp; &lt;@U1&gt;");
  });
});

describe("messages", () => {
  it("request sent names the founder, company, topic and hours", () => {
    const m = requestSentMessage({ founderName: "Ada", company: "Acme", topic: "Pricing", estimatedHours: 2 });
    expect(m.text).toContain("Ada (Acme)");
    expect(m.text).toContain("Pricing");
    expect(m.text).toContain("2 hours");
    expect(m.path).toBe("/advisor");
  });

  it("uses the singular for one hour", () => {
    const m = requestSentMessage({ founderName: "Ada", company: null, topic: "T", estimatedHours: 1 });
    expect(m.text).toContain("1 hour.");
  });

  it("escapes what people typed", () => {
    const m = requestSentMessage({ founderName: "A", company: null, topic: "<!here> hi", estimatedHours: 1 });
    expect(m.text).not.toContain("<!here>");
    expect(m.text).toContain("&lt;!here&gt;");
  });

  it("decision messages differ and quote the note", () => {
    const yes = requestDecidedMessage({ advisorName: "Bo", topic: "T", accepted: true, note: null });
    const no = requestDecidedMessage({ advisorName: "Bo", topic: "T", accepted: false, note: "Too busy\nSorry" });
    expect(yes.text).toContain("accepted");
    expect(no.text).toContain("declined");
    expect(no.text).toContain("> Too busy\n> Sorry");
  });

  it("cancellation links to the other side's workspace", () => {
    const base = { cancelledByName: "X", topic: "T", reason: "r" };
    expect(meetingCancelledMessage({ ...base, cancelledBy: "advisor" }).path).toBe("/founder/meetings");
    expect(meetingCancelledMessage({ ...base, cancelledBy: "founder" }).path).toBe("/advisor");
  });

  it("conflict goes to the admin area", () => {
    expect(meetingConflictMessage({ summary: "s" }).path).toBe("/admin");
  });

  it("withLink adds a link only when APP_URL is set", () => {
    const m = { text: "hi", path: "/advisor" };
    expect(withLink(m, undefined)).toBe("hi");
    expect(withLink(m, "https://x.test/")).toBe("hi\n<https://x.test/advisor|Open Pitch Labs Network>");
  });
});

describe("retry policy", () => {
  it("backs off and caps", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1));
    expect(backoffMs(99)).toBe(backoffMs(5));
    expect(backoffMs(0)).toBe(backoffMs(1));
  });
  it("stops at the attempt cap", () => {
    expect(canRetry(MAX_ATTEMPTS - 1)).toBe(true);
    expect(canRetry(MAX_ATTEMPTS)).toBe(false);
  });
  it("knows permanent errors", () => {
    expect(isPermanentSlackError("users_not_found")).toBe(true);
    expect(isPermanentSlackError("rate_limited")).toBe(false);
  });
});
