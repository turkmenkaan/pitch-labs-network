import { PLATFORM_TIME_ZONE } from "./time";

// All dates and times are shown in the platform's time zone (Eastern), not the
// server's.
const tz = { timeZone: PLATFORM_TIME_ZONE } as const;

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    ...tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    ...tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A meeting's time, labelled so nobody has to guess the zone.
export function fmtMeetingTime(d: Date, { weekday = false } = {}): string {
  return `${d.toLocaleString("en-US", {
    ...tz,
    ...(weekday && { weekday: "short" as const }),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}
