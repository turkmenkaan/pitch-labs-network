import { getCurrentAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { AddAdminForm, RemoveAdminButton } from "../_components/forms";

export default async function AdminsPage() {
  const { current } = await getCurrentAdmin();
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  const byId = new Map(admins.map((a) => [a.id, a.name]));

  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Access</p>
        <h1>Admins</h1>
        <p className="adm-sub">
          Admins can manage members, rule on conflicts and see every request. Every
          change is written to the audit log.
        </p>
      </div>

      <table className="ledger">
        <thead>
          <tr><th>Name</th><th>Added</th><th>By</th><th aria-label="Actions" /></tr>
        </thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <td><b>{a.name}{a.id === current.id && " (you)"}</b><span className="adm-sub-line">{a.email}</span></td>
              <td className="mono">{fmtDate(a.createdAt)}</td>
              <td>{a.createdById ? byId.get(a.createdById) ?? "a former admin" : "Bootstrap script"}</td>
              <td className="row-actions">
                {admins.length > 1 && <RemoveAdminButton id={a.id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="adm-add">
        <h2>Add an admin</h2>
        <p className="adm-sub">The email must not already belong to an advisor or founder.</p>
        <AddAdminForm />
      </section>
    </>
  );
}
