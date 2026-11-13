"use client";

import { useActionState } from "react";
import {
  cancelMeetingAsAdvisor,
  cancelMeetingAsFounder,
  type ActionState,
} from "../actions";

// "Cancel meeting" for an accepted meeting that hasn't happened yet. Opens a
// small confirmation first, since cancelling can't be undone.
export function CancelMeeting({
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
    <details className="reschedule">
      <summary>Cancel meeting</summary>
      <form action={action} className="stage-form">
        <p className="stage-prompt">
          Cancel this meeting with {otherName}? The {hours}h go back to{" "}
          {side === "advisor" ? "your availability and their quota" : "your quota and their availability"}
          . This can&apos;t be undone.
        </p>
        <input type="hidden" name="requestId" value={requestId} />
        <button className="btn btn-reject" disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel meeting"}
        </button>
        {state?.error && <p className="stage-error">{state.error}</p>}
      </form>
    </details>
  );
}
