import { parseEasternInput } from "./time";

// Times proposed for an accepted meeting. Either side proposes up to
// MAX_SLOTS; the other side picks one or answers with times of their own.
export const MAX_SLOTS = 3;

export type Side = "advisor" | "founder";

// Validates the datetime-local values a form sent (Eastern wall-clock time).
// Blank inputs are ignored, so a form can offer three boxes and need only one.
export function checkSlots(
  raw: string[],
  now: Date = new Date()
): { slots: Date[] } | { error: string } {
  const filled = raw.map((r) => r.trim()).filter(Boolean);
  if (filled.length === 0) return { error: "Propose at least one time." };
  if (filled.length > MAX_SLOTS) {
    return { error: `Propose at most ${MAX_SLOTS} times.` };
  }

  const slots: Date[] = [];
  for (const value of filled) {
    const at = parseEasternInput(value);
    if (!at) return { error: "One of those date/times isn't valid." };
    if (at.getTime() <= now.getTime()) return { error: "Pick times in the future." };
    if (slots.some((s) => s.getTime() === at.getTime())) {
      return { error: "Each proposed time must be different." };
    }
    slots.push(at);
  }
  return { slots: slots.sort((a, b) => a.getTime() - b.getTime()) };
}

type SlotRow = { id: string; startsAt: Date; proposedBy: string; status: string };

// The proposal waiting for an answer: OPEN slots that are still in the future,
// and which side made them. Null when nothing is on the table.
export function openProposal<T extends SlotRow>(
  slots: T[],
  now: Date = new Date()
): { by: Side; slots: T[] } | null {
  const open = slots
    .filter((s) => s.status === "OPEN" && s.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (open.length === 0) return null;
  return { by: open[0].proposedBy as Side, slots: open };
}

export const otherSide = (side: Side): Side =>
  side === "advisor" ? "founder" : "advisor";
