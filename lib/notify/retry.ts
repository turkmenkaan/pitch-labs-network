// Retry policy for failed Slack sends.
export const MAX_ATTEMPTS = 5;

// Wait before attempt number `attempts + 1`: 1 min, 5 min, 30 min, 2 h, then 6 h.
const STEPS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];

export function backoffMs(attempts: number): number {
  const i = Math.min(Math.max(attempts, 1), STEPS_MS.length) - 1;
  return STEPS_MS[i];
}

export function canRetry(attempts: number): boolean {
  return attempts < MAX_ATTEMPTS;
}

// Slack errors that retrying can't fix for this recipient.
const PERMANENT = new Set(["users_not_found", "user_disabled", "cannot_dm_bot"]);
export function isPermanentSlackError(code: string): boolean {
  return PERMANENT.has(code);
}
