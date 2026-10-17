import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { formatMonth } from "@/lib/types";
import { ResolveConflictForm } from "../_components/forms";

const said = (v: boolean | null) =>
  v == null ? "No answer yet" : v ? "It happened" : "It did not happen";

export default async function ConflictsPage() {
  const all = await prisma.adminNotification.findMany({
    where: { type: "MEETING_CONFLICT" },
    orderBy: { createdAt: "desc" },
    include: { meetingRequest: { include: { advisor: true, founder: true } } },
  });
  const open = all.filter((c) => !c.resolved);
  const resolved = all.filter((c) => c.resolved);

  const admins = await prisma.admin.findMany({ select: { id: true, name: true } });
  const adminName = (id: string | null) => admins.find((a) => a.id === id)?.name ?? "a former admin";

  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Rulings</p>
        <h1>Conflicts</h1>
        <p className="adm-sub">
          Raised when an advisor and a founder disagree about whether a meeting took
          place. Your ruling becomes the meeting&apos;s outcome.
        </p>
      </div>

      <div className="adm-sec-head"><h2>Awaiting a ruling</h2><span className="adm-count">{open.length}</span></div>
      {open.length === 0 && <p className="adm-empty">No open conflicts.</p>}
      <div className="adm-stack">
        {open.map((c) => {
          const m = c.meetingRequest;
          return (
            <article className="adm-case" key={c.id}>
              <header>
                <h3>{m.topic}</h3>
                <p className="mono">
                  {formatMonth(m.month)} · {m.estimatedHours}h
                  {m.scheduledAt && <> · scheduled {fmtDateTime(m.scheduledAt)}</>}
                </p>
              </header>
              <div className="adm-versus">
                <div>
                  <p className="adm-label">Advisor</p>
                  <p className="adm-who-name">{m.advisor.name}</p>
                  <p className={m.advisorMet ? "said yes" : "said no"}>{said(m.advisorMet)}</p>
                </div>
                <span className="adm-vs" aria-hidden>vs.</span>
                <div>
                  <p className="adm-label">Founder</p>
                  <p className="adm-who-name">{m.founder.name} · {m.founder.company}</p>
                  <p className={m.founderMet ? "said yes" : "said no"}>{said(m.founderMet)}</p>
                </div>
              </div>
              {m.advisorFeedback && (
                <blockquote className="adm-quote">
                  Advisor feedback{m.advisorRating ? ` (${m.advisorRating}/5)` : ""}: {m.advisorFeedback}
                </blockquote>
              )}
              <ResolveConflictForm notificationId={c.id} />
            </article>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <>
          <div className="adm-sec-head" style={{ marginTop: 56 }}>
            <h2>Resolved</h2><span className="adm-count">{resolved.length}</span>
          </div>
          <table className="ledger">
            <thead>
              <tr><th>Meeting</th><th>Ruling</th><th>Note</th><th>By</th><th>When</th></tr>
            </thead>
            <tbody>
              {resolved.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.meetingRequest.topic}</b>
                    <span className="adm-sub-line">{c.meetingRequest.advisor.name} / {c.meetingRequest.founder.name}</span></td>
                  <td>{c.meetingRequest.adminMet ? "Happened" : "Did not happen"}</td>
                  <td>{c.resolutionNote}</td>
                  <td>{adminName(c.resolvedById)}</td>
                  <td className="mono">{c.resolvedAt && fmtDateTime(c.resolvedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
