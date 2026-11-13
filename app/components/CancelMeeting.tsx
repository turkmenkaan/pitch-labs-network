"use client";

import { useActionState } from "react";
import { MAX_REASON_LENGTH } from "@/lib/reason";
import {
  cancelMeetingAsAdvisor,
  cancelMeetingAsFounder,
  type ActionState,
} from "../actions";

// The confirmation form for cancelling an accepted meeting that hasn't happened
// yet. Cancelling can't be undone, so it asks for a reason and spells out what
// happens to the hours.
export function CancelForm({
  requestId,
  side,
  otherName,
  hours,
}: {
  requestId: string;
  side: "advisor" | "founder";
  otherName: string;
  hours: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    side === "advisor" ? cancelMeetingAsAdvisor : cancelMeetingAsFounder,
    null
  );
  return (
    <form action={action} className="stage-form">
      <p className="stage-prompt">
        Cancel this meeting with {otherName}? The {hours}h go back to{" "}
        {side === "advisor" ? "your availability and their quota" : "your quota and their availability"}
        . This can&apos;t be undone.
      </p>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="stage-prompt" htmlFor={`reason-${requestId}`}>
        Reason (shared with {otherName})
      </label>
      <textarea
        id={`reason-${requestId}`}
        name="reason"
        className="feedback-input"
        rows={2}
        maxLength={MAX_REASON_LENGTH}
        required
        placeholder="Why are you cancelling?"
      />
      <button className="btn btn-reject" disabled={pending}>
        {pending ? "Cancelling…" : "Yes, cancel meeting"}
      </button>
      {state?.error && <p className="stage-error">{state.error}</p>}
    </form>
  );
}

// "Cancel meeting" as a link that opens the confirmation below it.
export function CancelMeeting(props: React.ComponentProps<typeof CancelForm>) {
  return (
    <details className="reschedule">
      <summary>Cancel meeting</summary>
      <CancelForm {...props} />
    </details>
  );
}
