// Each fixture creates a brand-new member in the database, opens a browser signed
// in as them, and deletes the rows afterwards. Tests never depend on seed data or
// on each other, and fixtures a test doesn't ask for aren't built.
//
// Signing in is the slow, rate-limited part (Supabase limits magic-link
// verifications), so each worker signs in once per role and reuses that session
// for every test it runs. Only the database rows are new each time.
import { test as base, expect, type Browser, type Cookie, type Page } from "@playwright/test";
import type { Admin, Advisor, Founder } from "@prisma/client";
import { currentMonth } from "../lib/types";
import { db } from "./helpers/db";
import { deleteAuthUser, signIn } from "./helpers/session";

export { expect };
export { db };

export type Member<T> = { row: T; page: Page; email: string };

type Identity = { email: string; cookies: Cookie[] };
type IdentityFor = (role: string) => Promise<Identity>;

async function openAs(
  browser: Browser,
  baseURL: string | undefined,
  identity: Identity
) {
  if (!baseURL) throw new Error("baseURL is not configured.");
  const bypass = process.env.E2E_VERCEL_BYPASS_SECRET;
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : {},
  });
  await context.addCookies(identity.cookies);
  return { context, page: await context.newPage() };
}

// Teardown must not hide the real test result, so failures are only reported.
async function cleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.warn(`e2e cleanup (${label}) failed:`, error);
  }
}

type Provide<T> = (value: T) => Promise<void>;

// An advisor with 10 hours open this month.
async function provisionAdvisor(
  browser: Browser,
  baseURL: string | undefined,
  identity: Identity,
  label: string,
  use: Provide<Member<Advisor>>
) {
  const row = await db().advisor.create({
    data: {
      name: `E2E ${label} Advisor ${identity.email.split("@")[0].slice(-8)}`,
      email: identity.email,
      title: "E2E test advisor",
      expertise: "Testing, QA",
      bio: "Created by the end-to-end test suite.",
    },
  });
  await db().monthlyAvailability.create({
    data: { advisorId: row.id, month: currentMonth(), totalHours: 10 },
  });
  const { context, page } = await openAs(browser, baseURL, identity);

  await use({ row, page, email: identity.email });

  await cleanup("advisor session", () => context.close());
  await cleanup("advisor data", async () => {
    await db().adminNotification.deleteMany({
      where: { meetingRequest: { advisorId: row.id } },
    });
    await db().meetingRequest.deleteMany({ where: { advisorId: row.id } });
    await db().monthlyAvailability.deleteMany({ where: { advisorId: row.id } });
    await db().advisor.deleteMany({ where: { id: row.id } });
    await db().notification.deleteMany({ where: { recipientEmail: identity.email } });
  });
}

export const test = base.extend<
  {
    advisor: Member<Advisor>;
    otherAdvisor: Member<Advisor>;
    founder: Member<Founder>;
    admin: Member<Admin>;
    stranger: { page: Page; email: string };
  },
  { identityFor: IdentityFor }
>({
  // One signed-in session per role per worker, created on first use.
  identityFor: [
    async ({}, use, workerInfo) => {
      const runId = process.env.E2E_RUN_ID ?? "local";
      const baseURL = workerInfo.project.use.baseURL;
      if (!baseURL) throw new Error("baseURL is not configured.");
      const sessions = new Map<string, Promise<Identity & { userId: string }>>();

      await use((role) => {
        let session = sessions.get(role);
        if (!session) {
          const email = `e2e-${role}-${runId}-w${workerInfo.workerIndex}@e2e.example.com`;
          session = signIn(email, baseURL).then((s) => ({ ...s, email }));
          sessions.set(role, session);
        }
        return session;
      });

      for (const session of sessions.values()) {
        const signedIn = await session.catch(() => null);
        if (signedIn) {
          await cleanup("auth user", () => deleteAuthUser(signedIn.userId));
        }
      }
    },
    { scope: "worker" },
  ],

  advisor: async ({ browser, baseURL, identityFor }, use) =>
    provisionAdvisor(browser, baseURL, await identityFor("advisor"), "Alpha", use),

  // A second advisor, for tests that spread requests across advisors.
  otherAdvisor: async ({ browser, baseURL, identityFor }, use) =>
    provisionAdvisor(browser, baseURL, await identityFor("advisor-b"), "Bravo", use),

  founder: async ({ browser, baseURL, identityFor }, use) => {
    const identity = await identityFor("founder");
    const row = await db().founder.create({
      data: {
        name: `E2E Founder ${identity.email.split("@")[0].slice(-8)}`,
        email: identity.email,
        company: "E2E Co",
        about: "Created by the end-to-end test suite.",
      },
    });
    const { context, page } = await openAs(browser, baseURL, identity);

    await use({ row, page, email: identity.email });

    await cleanup("founder session", () => context.close());
    await cleanup("founder data", async () => {
      await db().adminNotification.deleteMany({
        where: { meetingRequest: { founderId: row.id } },
      });
      await db().meetingRequest.deleteMany({ where: { founderId: row.id } });
      await db().founder.deleteMany({ where: { id: row.id } });
      await db().notification.deleteMany({ where: { recipientEmail: identity.email } });
    });
  },

  admin: async ({ browser, baseURL, identityFor }, use) => {
    const identity = await identityFor("admin");
    const row = await db().admin.create({
      data: {
        name: `E2E Admin ${identity.email.split("@")[0].slice(-8)}`,
        email: identity.email,
      },
    });
    const { context, page } = await openAs(browser, baseURL, identity);

    await use({ row, page, email: identity.email });

    await cleanup("admin session", () => context.close());
    await cleanup("admin data", async () => {
      await db().auditLog.deleteMany({ where: { adminId: row.id } });
      await db().admin.deleteMany({ where: { id: row.id } });
      await db().notification.deleteMany({ where: { recipientEmail: identity.email } });
    });
  },

  // Signed in with Slack-equivalent credentials, but not a member of anything.
  stranger: async ({ browser, baseURL, identityFor }, use) => {
    const identity = await identityFor("stranger");
    const { context, page } = await openAs(browser, baseURL, identity);

    await use({ page, email: identity.email });

    await cleanup("stranger session", () => context.close());
    await cleanup("stranger notifications", () =>
      db().notification.deleteMany({ where: { recipientEmail: identity.email } })
    );
  },
});
