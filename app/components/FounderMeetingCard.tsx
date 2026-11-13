"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  recordFounderOutcome,
  withdrawRequest,
  type ActionState,
} from "../actions";
import { CancelMeeting } from "./CancelMeeting";
import { FOUNDER_STAGE_LABELS, type FounderStage } from "@/lib/meeting";

export type FounderMeetingView = {
  id: string;
  topic: string;
  advisorId: string;
  advisorName: string;
  advisorTitle: string;
  estimatedHours: number;
  month: string; // formatted
  stage: FounderStage;
  scheduledAtLabel: string | null;
  decisionNote: string | null;
  adminRuling: { met: boolean; note: string | null } | null;
  canCancel: boolean;
  cancelledBy: string | null; // "advisor" | "founder"
};

const STAGE_PILL: Record<FounderStage, string> = {
  WAITING_ADVISOR: "pill-pending",
  DECLINED: "pill-rejected",
  WITHDRAWN: "pill-withdrawn",
  CANCELLED: "pill-withdrawn",
  ACCEPTED: "pill-accepted",
  UPCOMING: "pill-upcoming",
  NEEDS_ANSWER: "pill-pending",
  AWAITING_ADVISOR: "pill-pending",
  UNDER_REVIEW: "pill-rejected",
  RULED: "pill-accepted",
  COMPLETED: "pill-accepted",
  DID_NOT_MEET: "pill-rejected",
};

function AnswerForm({ m, compact }: { m: FounderMeetingView; compact?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordFounderOutcome,
    null
  );
  return (
    <form action={action} className={compact ? "" : "stage-form"}>
      {!compact && (
        <p className="stage-prompt">
          Did your meeting with <b>{m.advisorName}</b> take place?
        </p>
      )}
      <input type="hidden" name="requestId" value={m.id} />
      <div className="stage-row">
        <button className="btn btn-accept" name="met" value="yes" disabled={pending}>
          Yes, we met
        </button>
        <button className="btn btn-reject" name="met" value="no" disabled={pending}>
          No, it didn&apos;t happen
        </button>
      </div>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </form>
  );
}

function WithdrawForm({ m }: { m: FounderMeetingView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    withdrawRequest,
    null
  );
  return (
    <form action={action} className="stage-form">
      <input type="hidden" name="requestId" value={m.id} />
      <button className="btn btn-reject" disabled={pending}>
        {pending ? "Withdrawing…" : "Withdraw request"}
      </button>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </form>
  );
}

export function FounderMeetingCard({ meeting: m }: { meeting: FounderMeetingView }) {
  return (
    <article className="card req meeting">
      <div className="req-top">
        <div>
          <h3>{m.topic}</h3>
          <p className="founder">
            <Link href={`/founder/advisors/${m.advisorId}`}>
              <strong>{m.advisorName}</strong>
            </Link>{" "}
            · {m.advisorTitle} · {m.estimatedHours}h · {m.month}
          </p>
        </div>
        <span className={`pill ${STAGE_PILL[m.stage]}`}>
          {FOUNDER_STAGE_LABELS[m.stage]}
        </span>
      </div>

      {m.stage === "WAITING_ADVISOR" && (
        <>
          <p className="stage-prompt muted" style={{ marginTop: 12 }}>
            Waiting on {m.advisorName} to accept or decline.
          </p>
          <WithdrawForm m={m} />
        </>
      )}

      {m.stage === "DECLINED" && (
        <p className="decision-note">
          {m.decisionNote ?? `${m.advisorName} declined this request.`}
        </p>
      )}

      {m.stage === "WITHDRAWN" && (
        <p className="stage-prompt muted" style={{ marginTop: 12 }}>
          You withdrew this request.
        </p>
      )}

      {m.stage === "CANCELLED" && (
        <p className="stage-prompt muted" style={{ marginTop: 12 }}>
          {m.cancelledBy === "advisor"
            ? `${m.advisorName} cancelled this meeting.`
            : "You cancelled this meeting."}{" "}
          The {m.estimatedHours}h are back in your monthly quota.
        </p>
      )}

      {m.stage === "ACCEPTED" && (
        <div className="stage-form">
          <p className="stage-prompt">
            Accepted. Arrange a time with {m.advisorName} directly.
            {m.decisionNote && <> They said: “{m.decisionNote}”</>}
          </p>
          <details className="reschedule">
            <summary>Already met?</summary>
            <AnswerForm m={m} compact />
          </details>
        </div>
      )}

      {m.stage === "UPCOMING" && (
        <p className="stage-prompt stage-form">
          {m.advisorName} noted <b>{m.scheduledAtLabel}</b>. We&apos;ll ask how it
          went once that time has passed.
        </p>
      )}

      {m.canCancel && (
        <div className="stage-form">
          <CancelMeeting
            requestId={m.id}
            side="founder"
            otherName={m.advisorName}
            hours={m.estimatedHours}
          />
        </div>
      )}

      {m.stage === "NEEDS_ANSWER" && <AnswerForm m={m} />}

      {m.stage === "AWAITING_ADVISOR" && (
        <p className="stage-prompt muted" style={{ marginTop: 12 }}>
          Thanks. Waiting for {m.advisorName} to confirm their side.
        </p>
      )}

      {m.stage === "UNDER_REVIEW" && (
        <p className="conflict-flag">
          You and {m.advisorName} gave different answers. An admin will review
          and the outcome will show here.
        </p>
      )}

      {m.stage === "RULED" && m.adminRuling && (
        <p className="stage-prompt stage-form">
          An admin ruled that this meeting{" "}
          <b>{m.adminRuling.met ? "took place" : "did not take place"}</b>.
          {m.adminRuling.note && <> Note: “{m.adminRuling.note}”</>}
        </p>
      )}

      {m.stage === "COMPLETED" && (
        <p className="stage-prompt muted" style={{ marginTop: 12 }}>
          You both confirmed this meeting took place.
        </p>
      )}

      {m.stage === "DID_NOT_MEET" && (
        <p className="stage-prompt muted" style={{ marginTop: 12 }}>
          You both confirmed this meeting didn&apos;t take place.
        </p>
      )}
    </article>
  );
}
