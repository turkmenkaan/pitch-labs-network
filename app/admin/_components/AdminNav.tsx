"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/conflicts", label: "Conflicts" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav({ openConflicts }: { openConflicts: number }) {
  const pathname = usePathname();
  return (
    <nav className="adm-nav" aria-label="Admin">
      {LINKS.map((l) => {
        const on = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={on ? "adm-link on" : "adm-link"}
            aria-current={on ? "page" : undefined}
          >
            {l.label}
            {l.href === "/admin/conflicts" && openConflicts > 0 && (
              <b className="adm-badge">{openConflicts}</b>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
