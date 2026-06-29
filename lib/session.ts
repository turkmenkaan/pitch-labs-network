import { redirect } from "next/navigation";
import type { Advisor, Founder } from "@prisma/client";
import { prisma } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "advisor" | "founder";

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

// Non-redirecting role resolver. Advisor takes precedence if an email somehow
// exists in both tables. Used by the OAuth callback to pick a landing page.
export async function roleForEmail(email: string): Promise<Role | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const advisor = await prisma.advisor.findUnique({
    where: { email: e },
    select: { id: true },
  });
  if (advisor) return "advisor";
  const founder = await prisma.founder.findUnique({
    where: { email: e },
    select: { id: true },
  });
  if (founder) return "founder";
  return null;
}

export async function getRole(): Promise<Role> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const role = await roleForEmail(email);
  if (!role) redirect("/no-access");
  return role;
}

export async function getCurrentAdvisor(): Promise<{ current: Advisor }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.advisor.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current) redirect("/no-access");
  return { current };
}

export async function getCurrentFounder(): Promise<{ current: Founder }> {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const current = await prisma.founder.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!current) redirect("/no-access");
  return { current };
}
