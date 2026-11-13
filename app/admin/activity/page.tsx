import { prisma } from "@/lib/db";
import { currentMonth, formatMonth } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { ViewAsButton } from "../_components/ViewAsButton";
import { getMeetingStage, STAGE_LABELS } from "@/lib/meeting";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ActivityPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const nowMonth = currentMonth();
  const month = one(sp.month) || nowMonth; // "all" = every month
  const status = ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "CANCELLED"].includes(one(sp.status)) ? one(sp.status) : "";
  const advisorId = one(sp.advisor);
  const founderId = one(sp.founder);

  const [monthRequests, months, avail, advisors, founders] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: month === "all" ? {} : { month },
      include: { advisor: true, founder: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.meetingRequest.findMany({ distinct: ["month"], select: { month: true } }),
    prisma.monthlyAvailability.findMany({ where: month === "all" ? {} : { month } }),
    prisma.advisor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.founder.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const monthOptions = [...new Set([nowMonth, ...months.map((m) => m.month)])].sort().reverse();

  // Per-advisor ledger for the chosen month (single months only; hours are monthly).
  const summary = month === "all" ? [] : advisors.map((a) => {
    const mine = monthRequests.filter((r) => r.advisorId === a.id);
    const total = avail.find((v) => v.advisorId === a.id)?.totalHours ?? 0;
    const committed = mine.filter((r) => r.status === "ACCEPTED").reduce((s, r) => s + r.estimatedHours, 0);
    const rated = mine.filter((r) => r.advisorRating != null);
    return {
      ...a,
      total,
      committed,
      pending: mine.filter((r) => r.status === "PENDING").length,
      completed: mine.filter((r) => getMeetingStage(r) === "COMPLETED_MET").length,
      avg: rated.length ? rated.reduce((s, r) => s + (r.advisorRating ?? 0), 0) / rated.length : null,
    };
  }).filter((a) => a.total || a.pending || a.committed);

  const rows = monthRequests.filter(
    (r) =>
      (!status || r.status === status) &&
      (!advisorId || r.advisorId === advisorId) &&
      (!founderId || r.founderId === founderId)
  );

  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Commitments &amp; decisions</p>
        <h1>Activity</h1>
        <p className="adm-sub">Every request across the network, with what was decided and how it went.</p>
      </div>

      <form className="adm-filter adm-filter-wide" action="/admin/activity">
        <select name="month" defaultValue={month} aria-label="Month">
          <option value="all">All months</option>
          {monthOptions.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select name="advisor" defaultValue={advisorId} aria-label="Advisor">
          <option value="">Any advisor</option>
          {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="founder" defaultValue={founderId} aria-label="Founder">
          <option value="">Any founder</option>
          {founders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm">Apply</button>
      </form>

      {summary.length > 0 && (
        <>
          <div className="adm-sec-head"><h2>Hours by advisor</h2><span className="adm-count">{formatMonth(month)}</span></div>
          <table className="ledger">
            <thead>
              <tr><th>Advisor</th><th className="num">Offered</th><th className="num">Committed</th><th className="num">Remaining</th><th className="num">Pending</th><th className="num">Completed</th><th className="num">Avg rating</th><th>Load</th></tr>
            </thead>
            <tbody>
              {summary.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td className="num">{a.total}h</td>
                  <td className="num">{a.committed}h</td>
                  <td className="num">{Math.max(a.total - a.committed, 0)}h</td>
                  <td className="num">{a.pending}</td>
                  <td className="num">{a.completed}</td>
                  <td className="num">{a.avg == null ? "—" : a.avg.toFixed(1)}</td>
                  <td><span className="adm-meter"><i style={{ width: `${a.total ? Math.min(100, (a.committed / a.total) * 100) : 0}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="adm-sec-head" style={{ marginTop: 48 }}>
        <h2>Requests</h2>
        <span className="adm-count">{rows.length}{monthRequests.length >= 1000 && "+"}</span>
      </div>
      <table className="ledger">
        <thead>
          <tr><th>Meeting</th><th>Advisor</th><th>Founder</th><th className="num">Hrs</th><th>Decision</th><th>Outcome</th><th>Sent</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="adm-empty-cell">No requests match these filters.</td></tr>}
          {rows.map((r) => {
            const stage = getMeetingStage(r);
            return (
              <tr key={r.id}>
                <td><b>{r.topic}</b>
                  {r.scheduledAt && <span className="adm-sub-line">{fmtDateTime(r.scheduledAt)}</span>}</td>
                <td><ViewAsButton type="advisor" id={r.advisorId} variant="link">{r.advisor.name}</ViewAsButton></td>
                <td><ViewAsButton type="founder" id={r.founderId} variant="link">{r.founder.name}</ViewAsButton><span className="adm-sub-line">{r.founder.company}</span></td>
                <td className="num">{r.estimatedHours}</td>
                <td>
                  <span className={`pill pill-${r.status.toLowerCase()}`}>{r.status.toLowerCase()}</span>
                  {r.decisionNote && <span className="adm-sub-line">{r.decisionNote}</span>}
                </td>
                <td>
                  {stage ? STAGE_LABELS[stage] : "—"}
                  {r.advisorRating != null && <span className="adm-sub-line">{r.advisorRating}/5</span>}
                  {r.adminMet != null && <span className="adm-sub-line">Admin ruling</span>}
                </td>
                <td className="mono">{fmtDateTime(r.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
