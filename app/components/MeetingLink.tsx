"use client";

import { useActionState, useState } from "react";
import {
  setMeetingLinkAsAdvisor,
  setMeetingLinkAsFounder,
  type ActionState,
} from "../actions";

export type LinkView = {
  url: string | null;
  // Who added it, so the other side can see why they can't change it.
  setBy: "advisor" | "founder" | null;
  canEdit: boolean;
};

// The call link on an accepted meeting: a Join button for whoever has it, and a
// form for whoever may change it. With no link and nothing to add, shows nothing.
export function MeetingLink({
  requestId,
  side,
  otherName,
  link,
}: {
  requestId: string;
  side: "advisor" | "founder";
  otherName: string;
  link: LinkView;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    side === "advisor" ? setMeetingLinkAsAdvisor : setMeetingLinkAsFounder,
    null
  );
  // Controlled, so a refused link stays in the box instead of being wiped when
  // the form resets after the action.
  const [value, setValue] = useState(link.url ?? "");
  if (!link.url && !link.canEdit) return null;

  const form = (
    <form action={action} className="stage-form">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="stage-row">
        <input
          type="url"
          name="meetingUrl"
          aria-label="Video call link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://meet.google.com/…"
          className="dt-input"
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : link.url ? "Update link" : "Add link"}
        </button>
      </div>
      <p className="stage-prompt muted">
        Google Meet, Zoom, Microsoft Teams or Whereby. Leave it empty and save to
        remove the link.
      </p>
      {state?.error && <p className="stage-error">{state.error}</p>}
      {state?.ok && state.message && <p className="note">{state.message}</p>}
    </form>
  );

  if (!link.url) {
    return (
      <div className="stage-form meeting-link">
        <p className="stage-prompt">Add the video call link for this meeting.</p>
        {form}
      </div>
    );
  }

  const host = new URL(link.url).hostname;
  return (
    <div className="stage-form meeting-link">
      <div className="stage-row">
        <a
          className="btn btn-primary"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join video call
        </a>
        <span className="stage-prompt muted">
          {host} ·{" "}
          {link.setBy === side
            ? "added by you"
            : `added by ${otherName}`}
        </span>
      </div>
      {link.canEdit && (
        <details className="reschedule">
          <summary>Change link</summary>
          {form}
        </details>
      )}
    </div>
  );
}
