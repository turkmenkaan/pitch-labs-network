// The platform runs on Eastern Time: members are in the DMV. Meeting times are
// typed, stored and shown in this zone no matter where the server (UTC on
// Vercel) or the browser is.

export const PLATFORM_TIME_ZONE = "America/New_York";

const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallParts(d: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of wallClock.formatToParts(d)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p;
}

// What the Eastern wall clock reads at this moment, as "YYYY-MM-DDTHH:mm"
// (the format of <input type="datetime-local">).
export function toEasternInput(d: Date): string {
  const p = wallParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// The moment at which the Eastern wall clock reads `raw` ("YYYY-MM-DDTHH:mm"),
// or null if it isn't a valid date and time.
export function parseEasternInput(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(asUtc)) return null;

  // Shift by the zone's offset at that moment. The offset can change at a
  // daylight-saving switch, so settle it with a second pass.
  let instant = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = wallParts(new Date(instant));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += asUtc - shown;
  }
  const result = new Date(instant);
  // Reject dates that roll over (2026-02-31) or don't exist (spring-forward gap).
  return toEasternInput(result) === raw ? result : null;
}
