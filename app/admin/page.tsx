import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentMonth, formatMonth } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";

export default async function AdminOverview() {
  const month = currentMonth();

  const [
    availability,
    accepted,
    pending,
    advisors,
    founders,
    awaitingOutcome,
    conflicts,
    audit,
  ] = await Promise.all([
    prisma.monthlyAvailability.aggregate({
      where: { month, advisor: { deactivatedAt: null } },
      _sum: { totalHours: true },
    }),
    prisma.meetingRequest.aggregate({
      where: { month, status: "ACCEPTED" },
      _sum: { estimatedHours: true },
      _count: true,
    }),
    prisma.meetingRequest.count({ where: { month, status: "PENDING" } }),
    prisma.advisor.count({ where: { deactivatedAt: null } }),
    prisma.founder.count({ where: { deactivatedAt: null } }),
    prisma.meetingRequest.count({
      where: {
        status: "ACCEPTED",
        advisorMet: null,
        adminMet: null,
        scheduledAt: { lt: new Date() },
      },
    }),
    prisma.adminNotification.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const total = availability._sum.totalHours ?? 0;
  const committed = accepted._sum.estimatedHours ?? 0;

  const stats = [
    { n: committed, unit: `/ ${total}h`, label: "Hours committed", note: `${accepted._count} accepted meetings` },
    { n: pending, label: "Awaiting advisors", note: "Pending requests this month" },
    { n: awaitingOutcome, label: "Past due", note: "Meetings with no outcome recorded" },
    { n: advisors + founders, label: "Members", note: `${advisors} advisors · ${founders} founders` },
  ];

  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">{formatMonth(month)}</p>
        <h1>The network, at a glance.</h1>
      </div>

      <section className="adm-stats" aria-label="This month">
        {stats.map((s, i) => (
          <div className="adm-stat" key={s.label} style={{ ["--i" as string]: i }}>
            <p className="adm-label">{s.label}</p>
            <p className="adm-num">
              {s.n}
              {s.unit && <small>{s.unit}</small>}
            </p>
            <p className="adm-note-line">{s.note}</p>
          </div>
        ))}
      </section>

      <div className="adm-cols">
        <section>
          <div className="adm-sec-head">
            <h2>Open conflicts</h2>
            <Link href="/admin/conflicts">All conflicts →</Link>
          </div>
          {conflicts.length === 0 ? (
            <p className="adm-empty">Nothing needs a ruling. Disagreements about whether a meeting happened will appear here.</p>
          ) : (
            <ul className="adm-feed">
              {conflicts.map((c) => (
                <li key={c.id}>
                  <span className="adm-when">{fmtDateTime(c.createdAt)}</span>
                  <Link href="/admin/conflicts">{c.message}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="adm-sec-head">
            <h2>Recent admin activity</h2>
            <Link href="/admin/audit">Full log →</Link>
          </div>
          {audit.length === 0 ? (
            <p className="adm-empty">No admin actions recorded yet.</p>
          ) : (
            <ul className="adm-feed">
              {audit.map((a) => (
                <li key={a.id}>
                  <span className="adm-when">{fmtDateTime(a.createdAt)}</span>
                  <span>
                    <b>{a.adminName}</b> — {a.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
