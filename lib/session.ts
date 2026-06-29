import { cookies } from "next/headers";
import { prisma } from "./db";

const ADVISOR_COOKIE = "advisorId";
const FOUNDER_COOKIE = "founderId";
const ROLE_COOKIE = "role";

export type Role = "advisor" | "founder";

// Phase 1 has no real auth. We stub the "logged-in person" with cookies and a
// "Viewing as" switcher in the header that picks any advisor or founder.

export async function getRole(): Promise<Role> {
  const store = await cookies();
  return store.get(ROLE_COOKIE)?.value === "founder" ? "founder" : "advisor";
}

export async function getCurrentAdvisor() {
  const store = await cookies();
  const cookieId = store.get(ADVISOR_COOKIE)?.value;

  const advisors = await prisma.advisor.findMany({ orderBy: { name: "asc" } });
  if (advisors.length === 0) {
    throw new Error("No advisors seeded. Run `npm run seed`.");
  }

  const current = advisors.find((a) => a.id === cookieId) ?? advisors[0];
  return { current, advisors };
}

export async function getCurrentFounder() {
  const store = await cookies();
  const cookieId = store.get(FOUNDER_COOKIE)?.value;

  const founders = await prisma.founder.findMany({ orderBy: { name: "asc" } });
  if (founders.length === 0) {
    throw new Error("No founders seeded. Run `npm run seed`.");
  }

  const current = founders.find((f) => f.id === cookieId) ?? founders[0];
  return { current, founders };
}

// Everything the "Viewing as" switcher needs in one shot.
export async function getIdentity() {
  const store = await cookies();
  const [advisors, founders] = await Promise.all([
    prisma.advisor.findMany({ orderBy: { name: "asc" } }),
    prisma.founder.findMany({ orderBy: { name: "asc" } }),
  ]);

  const role: Role =
    store.get(ROLE_COOKIE)?.value === "founder" ? "founder" : "advisor";
  const currentAdvisorId =
    advisors.find((a) => a.id === store.get(ADVISOR_COOKIE)?.value)?.id ??
    advisors[0]?.id;
  const currentFounderId =
    founders.find((f) => f.id === store.get(FOUNDER_COOKIE)?.value)?.id ??
    founders[0]?.id;

  return {
    role,
    advisors,
    founders,
    currentId: role === "advisor" ? currentAdvisorId : currentFounderId,
  };
}
