import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export default async function AuditPage() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Record</p>
        <h1>Audit log</h1>
        <p className="adm-sub">The latest 200 admin actions, newest first.</p>
      </div>
      <table className="ledger">
        <thead>
          <tr><th>When</th><th>Admin</th><th>Action</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="adm-empty-cell">Nothing recorded yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{fmtDateTime(r.createdAt)}</td>
              <td>{r.adminName}</td>
              <td className="mono">{r.action}</td>
              <td>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
