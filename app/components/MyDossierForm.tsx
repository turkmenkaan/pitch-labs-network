"use client";

import { useActionState } from "react";
import { updateMyDossier, type ActionState } from "../actions";

export type DossierValues = {
  title: string;
  expertise: string;
  bio: string;
  experience: string;
  howIHelp: string;
  location: string;
  linkedinUrl: string;
};

export function MyDossierForm({ values }: { values: DossierValues }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateMyDossier,
    null
  );

  return (
    <form action={action} className="dossier-form">
      <div className="df-grid">
        <div className="field">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            name="title"
            defaultValue={values.title}
            placeholder="e.g. Former VP Growth, Stripe"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            defaultValue={values.location}
            placeholder="e.g. Austin, TX"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="expertise">Areas of expertise *</label>
        <input
          id="expertise"
          name="expertise"
          defaultValue={values.expertise}
          placeholder="Comma-separated, e.g. Pricing, GTM, Marketplaces"
          required
        />
        <p className="note">Founders browse advisors by these.</p>
      </div>

      <div className="field">
        <label htmlFor="bio">Short intro *</label>
        <textarea
          id="bio"
          name="bio"
          rows={2}
          defaultValue={values.bio}
          placeholder="A sentence or two on who you are."
          required
        />
      </div>

      <div className="field">
        <label htmlFor="experience">Experience</label>
        <textarea
          id="experience"
          name="experience"
          rows={3}
          defaultValue={values.experience}
          placeholder="Notable roles, exits, or wins."
        />
      </div>

      <div className="field">
        <label htmlFor="howIHelp">How I help founders</label>
        <textarea
          id="howIHelp"
          name="howIHelp"
          rows={3}
          defaultValue={values.howIHelp}
          placeholder="Your advising style and what you're best at."
        />
      </div>

      <div className="field">
        <label htmlFor="linkedinUrl">LinkedIn</label>
        <input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          defaultValue={values.linkedinUrl}
          placeholder="https://linkedin.com/in/…"
        />
      </div>

      {state?.error && (
        <p className="stage-error">{state.error}</p>
      )}
      {state?.ok && state.message && (
        <p className="note" style={{ color: "var(--green)" }}>
          {state.message}
        </p>
      )}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save dossier"}
      </button>
    </form>
  );
}
