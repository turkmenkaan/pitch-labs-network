"use client";

import Link from "next/link";
import { useActionState } from "react";
import { decideRequest, type ActionState } from "../actions";

export type PendingRequest = {
  id: string;
  topic: string;
  message: string;
  estimatedHours: number;
  createdAt: string;
  founderId: string;
  founderName: string;
  founderCompany: string;
};

export function RequestCard({ request }: { request: PendingRequest }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    decideRequest,
    null
  );

  return (
    <article className="card req">
      <div className="req-top">
        <div>
          <h3>{request.topic}</h3>
          <p className="founder">
            <strong>{request.founderName}</strong> · {request.founderCompany}
          </p>
        </div>
        <span className="pill pill-pending">Pending</span>
      </div>

      <p className="message">{request.message}</p>

      <div className="meta">
        <span>
          <b>{request.estimatedHours}h</b> requested
        </span>
        <span>Sent {request.createdAt}</span>
        <Link href={`/founders/${request.founderId}`}>View dossier →</Link>
      </div>

      {state?.error && (
        <p className="note" style={{ color: "var(--clay)", marginTop: 12 }}>
          {state.error}
        </p>
      )}

      <form action={action} className="decision">
        <input type="hidden" name="requestId" value={request.id} />
        <input
          className="note-input"
          name="decisionNote"
          placeholder="Optional note to the founder…"
        />
        <button
          className="btn btn-reject"
          type="submit"
          name="decision"
          value="REJECTED"
          disabled={pending}
        >
          Reject
        </button>
        <button
          className="btn btn-accept"
          type="submit"
          name="decision"
          value="ACCEPTED"
          disabled={pending}
        >
          {pending ? "…" : "Accept"}
        </button>
      </form>
    </article>
  );
}
