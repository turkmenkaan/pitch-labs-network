import { cache } from "react";
import { cookies } from "next/headers";
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

// --- Admin "view as" preview ------------------------------------------------
// An admin can preview the advisor or founder workspace as a given member. The
// `view_as` cookie ("advisor:<id>" | "founder:<id>") is only a hint: it is
// honoured solely when the real Supabase session belongs to an admin and the
// target row exists, so forging it gets anyone else nothing. Previews are
// read-only: mutating actions use getActingAdvisor/Founder (real identity
// only) and bail out early via previewBlock().

export const VIEW_AS_COOKIE = "view_as";

export type Preview =
  | { type: "advisor"; member: Advisor }
  | { type: "founder"; member: Founder };

export const getPreview = cache(async (): Promise<Preview | null> => {
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const [type, id] = raw.split(":");
  if (!id || (type !== "advisor" && type !== "founder")) return null;

  const email = await getSessionEmail();
  if (!email) return null;
  const admin = await prisma.admin.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!admin) return null;

  // Deactivated members can still be previewed.
  if (type === "advisor") {
    const member = await prisma.advisor.findUnique({ where: { id } });
    return member ? { type, member } : null;
  }
  const member = await prisma.founder.findUnique({ where: { id } });
  return member ? { type, member } : null;
});

// Returned by mutating actions while an admin is previewing.
export async function previewBlock(): Promise<{ ok: false; error: string } | null> {
  if (await getPreview()) {
    return {
      ok: false,
      error: "You're previewing as an admin, so changes are disabled.",
    };
  }
  return null;
}

// Roles of the signed-in user, for pages that need to know which workspace to
// show. While previewing, the previewed member's role is the only one.
export async function getRoles(): Promise<Role[]> {
  const preview = await getPreview();
  if (preview) return [preview.type];
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const roles = await rolesForEmail(email);
  if (roles.length === 0) redirect("/no-access");
  return roles;
}

// Admin gate. Non-admins get a 404 rather than a redirect so the admin area
// isn't revealed. Every admin page and server action calls this first. Never
// affected by the preview.
export async function getCurrentAdmin(): Promise<{ current: Admin }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.admin.findUnique({ where: { email } });
  if (!current) notFound();
  return { current };
}

// Page-facing: follows the preview. An admin previewing a founder who opens an
// advisor-only page gets a 404 instead of the misleading /no-access.
export async function getCurrentAdvisor(): Promise<{ current: Advisor }> {
  const preview = await getPreview();
  if (preview) {
    if (preview.type !== "advisor") notFound();
    return { current: preview.member };
  }
  return getActingAdvisor();
}

export async function getCurrentFounder(): Promise<{ current: Founder }> {
  const preview = await getPreview();
  if (preview) {
    if (preview.type !== "founder") notFound();
    return { current: preview.member };
  }
  return getActingFounder();
}

// Action-facing: always the real signed-in identity, never the preview.
export async function getActingAdvisor(): Promise<{ current: Advisor }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.advisor.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current || current.deactivatedAt) redirect("/no-access");
  return { current };
}

export async function getActingFounder(): Promise<{ current: Founder }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.founder.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current || current.deactivatedAt) redirect("/no-access");
  return { current };
}
