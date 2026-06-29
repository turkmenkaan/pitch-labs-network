"use client";

import { useActionState } from "react";
import { setAvailability, type ActionState } from "../actions";

export function AvailabilityForm({
  advisorId,
  month,
  totalHours,
  committedHours,
}: {
  advisorId: string;
  month: string;
  totalHours: number;
  committedHours: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setAvailability,
    null
  );

  return (
    <form action={action} className="avail-form">
      <input type="hidden" name="advisorId" value={advisorId} />
      <input type="hidden" name="month" value={month} />

      <div className="field">
        <label htmlFor="totalHours">Hours I can give this month</label>
        <div className="hours-input">
          <input
            id="totalHours"
            name="totalHours"
            type="number"
            min={committedHours}
            step={1}
            defaultValue={totalHours}
            required
          />
          <span>hours / month</span>
        </div>
      </div>

      {state?.error && (
        <p className="note" style={{ color: "var(--clay)" }}>
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p className="note" style={{ color: "var(--green)" }}>
          {state.message}
        </p>
      )}

      <p className="note">
        Remaining hours decrease automatically as you accept meetings. You
        can&apos;t set this below the {committedHours}h already committed to
        accepted meetings.
      </p>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save availability"}
      </button>
    </form>
  );
}
