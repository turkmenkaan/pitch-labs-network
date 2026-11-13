// Rejecting a request and cancelling a meeting both need a reason, which the
// other person sees. Returns the trimmed reason, or an error message to show.
export const MAX_REASON_LENGTH = 500;

export function checkReason(
  raw: string,
  action: "declining" | "cancelling"
): { reason: string } | { error: string } {
  const reason = raw.trim();
  if (!reason) return { error: `Add a reason for ${action}.` };
  if (reason.length > MAX_REASON_LENGTH) {
    return { error: `Keep the reason under ${MAX_REASON_LENGTH} characters.` };
  }
  return { reason };
}
