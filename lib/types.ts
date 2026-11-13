import { toEasternInput } from "./time";

export type RequestStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CANCELLED";

export const REQUEST_STATUSES: RequestStatus[] = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "CANCELLED",
];

// Current month as "YYYY-MM" — the month availability is tracked against.
// Read in the platform's time zone, so the month rolls over at Eastern midnight
// whatever the server's clock is.
export function currentMonth(date = new Date()): string {
  return toEasternInput(date).slice(0, 7);
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}
