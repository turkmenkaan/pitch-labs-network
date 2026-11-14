// Slack message templates. Pure functions, so they're easy to test. Anything a
// person typed (topics, reasons) is escaped so it can't inject Slack markup,
// links or mentions.

export type NotifyType =
  | "REQUEST_SENT"
  | "REQUEST_DECIDED"
  | "MEETING_CANCELLED"
  | "MEETING_CONFLICT";

export type Message = {
  text: string;
  // In-app page to link to, relative to APP_URL.
  path: string;
};

// Slack treats &, < and > as control characters in mrkdwn.
export function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const hours = (n: number) => `${n} hour${n === 1 ? "" : "s"}`;

export function requestSentMessage(a: {
  founderName: string;
  company: string | null;
  topic: string;
  estimatedHours: number;
}): Message {
  const from = a.company
    ? `${escapeSlack(a.founderName)} (${escapeSlack(a.company)})`
    : escapeSlack(a.founderName);
  return {
    text: `*New meeting request* from ${from}: "${escapeSlack(a.topic)}", about ${hours(a.estimatedHours)}. Accept or decline it in Pitch Labs Network.`,
    path: "/advisor",
  };
}

export function requestDecidedMessage(a: {
  advisorName: string;
  topic: string;
  accepted: boolean;
  note: string | null;
}): Message {
  const who = escapeSlack(a.advisorName);
  const topic = escapeSlack(a.topic);
  const note = a.note ? `\n> ${escapeSlack(a.note).replace(/\n/g, "\n> ")}` : "";
  return {
    text: a.accepted
      ? `*Request accepted.* ${who} accepted your meeting request "${topic}".${note}`
      : `*Request declined.* ${who} declined your meeting request "${topic}".${note}`,
    path: "/founder/meetings",
  };
}

export function meetingCancelledMessage(a: {
  cancelledByName: string;
  cancelledBy: "advisor" | "founder";
  topic: string;
  reason: string;
}): Message {
  return {
    text: `*Meeting cancelled.* ${escapeSlack(a.cancelledByName)} cancelled "${escapeSlack(a.topic)}".\n> ${escapeSlack(a.reason).replace(/\n/g, "\n> ")}`,
    // Sent to the other side, so link to their workspace.
    path: a.cancelledBy === "advisor" ? "/founder/meetings" : "/advisor",
  };
}

export function meetingConflictMessage(a: { summary: string }): Message {
  return {
    text: `*Meeting conflict needs review.* ${escapeSlack(a.summary)}`,
    path: "/admin",
  };
}

export function withLink(m: Message, appUrl: string | undefined): string {
  if (!appUrl) return m.text;
  const base = appUrl.replace(/\/+$/, "");
  return `${m.text}\n<${base}${m.path}|Open Pitch Labs Network>`;
}
