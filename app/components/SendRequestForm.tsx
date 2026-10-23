"use client";

import { useActionState } from "react";
import { sendMeetingRequest, type ActionState } from "../actions";

export function SendRequestForm({
  advisorId,
  advisorHoursLeft,
  maxHours,
}: {
  advisorId: string;
  advisorHoursLeft: number;
  maxHours: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendMeetingRequest,
    null
  );

  if (state?.ok) {
    return (
      <div className="request-sent">
        <strong>Request sent ✓</strong>
        <p className="note">
          {state.message} The advisor will review it and accept or decline.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="dossier-form">
      <input type="hidden" name="advisorId" value={advisorId} />

      <div className="field">
        <label htmlFor="topic">Topic *</label>
        <input
          id="topic"
          name="topic"
          placeholder="e.g. Pricing our enterprise tier"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="message">Message *</label>
        <textarea
          id="message"
          name="message"
          rows={4}
          placeholder="What would you like help with? A little context goes a long way."
          required
        />
      </div>

      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="estimatedHours">Estimated hours *</label>
        <input
          id="estimatedHours"
          name="estimatedHours"
          type="number"
          min={1}
          max={maxHours}
          step={1}
          defaultValue={1}
          required
        />
        <p className="note">
          {`Up to ${maxHours}h, from the hours you have left. `}
          {advisorHoursLeft > 0
            ? `The advisor has ${advisorHoursLeft}h open this month.`
            : "This advisor has no hours open this month, so your request may wait."}
        </p>
      </div>

      {state?.error && <p className="stage-error">{state.error}</p>}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send meeting request"}
      </button>
    </form>
  );
}
