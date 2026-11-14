"use client";

import { useActionState } from "react";
import { updateFounderProfile, type ActionState } from "../actions";
import { FOUNDER_STAGES } from "@/lib/profile";

export type FounderProfileValues = {
  name: string;
  company: string;
  oneLiner: string;
  stage: string;
  industry: string;
  website: string;
  about: string;
  traction: string;
  lookingFor: string;
};

export function FounderProfileForm({
  values,
}: {
  values: FounderProfileValues;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateFounderProfile,
    null
  );

  return (
    <form action={action} className="dossier-form">
      <div className="df-grid">
        <div className="field">
          <label htmlFor="name">Your name *</label>
          <input id="name" name="name" defaultValue={values.name} required />
        </div>
        <div className="field">
          <label htmlFor="company">Company *</label>
          <input
            id="company"
            name="company"
            defaultValue={values.company}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="oneLiner">One-liner</label>
        <input
          id="oneLiner"
          name="oneLiner"
          defaultValue={values.oneLiner}
          placeholder="One sentence on what you're building."
        />
      </div>

      <div className="df-grid">
        <div className="field">
          <label htmlFor="stage">Stage</label>
          <select id="stage" name="stage" defaultValue={values.stage}>
            <option value="">Select a stage</option>
            {/* A stored value that isn't on the list stays selectable. */}
            {values.stage &&
              !(FOUNDER_STAGES as readonly string[]).includes(values.stage) && (
                <option value={values.stage}>{values.stage}</option>
              )}
            {FOUNDER_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="industry">Industry</label>
          <input
            id="industry"
            name="industry"
            defaultValue={values.industry}
            placeholder="e.g. Fintech"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="url"
          defaultValue={values.website}
          placeholder="https://…"
        />
      </div>

      <div className="field">
        <label htmlFor="about">What you&apos;re building</label>
        <textarea
          id="about"
          name="about"
          rows={3}
          defaultValue={values.about}
        />
      </div>

      <div className="field">
        <label htmlFor="traction">Traction</label>
        <textarea
          id="traction"
          name="traction"
          rows={2}
          defaultValue={values.traction}
          placeholder="Revenue, users, pilots — whatever's relevant."
        />
      </div>

      <div className="field">
        <label htmlFor="lookingFor">What you&apos;re looking for</label>
        <textarea
          id="lookingFor"
          name="lookingFor"
          rows={2}
          defaultValue={values.lookingFor}
          placeholder="What kind of advice or help would move the needle?"
        />
      </div>

      {state?.error && <p className="stage-error">{state.error}</p>}
      {state?.ok && state.message && (
        <p className="note" style={{ color: "var(--green)" }}>
          {state.message}
        </p>
      )}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
