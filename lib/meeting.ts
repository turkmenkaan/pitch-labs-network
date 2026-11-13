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
  adminMet?: boolean | null;
  advisorFeedback: string | null;
};

export function getMeetingStage(
  m: LifecycleFields,
  now: Date = new Date()
): MeetingStage | null {
  if (m.status !== "ACCEPTED") return null;

  // An admin's ruling on a conflict overrides the advisor's own answer.
  const met = m.adminMet ?? m.advisorMet;
  if (met === false) return "DID_NOT_MEET";
  if (met === true) {
    return m.advisorFeedback ? "COMPLETED_MET" : "NEEDS_FEEDBACK";
  }

  // Outcome not recorded yet.
  if (!m.scheduledAt) return "NEEDS_SCHEDULE";
  return m.scheduledAt.getTime() > now.getTime()
    ? "UPCOMING"
    : "AWAITING_OUTCOME";
}

// An accepted meeting can be cancelled by either side until it happens: while
// it has no recorded time or that time is still ahead, and before anyone has
// said whether it took place. After that they report the outcome instead.
export function canCancelMeeting(
  m: {
    status: string;
    scheduledAt: Date | null;
    advisorMet: boolean | null;
    founderMet?: boolean | null;
    adminMet?: boolean | null;
  },
  now: Date = new Date()
): boolean {
  return (
    m.status === "ACCEPTED" &&
    m.advisorMet == null &&
    m.founderMet == null &&
    m.adminMet == null &&
    (m.scheduledAt == null || m.scheduledAt.getTime() > now.getTime())
  );
}

export const STAGE_LABELS: Record<MeetingStage, string> = {
  NEEDS_SCHEDULE: "Needs a time",
  UPCOMING: "Upcoming",
  AWAITING_OUTCOME: "Did it happen?",
  NEEDS_FEEDBACK: "Add feedback",
  COMPLETED_MET: "Completed",
  DID_NOT_MEET: "Didn't happen",
};

// ---------------------------------------------------------------------------
// The founder's view of the same request. Scheduling happens outside the app
// (calendar of their choice), so `scheduledAt` is an optional note the advisor
// may have recorded, never a gate on the founder.
//
//   WAITING_ADVISOR          pending, advisor hasn't decided
//   DECLINED / WITHDRAWN     closed without a meeting
//   CANCELLED                accepted, then either side cancelled before it happened
//   ACCEPTED                 accepted, no time recorded: arrange it directly
//   UPCOMING                 accepted, advisor recorded a time that's ahead
//   NEEDS_ANSWER             a recorded time has passed and the founder hasn't
//                            said whether it happened
//   AWAITING_ADVISOR         founder answered, advisor hasn't yet
//   UNDER_REVIEW             the two answers disagree, an admin will rule
//   RULED                    an admin ruled on a conflict
//   COMPLETED / DID_NOT_MEET both answered the same way

export type FounderStage =
  | "WAITING_ADVISOR"
  | "DECLINED"
  | "WITHDRAWN"
  | "CANCELLED"
  | "ACCEPTED"
  | "UPCOMING"
  | "NEEDS_ANSWER"
  | "AWAITING_ADVISOR"
  | "UNDER_REVIEW"
  | "RULED"
  | "COMPLETED"
  | "DID_NOT_MEET";

type FounderFields = {
  status: string;
  scheduledAt: Date | null;
  advisorMet: boolean | null;
  founderMet: boolean | null;
  adminMet: boolean | null;
};

export function getFounderStage(
  m: FounderFields,
  now: Date = new Date()
): FounderStage {
  if (m.status === "PENDING") return "WAITING_ADVISOR";
  if (m.status === "REJECTED") return "DECLINED";
  if (m.status === "WITHDRAWN") return "WITHDRAWN";
  if (m.status === "CANCELLED") return "CANCELLED";

  // ACCEPTED from here on.
  if (m.adminMet != null) return "RULED";
  if (m.founderMet != null) {
    if (m.advisorMet == null) return "AWAITING_ADVISOR";
    if (m.advisorMet !== m.founderMet) return "UNDER_REVIEW";
    return m.founderMet ? "COMPLETED" : "DID_NOT_MEET";
  }

  // Founder hasn't answered.
  if (!m.scheduledAt) return "ACCEPTED";
  return m.scheduledAt.getTime() > now.getTime() ? "UPCOMING" : "NEEDS_ANSWER";
}

export const FOUNDER_STAGE_LABELS: Record<FounderStage, string> = {
  WAITING_ADVISOR: "Pending",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  CANCELLED: "Cancelled",
  ACCEPTED: "Accepted",
  UPCOMING: "Upcoming",
  NEEDS_ANSWER: "Did it happen?",
  AWAITING_ADVISOR: "Waiting on advisor",
  UNDER_REVIEW: "Under admin review",
  RULED: "Admin ruled",
  COMPLETED: "Completed",
  DID_NOT_MEET: "Didn't happen",
};
