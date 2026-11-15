// The video call link for an accepted meeting. One link per meeting, owned by
// whoever set it (the advisor's default is copied in when they accept). Only
// links to the hosts below are accepted, and only over https.

export const MAX_MEETING_URL_LENGTH = 500;

// A host matches if it is one of these or a subdomain of one (zoom.us also
// covers us02web.zoom.us).
export const MEETING_HOSTS = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
] as const;

const HOSTS_HELP =
  "Google Meet, Zoom, Microsoft Teams or Whereby";

const hostAllowed = (host: string) =>
  MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

// "" means no link. Otherwise returns the normalised https URL or an error
// that is safe to show.
export function parseMeetingUrl(
  raw: string
): { url: string | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { url: null };
  if (text.length > MAX_MEETING_URL_LENGTH) {
    return {
      error: `That link is too long (max ${MAX_MEETING_URL_LENGTH} characters).`,
    };
  }
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { error: "That doesn't look like a link. Paste the full https:// address." };
  }
  if (u.protocol !== "https:") {
    return { error: "The link must start with https://" };
  }
  if (u.username || u.password) {
    return { error: "The link can't contain a username or password." };
  }
  if (!hostAllowed(u.hostname.toLowerCase())) {
    return { error: `Use a ${HOSTS_HELP} link.` };
  }
  return { url: u.toString() };
}

type LinkFields = {
  status: string;
  scheduledAt: Date | null;
  advisorMet: boolean | null;
  founderMet: boolean | null;
  adminMet: boolean | null;
  meetingUrl: string | null;
  meetingUrlSetBy: string | null;
};

const noOutcome = (m: Pick<LinkFields, "advisorMet" | "founderMet" | "adminMet">) =>
  m.advisorMet == null && m.founderMet == null && m.adminMet == null;

// The link people see and click: only while the meeting is still ahead of an
// outcome, and only if it still passes the checks above.
export function visibleMeetingUrl(m: LinkFields): string | null {
  if (m.status !== "ACCEPTED" || !noOutcome(m) || !m.meetingUrl) return null;
  const parsed = parseMeetingUrl(m.meetingUrl);
  return "url" in parsed ? parsed.url : null;
}

// Whoever set the link owns it and is the only one who can change or clear it.
// With no link yet, either side can add one, but only once a time is agreed.
export function canEditMeetingLink(
  m: LinkFields,
  side: "advisor" | "founder"
): boolean {
  if (m.status !== "ACCEPTED" || !noOutcome(m)) return false;
  if (m.meetingUrl) return m.meetingUrlSetBy === side;
  return m.scheduledAt != null;
}
