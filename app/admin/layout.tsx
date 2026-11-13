import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/session";
import { signOut } from "../actions";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { AdminNav } from "./_components/AdminNav";

export const metadata: Metadata = {
  title: "Admin — Pitch Labs Network",
};

export const dynamic = "force-dynamic";

// The layout is the gate for the whole /admin tree (pages and server actions
// re-check too). Non-admins get a 404 from getCurrentAdmin().
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { current } = await getCurrentAdmin();
  const openConflicts = await prisma.adminNotification.count({
    where: { resolved: false },
  });

  return (
    <div className="adm">
      <header className="adm-bar">
        <div className="adm-bar-inner">
          <div className="adm-brand">
            <span className="adm-mark">
              <em>Pitch Labs</em> Network
            </span>
            <span className="adm-stamp">Admin</span>
          </div>
          <AdminNav openConflicts={openConflicts} />
          <div className="adm-session">
            <RoleSwitcher current="admin" className="role-switch adm-role-switch" />
            <span className="adm-who">{current.name}</span>
            <form action={signOut}>
              <button className="adm-signout" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="adm-main">{children}</main>
    </div>
  );
}
