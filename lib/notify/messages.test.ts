import { describe, expect, it } from "vitest";
import {
  escapeSlack,
  meetingCancelledMessage,
  meetingConflictMessage,
  meetingLinkMessage,
  requestDecidedMessage,
  requestSentMessage,
  timeConfirmedMessage,
  timeSetMessage,
  timesProposedMessage,
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

  it("a proposal lists each time and points at the recipient's workspace", () => {
    const m = timesProposedMessage({
      proposerName: "Bo",
      recipient: "founder",
      topic: "Pricing",
      times: ["Nov 20, 2:00 PM ET", "Nov 21, 10:00 AM ET"],
    });
    expect(m.text).toContain("suggested times");
    expect(m.text).toContain("• Nov 20, 2:00 PM ET");
    expect(m.text).toContain("• Nov 21, 10:00 AM ET");
    expect(m.path).toBe("/founder/meetings");
    expect(
      timesProposedMessage({ proposerName: "Ada", recipient: "advisor", topic: "T", times: ["x"] })
    ).toMatchObject({ path: "/advisor" });
  });

  it("a single proposed time reads naturally and is escaped", () => {
    const m = timesProposedMessage({
      proposerName: "<b>",
      recipient: "advisor",
      topic: "T",
      times: ["Nov 20, 2:00 PM ET"],
    });
    expect(m.text).toContain("suggested a time");
    expect(m.text).toContain("&lt;b&gt;");
  });

  it("a confirmation names the picked time", () => {
    const m = timeConfirmedMessage({
      pickerName: "Ada",
      recipient: "advisor",
      topic: "Pricing",
      time: "Nov 20, 2:00 PM ET",
    });
    expect(m.text).toContain("Ada picked Nov 20, 2:00 PM ET");
    expect(m.path).toBe("/advisor");
  });

  it("confirmations carry the video link when there is one", () => {
    const base = { pickerName: "Ada", recipient: "advisor" as const, topic: "T", time: "Nov 20, 2:00 PM ET" };
    expect(timeConfirmedMessage(base).text).not.toContain("Join the video call");
    expect(
      timeConfirmedMessage({ ...base, meetingUrl: "https://zoom.us/j/1?a=1&b=2" }).text
    ).toContain("<https://zoom.us/j/1?a=1&amp;b=2|Join the video call>");
    expect(
      timeSetMessage({ advisorName: "Bo", topic: "T", time: "x", meetingUrl: "https://zoom.us/j/1" }).text
    ).toContain("<https://zoom.us/j/1|Join the video call>");
  });

  it("a new link tells the other side where to go", () => {
    const m = meetingLinkMessage({
      actorName: "Bo",
      recipient: "founder",
      topic: "<T>",
      meetingUrl: "https://meet.google.com/abc",
    });
    expect(m.text).toContain("Bo added the call link");
    expect(m.text).toContain("&lt;T&gt;");
    expect(m.text).toContain("<https://meet.google.com/abc|Join the video call>");
    expect(m.path).toBe("/founder/meetings");
  });

  it("a directly entered time tells the founder, escaped", () => {
    const m = timeSetMessage({ advisorName: "Bo", topic: "<T>", time: "Nov 20, 2:00 PM ET" });
    expect(m.text).toContain("Bo set");
    expect(m.text).toContain("Nov 20, 2:00 PM ET");
    expect(m.text).toContain("&lt;T&gt;");
    expect(m.path).toBe("/founder/meetings");
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
