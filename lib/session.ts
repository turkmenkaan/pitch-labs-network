import { notFound, redirect } from "next/navigation";
import type { Admin, Advisor, Founder } from "@prisma/client";
import { prisma } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "admin" | "advisor" | "founder";

// Identity comes from the Supabase auth session (Slack login). The authenticated
// email is mapped to an existing Advisor or Founder row — membership is an
// allowlist for now (unknown emails get no role and are sent to /no-access).
// A future onboarding flow can create a row instead of redirecting.

export async function getSessionEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return normalizeEmail(user?.email);
}

// Slack's OIDC `email` claim can arrive wrapped in literal double quotes
// (e.g. `"kaan@pitchlabs.net"`). Strip surrounding quotes/whitespace and
// lowercase so it matches the stored Advisor/Founder email.
function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase();
  return cleaned || null;
}

// Every role an email holds. Deactivated members hold no role. An email can be
// an admin and also a member (e.g. staff who advise), so this is a list.
export async function rolesForEmail(email: string): Promise<Role[]> {
  const e = normalizeEmail(email);
  if (!e) return [];
  const [admin, advisor, founder] = await Promise.all([
    prisma.admin.findUnique({ where: { email: e }, select: { id: true } }),
    prisma.advisor.findUnique({
      where: { email: e },
      select: { deactivatedAt: true },
    }),
    prisma.founder.findUnique({
      where: { email: e },
      select: { deactivatedAt: true },
    }),
  ]);
  const roles: Role[] = [];
  if (admin) roles.push("admin");
  if (advisor && !advisor.deactivatedAt) roles.push("advisor");
  if (founder && !founder.deactivatedAt) roles.push("founder");
  return roles;
}

// Primary role, used by the OAuth callback to pick a landing page:
// admin, then advisor, then founder.
export async function roleForEmail(email: string): Promise<Role | null> {
  return (await rolesForEmail(email))[0] ?? null;
}

// Roles of the signed-in user, for pages that need to know whether to show
// cross-workspace links (e.g. an admin who is also an advisor).
export async function getRoles(): Promise<Role[]> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const roles = await rolesForEmail(email);
  if (roles.length === 0) redirect("/no-access");
  return roles;
}

// Admin gate. Non-admins get a 404 rather than a redirect so the admin area
// isn't revealed. Every admin page and server action calls this first.
export async function getCurrentAdmin(): Promise<{ current: Admin }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.admin.findUnique({ where: { email } });
  if (!current) notFound();
  return { current };
}

export async function getCurrentAdvisor(): Promise<{ current: Advisor }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.advisor.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current || current.deactivatedAt) redirect("/no-access");
  return { current };
}

export async function getCurrentFounder(): Promise<{ current: Founder }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.founder.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current || current.deactivatedAt) redirect("/no-access");
  return { current };
}
