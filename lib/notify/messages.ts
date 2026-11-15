// Slack message templates. Pure functions, so they're easy to test. Anything a
// person typed (topics, reasons) is escaped so it can't inject Slack markup,
// links or mentions.

export type NotifyType =
  | "REQUEST_SENT"
  | "REQUEST_DECIDED"
  | "MEETING_CANCELLED"
  | "TIMES_PROPOSED"
  | "TIME_CONFIRMED"
  | "TIME_SET"
  | "MEETING_LINK_SET"
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

// A Slack link to a validated meeting URL. `|` and `>` would end the link early.
const joinLink = (url: string) =>
  `\n<${url.replace(/&/g, "&amp;").replace(/\|/g, "%7C").replace(/[<>]/g, "")}|Join the video call>`;

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

// Where the person being told should go: the other side of whoever acted.
const workspacePath = (recipient: "advisor" | "founder") =>
  recipient === "advisor" ? "/advisor" : "/founder/meetings";

// `times` are already formatted in Eastern Time (see fmtMeetingTime).
export function timesProposedMessage(a: {
  proposerName: string;
  recipient: "advisor" | "founder";
  topic: string;
  times: string[];
}): Message {
  const list = a.times.map((t) => `\n• ${escapeSlack(t)}`).join("");
  return {
    text: `*Times proposed.* ${escapeSlack(a.proposerName)} suggested ${a.times.length === 1 ? "a time" : "times"} for "${escapeSlack(a.topic)}":${list}\nPick one, or propose your own.`,
    path: workspacePath(a.recipient),
  };
}

export function timeConfirmedMessage(a: {
  pickerName: string;
  recipient: "advisor" | "founder";
  topic: string;
  time: string;
  meetingUrl?: string | null;
}): Message {
  return {
    text: `*Time confirmed.* ${escapeSlack(a.pickerName)} picked ${escapeSlack(a.time)} for "${escapeSlack(a.topic)}".${a.meetingUrl ? joinLink(a.meetingUrl) : ""}`,
    path: workspacePath(a.recipient),
  };
}

// The advisor entered a time they had already agreed outside the app.
export function timeSetMessage(a: {
  advisorName: string;
  topic: string;
  time: string;
  meetingUrl?: string | null;
}): Message {
  return {
    text: `*Meeting time set.* ${escapeSlack(a.advisorName)} set "${escapeSlack(a.topic)}" for ${escapeSlack(a.time)}.${a.meetingUrl ? joinLink(a.meetingUrl) : ""}`,
    path: "/founder/meetings",
  };
}

// Someone added or changed the video link on a meeting that has a time.
export function meetingLinkMessage(a: {
  actorName: string;
  recipient: "advisor" | "founder";
  topic: string;
  meetingUrl: string;
}): Message {
  return {
    text: `*Video link added.* ${escapeSlack(a.actorName)} added the call link for "${escapeSlack(a.topic)}".${joinLink(a.meetingUrl)}`,
    path: workspacePath(a.recipient),
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
