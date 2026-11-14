import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { notifyMode } from "@/lib/notify";
import { RetryNotificationForm } from "../_components/forms";

export default async function NotificationsPage() {
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const mode = notifyMode();
  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Record</p>
        <h1>Notifications</h1>
        <p className="adm-sub">
          The latest 200 Slack notifications, newest first. Mode:{" "}
          <span className="mono">{mode}</span>
          {mode !== "slack" && " (messages are not being sent to Slack)"}.
        </p>
      </div>
      <table className="ledger">
        <thead>
          <tr><th>When</th><th>To</th><th>Type</th><th>Status</th><th>Detail</th><th /></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="adm-empty-cell">Nothing sent yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{fmtDateTime(r.createdAt)}</td>
              <td>{r.recipientEmail}</td>
              <td className="mono">{r.type}</td>
              <td className="mono">{r.status}</td>
              <td>{r.lastError ?? ""}</td>
              <td>{r.status === "FAILED" && <RetryNotificationForm id={r.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
