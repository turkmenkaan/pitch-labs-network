"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  scheduleMeeting,
  recordOutcome,
  submitFeedback,
  type ActionState,
} from "../actions";
import type { MeetingStage } from "@/lib/meeting";
import { CancelForm, CancelMeeting } from "./CancelMeeting";
import { TimeNegotiation, type ProposalView } from "./TimeNegotiation";
import { STAGE_LABELS } from "@/lib/meeting";

export type MeetingView = {
  id: string;
  topic: string;
  founderId: string;
  founderName: string;
  founderCompany: string;
  estimatedHours: number;
  stage: MeetingStage;
  scheduledAtInput: string | null; // "YYYY-MM-DDTHH:mm" for datetime-local
  scheduledAtLabel: string | null; // human-readable
  advisorRating: number | null;
  advisorFeedback: string | null;
  hasConflict: boolean;
  canCancel: boolean;
  proposal: ProposalView;
};

const STAGE_PILL: Record<MeetingStage, string> = {
  NEEDS_SCHEDULE: "pill-pending",
  TIME_PROPOSED: "pill-pending",
  PICK_A_TIME: "pill-pending",
  UPCOMING: "pill-upcoming",
  AWAITING_OUTCOME: "pill-pending",
  NEEDS_FEEDBACK: "pill-pending",
  COMPLETED_MET: "pill-accepted",
  DID_NOT_MEET: "pill-rejected",
};

function Header({ m }: { m: MeetingView }) {
  return (
    <div className="req-top">
      <div>
        <h3>{m.topic}</h3>
        <p className="founder">
          <strong>{m.founderName}</strong> · {m.founderCompany} ·{" "}
          {m.estimatedHours}h ·{" "}
          <Link href={`/founders/${m.founderId}`}>dossier →</Link>
        </p>
      </div>
      <span className={`pill ${STAGE_PILL[m.stage]}`}>
        {STAGE_LABELS[m.stage]}
      </span>
    </div>
  );
}

function ScheduleForm({ m }: { m: MeetingView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    scheduleMeeting,
    null
  );
  return (
    <form action={action} className="stage-form">
      <p className="stage-prompt">
        Agreed a time already, outside the app? Enter it here.
      </p>
      <input type="hidden" name="requestId" value={m.id} />
      <div className="stage-row">
        <input
          type="datetime-local"
          name="scheduledAt"
          defaultValue={m.scheduledAtInput ?? undefined}
          required
          className="dt-input"
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : m.scheduledAtInput ? "Update time" : "Set time"}
        </button>
      </div>
      <p className="stage-prompt muted">All times are in Eastern Time (ET).</p>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </form>
  );
}

// Agreeing a time: propose or pick through the app, or enter a time that was
// settled elsewhere.
function Scheduling({ m }: { m: MeetingView }) {
  return (
    <>
      <TimeNegotiation
        requestId={m.id}
        side="advisor"
        otherName={m.founderName}
        proposal={m.proposal}
      />
      <details className="reschedule">
        <summary>Already agreed a time?</summary>
        <ScheduleForm m={m} />
      </details>
    </>
  );
}

// An upcoming meeting can be rescheduled or cancelled. The two sit side by side
// and open one panel below, one at a time.
function UpcomingActions({ m }: { m: MeetingView }) {
  const [open, setOpen] = useState<"reschedule" | "cancel" | null>(null);
  const toggle = (which: "reschedule" | "cancel") =>
    setOpen(open === which ? null : which);
  return (
    <>
      <div className="stage-toggles">
        {!m.proposal && (
          <button
            type="button"
            className="stage-toggle"
            aria-expanded={open === "reschedule"}
            onClick={() => toggle("reschedule")}
          >
            Reschedule
          </button>
        )}
        {m.canCancel && (
          <button
            type="button"
            className="stage-toggle"
            aria-expanded={open === "cancel"}
            onClick={() => toggle("cancel")}
          >
            Cancel meeting
          </button>
        )}
      </div>
      {open === "reschedule" && <Scheduling m={m} />}
      {open === "cancel" && (
        <CancelForm
          requestId={m.id}
          side="advisor"
          otherName={m.founderName}
          hours={m.estimatedHours}
        />
      )}
    </>
  );
}

function OutcomeForm({ m }: { m: MeetingView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordOutcome,
    null
  );
  return (
    <div className="stage-form">
      <p className="stage-prompt">
        Your meeting was scheduled for <b>{m.scheduledAtLabel}</b>. Did it
        happen?
      </p>
      <form action={action} className="stage-row">
        <input type="hidden" name="requestId" value={m.id} />
        <button
          className="btn btn-accept"
          name="met"
          value="yes"
          disabled={pending}
        >
          Yes, we met
        </button>
        <button
          className="btn btn-reject"
          name="met"
          value="no"
          disabled={pending}
        >
          No, it didn&apos;t happen
        </button>
      </form>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </div>
  );
}

function FeedbackForm({ m }: { m: MeetingView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    submitFeedback,
    null
  );
  const [rating, setRating] = useState(0);
  return (
    <form action={action} className="stage-form">
      <p className="stage-prompt">Glad it happened. How did it go?</p>
      <input type="hidden" name="requestId" value={m.id} />
      <input type="hidden" name="rating" value={rating} />
      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`star ${n <= rating ? "on" : ""}`}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={n <= rating}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="feedback"
        className="feedback-input"
        placeholder="What did you cover? Anything the network should know?"
        rows={3}
      />
      {state?.error && <p className="stage-error">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Submit feedback"}
      </button>
    </form>
  );
}

export function MeetingCard({ meeting: m }: { meeting: MeetingView }) {
  return (
    <article className="card req meeting">
      <Header m={m} />

      {(m.stage === "NEEDS_SCHEDULE" ||
        m.stage === "TIME_PROPOSED" ||
        m.stage === "PICK_A_TIME") && <Scheduling m={m} />}

      {m.stage === "UPCOMING" && (
        <div className="stage-form">
          <p className="stage-prompt">
            Confirmed for <b>{m.scheduledAtLabel}</b>. We&apos;ll ask how it went
            once the time passes.
          </p>
          {m.proposal && <Scheduling m={m} />}
          <UpcomingActions m={m} />
        </div>
      )}

      {m.stage === "AWAITING_OUTCOME" && <OutcomeForm m={m} />}

      {m.stage === "NEEDS_FEEDBACK" && <FeedbackForm m={m} />}

      {m.stage === "COMPLETED_MET" && (
        <div className="stage-form">
          <div className="rating-readout" aria-label={`Rated ${m.advisorRating} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`star ${n <= (m.advisorRating ?? 0) ? "on" : ""}`}
              >
                ★
              </span>
            ))}
          </div>
          {m.advisorFeedback && (
            <p className="decision-note">{m.advisorFeedback}</p>
          )}
        </div>
      )}

      {m.stage === "DID_NOT_MEET" && (
        <p className="stage-prompt muted">
          Marked as didn&apos;t happen.
          {m.hasConflict && " The founder reported otherwise — flagged to admins."}
        </p>
      )}

      {m.canCancel && m.stage !== "UPCOMING" && (
        <div className="stage-form">
          <CancelMeeting
            requestId={m.id}
            side="advisor"
            otherName={m.founderName}
            hours={m.estimatedHours}
          />
        </div>
      )}

      {m.hasConflict && m.stage !== "DID_NOT_MEET" && (
        <p className="conflict-flag">
          ⚠ Your answer conflicts with the founder&apos;s — this has been flagged
          to admins.
        </p>
      )}
    </article>
  );
}
