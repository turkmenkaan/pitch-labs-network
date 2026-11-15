"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";
import {
  addAdmin,
  createMember,
  removeAdmin,
  resolveConflict,
  retryNotification,
  setMemberActive,
  updateMember,
} from "../actions";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "adm-msg adm-msg-ok" : "adm-msg adm-msg-err"} role="status">
      {state.ok ? state.message : state.error}
    </p>
  );
}

// --- Members ---------------------------------------------------------------
export function AddMemberForm({ type }: { type: "advisor" | "founder" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createMember,
    null
  );
  return (
    <form action={action} className="adm-form" key={state?.ok ? "done" : "open"}>
      <input type="hidden" name="type" value={type} />
      <label className="adm-field">
        <span>Name</span>
        <input name="name" required placeholder="Full name" />
      </label>
      <label className="adm-field">
        <span>Slack email</span>
        <input name="email" type="email" required placeholder="name@company.com" />
      </label>
      <label className="adm-field">
        <span>{type === "advisor" ? "Title (optional)" : "Company (optional)"}</span>
        <input
          name="extra"
          placeholder={type === "advisor" ? "Former CFO, Acme" : "Acme Inc."}
        />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : `Add ${type}`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function EditMemberForm({
  type,
  id,
  name,
  email,
  monthlyHoursLimit,
  advisorCallLimit,
  alsoRoles = [],
}: {
  type: "advisor" | "founder";
  id: string;
  name: string;
  email: string;
  monthlyHoursLimit?: number | null;
  advisorCallLimit?: number | null;
  /** Other roles held under this same email; they follow an email change. */
  alsoRoles?: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateMember,
    null
  );
  return (
    <form action={action} className="adm-form adm-form-inline">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <label className="adm-field">
        <span>Name</span>
        <input name="name" defaultValue={name} required />
      </label>
      <label className="adm-field">
        <span>Slack email</span>
        <input name="email" type="email" defaultValue={email} required />
      </label>
      {alsoRoles.length > 0 && (
        <p className="adm-sub" data-testid="shared-email-note">
          This person is also {alsoRoles.join(" and ")}. Changing the email updates{" "}
          {alsoRoles.length === 1 ? "that role" : "those roles"} too, and an admin who
          changes their own email will be signed out.
        </p>
      )}
      {type === "founder" && (
        <>
          <label className="adm-field">
            <span>Hours / month (default 4)</span>
            <input
              name="monthlyHoursLimit"
              type="number"
              min={1}
              max={40}
              step={1}
              defaultValue={monthlyHoursLimit ?? ""}
              placeholder="default"
            />
          </label>
          <label className="adm-field">
            <span>Calls per advisor (default 2)</span>
            <input
              name="advisorCallLimit"
              type="number"
              min={1}
              max={40}
              step={1}
              defaultValue={advisorCallLimit ?? ""}
              placeholder="default"
            />
          </label>
        </>
      )}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ActiveToggle({
  type,
  id,
  active,
}: {
  type: "advisor" | "founder";
  id: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setMemberActive,
    null
  );
  return (
    <form action={action}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button
        className={active ? "btn btn-reject btn-sm" : "btn btn-ghost btn-sm"}
        disabled={pending}
      >
        {pending ? "…" : active ? "Deactivate" : "Reactivate"}
      </button>
      {state && !state.ok && <Feedback state={state} />}
    </form>
  );
}

// --- Admins ----------------------------------------------------------------
export function AddAdminForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addAdmin,
    null
  );
  return (
    <form action={action} className="adm-form" key={state?.ok ? "done" : "open"}>
      <label className="adm-field">
        <span>Name</span>
        <input name="name" required placeholder="Full name" />
      </label>
      <label className="adm-field">
        <span>Slack email</span>
        <input name="email" type="email" required placeholder="name@company.com" />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add admin"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveAdminButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    removeAdmin,
    null
  );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-reject btn-sm" disabled={pending}>
        {pending ? "…" : "Remove"}
      </button>
      {state && !state.ok && <Feedback state={state} />}
    </form>
  );
}

// --- Conflicts -------------------------------------------------------------
export function ResolveConflictForm({ notificationId }: { notificationId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resolveConflict,
    null
  );
  return (
    <form action={action} className="adm-resolve">
      <input type="hidden" name="notificationId" value={notificationId} />
      <fieldset className="adm-rule">
        <legend>Your ruling</legend>
        <label>
          <input type="radio" name="ruling" value="met" required /> It happened
        </label>
        <label>
          <input type="radio" name="ruling" value="not_met" /> It did not happen
        </label>
      </fieldset>
      <input
        className="adm-note"
        name="note"
        required
        placeholder="Why — a short note for the record"
      />
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Resolve"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function RetryNotificationForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    retryNotification,
    null
  );
  return (
    <form action={action}>
      <input type="hidden" name="notificationId" value={id} />
      <button className="btn" disabled={pending}>
        {pending ? "Retrying…" : "Retry"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
