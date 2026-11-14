"use client";

import { useActionState } from "react";
import {
  pickTimeAsAdvisor,
  pickTimeAsFounder,
  proposeTimesAsAdvisor,
  proposeTimesAsFounder,
  type ActionState,
} from "../actions";
import { MAX_SLOTS, type Side } from "@/lib/slots";

export type ProposalView = {
  by: Side;
  slots: { id: string; label: string }[];
} | null;

// Where two people settle on a time. Whoever has the move sees the times on the
// table (pick one, or suggest others); the other side sees what they sent.
export function TimeNegotiation({
  requestId,
  side,
  otherName,
  proposal,
}: {
  requestId: string;
  side: Side;
  otherName: string;
  proposal: ProposalView;
}) {
  if (!proposal) {
    return (
      <ProposeForm
        requestId={requestId}
        side={side}
        prompt={`Propose up to ${MAX_SLOTS} times that suit you, and ${otherName} picks one.`}
      />
    );
  }

  if (proposal.by === side) {
    return (
      <div className="stage-form">
        <p className="stage-prompt">
          You proposed these times. Waiting for {otherName} to pick one.
        </p>
        <ul className="slot-list">
          {proposal.slots.map((s) => (
            <li key={s.id}>{s.label}</li>
          ))}
        </ul>
        <details className="reschedule">
          <summary>Change proposed times</summary>
          <ProposeForm requestId={requestId} side={side} prompt="These replace the times above." />
        </details>
      </div>
    );
  }

  return (
    <PickForm
      requestId={requestId}
      side={side}
      otherName={otherName}
      proposal={proposal}
    />
  );
}

function ProposeForm({
  requestId,
  side,
  prompt,
}: {
  requestId: string;
  side: Side;
  prompt: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    side === "advisor" ? proposeTimesAsAdvisor : proposeTimesAsFounder,
    null
  );
  return (
    <form action={action} className="stage-form">
      <p className="stage-prompt">{prompt}</p>
      <input type="hidden" name="requestId" value={requestId} />
      {Array.from({ length: MAX_SLOTS }, (_, i) => (
        <input
          key={i}
          type="datetime-local"
          name="slot"
          aria-label={`Proposed time ${i + 1}`}
          required={i === 0}
          className="dt-input"
        />
      ))}
      <p className="stage-prompt muted">All times are in Eastern Time (ET).</p>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Propose times"}
      </button>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </form>
  );
}

function PickForm({
  requestId,
  side,
  otherName,
  proposal,
}: {
  requestId: string;
  side: Side;
  otherName: string;
  proposal: NonNullable<ProposalView>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    side === "advisor" ? pickTimeAsAdvisor : pickTimeAsFounder,
    null
  );
  return (
    <div className="stage-form">
      <form action={action}>
        <p className="stage-prompt">
          {otherName} suggested these times. Pick the one that works.
        </p>
        <input type="hidden" name="requestId" value={requestId} />
        <div className="slot-options" role="radiogroup" aria-label="Proposed times">
          {proposal.slots.map((s, i) => (
            <label key={s.id} className="slot-option">
              <input type="radio" name="slotId" value={s.id} defaultChecked={i === 0} />{" "}
              {s.label}
            </label>
          ))}
        </div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Confirming…" : "Confirm this time"}
        </button>
        {state?.error && <p className="stage-error">{state.error}</p>}
      </form>
      <details className="reschedule">
        <summary>None of these work</summary>
        <ProposeForm requestId={requestId} side={side} prompt="Suggest other times instead." />
      </details>
    </div>
  );
}
