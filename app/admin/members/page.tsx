import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { ViewAsButton } from "../_components/ViewAsButton";
import {
  ActiveToggle,
  AddMemberForm,
  EditMemberForm,
} from "../_components/forms";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MembersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const type = one(sp.type) === "founder" ? "founder" : "advisor";
  const q = one(sp.q).trim();
  const show = ["active", "deactivated"].includes(one(sp.show)) ? one(sp.show) : "all";

  const status =
    show === "active"
      ? { deactivatedAt: null }
      : show === "deactivated"
        ? { deactivatedAt: { not: null } }
        : {};
  const search = q
    ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ] }
    : {};

  const rows =
    type === "advisor"
      ? (
          await prisma.advisor.findMany({
            where: { ...status, ...search },
            orderBy: { name: "asc" },
            include: { _count: { select: { requests: true } } },
          })
        ).map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          detail: a.title || "—",
          profileDone: Boolean(a.bio && a.expertise),
          deactivatedAt: a.deactivatedAt,
          createdAt: a.createdAt,
          meetings: a._count.requests,
        }))
      : (
          await prisma.founder.findMany({
            where: { ...status, ...search },
            orderBy: { name: "asc" },
            include: { _count: { select: { requests: true } } },
          })
        ).map((f) => ({
          id: f.id,
          name: f.name,
          email: f.email,
          detail: f.company || "—",
          profileDone: Boolean(f.company && f.about),
          deactivatedAt: f.deactivatedAt,
          createdAt: f.createdAt,
          meetings: f._count.requests,
        }));

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ type, ...(q && { q }), show, ...patch });
    return `/admin/members?${p}`;
  };

  return (
    <>
      <div className="adm-head">
        <p className="adm-eyebrow">Registry</p>
        <h1>Members</h1>
        <p className="adm-sub">
          Add people by their Slack email — that&apos;s the allowlist. Members with
          meeting history can&apos;t be deleted; deactivate them to block login and
          hide them from the directory.
        </p>
      </div>

      <div className="adm-toolbar">
        <div className="adm-tabs" role="tablist">
          <Link href={href({ type: "advisor" })} className={type === "advisor" ? "on" : ""}>Advisors</Link>
          <Link href={href({ type: "founder" })} className={type === "founder" ? "on" : ""}>Founders</Link>
        </div>
        <form className="adm-filter" action="/admin/members">
          <input type="hidden" name="type" value={type} />
          <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search" />
          <select name="show" defaultValue={show} aria-label="Status">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <button className="btn btn-ghost btn-sm">Filter</button>
        </form>
      </div>

      <table className="ledger">
        <thead>
          <tr>
            <th>Name</th>
            <th>{type === "advisor" ? "Title" : "Company"}</th>
            <th>Status</th>
            <th className="num">Requests</th>
            <th>Added</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="adm-empty-cell">No {type}s match.</td></tr>
          )}
          {rows.map((m) => (
            <tr key={m.id} className={m.deactivatedAt ? "is-off" : ""}>
              <td>
                <b>{m.name}</b>
                <span className="adm-sub-line">{m.email}</span>
              </td>
              <td>{m.detail}</td>
              <td>
                {m.deactivatedAt ? (
                  <span className="pill pill-rejected">Deactivated</span>
                ) : m.profileDone ? (
                  <span className="pill pill-accepted">Active</span>
                ) : (
                  <span className="pill pill-pending">Profile incomplete</span>
                )}
              </td>
              <td className="num">{m.meetings}</td>
              <td className="mono">{fmtDate(m.createdAt)}</td>
              <td className="row-actions">
                <ViewAsButton type={type} id={m.id}>{m.name}</ViewAsButton>
                <details className="adm-edit">
                  <summary className="btn btn-ghost btn-sm">Edit</summary>
                  <div className="adm-edit-panel">
                    <EditMemberForm type={type} id={m.id} name={m.name} email={m.email} />
                  </div>
                </details>
                <ActiveToggle type={type} id={m.id} active={!m.deactivatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="adm-add">
        <h2>Add {type === "advisor" ? "an advisor" : "a founder"}</h2>
        <p className="adm-sub">
          They fill in the rest of their dossier on first sign-in.
          {type === "advisor" && " Advisors appear in the founder directory once their intro is complete."}
        </p>
        <AddMemberForm type={type} />
      </section>
    </>
  );
}
