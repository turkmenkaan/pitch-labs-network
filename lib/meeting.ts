// Derives where an ACCEPTED meeting is in its lifecycle, so the UI doesn't have
// to juggle the underlying nullable fields directly.
//
//   NEEDS_SCHEDULE   accepted, no agreed date/time yet
//   UPCOMING         scheduled, meeting is in the future
//   AWAITING_OUTCOME scheduled time has passed, advisor hasn't said if it happened
//   NEEDS_FEEDBACK   advisor confirmed it happened, hasn't left feedback
//   COMPLETED_MET    happened + feedback recorded
//   DID_NOT_MEET     advisor said it didn't happen

export type MeetingStage =
  | "NEEDS_SCHEDULE"
  | "UPCOMING"
  | "AWAITING_OUTCOME"
  | "NEEDS_FEEDBACK"
  | "COMPLETED_MET"
  | "DID_NOT_MEET";

type LifecycleFields = {
  status: string;
  scheduledAt: Date | null;
  advisorMet: boolean | null;
  advisorFeedback: string | null;
};

export function getMeetingStage(
  m: LifecycleFields,
  now: Date = new Date()
): MeetingStage | null {
  if (m.status !== "ACCEPTED") return null;

  if (m.advisorMet === false) return "DID_NOT_MEET";
  if (m.advisorMet === true) {
    return m.advisorFeedback ? "COMPLETED_MET" : "NEEDS_FEEDBACK";
  }

  // Outcome not recorded yet.
  if (!m.scheduledAt) return "NEEDS_SCHEDULE";
  return m.scheduledAt.getTime() > now.getTime()
    ? "UPCOMING"
    : "AWAITING_OUTCOME";
}

export const STAGE_LABELS: Record<MeetingStage, string> = {
  NEEDS_SCHEDULE: "Needs a time",
  UPCOMING: "Upcoming",
  AWAITING_OUTCOME: "Did it happen?",
  NEEDS_FEEDBACK: "Add feedback",
  COMPLETED_MET: "Completed",
  DID_NOT_MEET: "Didn't happen",
};
