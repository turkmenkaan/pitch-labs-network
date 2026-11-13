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
export function currentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}
