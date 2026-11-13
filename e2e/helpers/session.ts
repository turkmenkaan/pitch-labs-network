// Signs a test user into the NON-PRODUCTION Supabase project without going
// through Slack, and returns the cookies the app expects.
//
// How: the secret key creates the user (if needed) and mints a one-time
// magic-link token; the publishable-key client exchanges it for a real session;
// @supabase/ssr then writes that session into a cookie jar using the same
// encoding and chunking as the app. No Slack, no mailbox, no password.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Cookie } from "@playwright/test";
import { productionRef } from "../../lib/env-guard";

function requireEnv(name: string, ...fallbacks: string[]): string {
  const value = [name, ...fallbacks].map((n) => process.env[n]).find(Boolean);
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.e2e.example to .env.e2e and fill it in.`
    );
  }
  return value;
}

// The secret key bypasses all security rules. Refuse to use it anywhere
// near production.
function assertNonProduction(supabaseUrl: string): void {
  if (supabaseUrl.includes(productionRef())) {
    throw new Error(
      "Refusing to run: NEXT_PUBLIC_SUPABASE_URL is the production project."
    );
  }
}

export async function signIn(
  email: string,
  baseURL: string
): Promise<{ cookies: Cookie[]; userId: string }> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  // The secret API key (sb_secret_...); the legacy service role key also works.
  const secretKey = requireEnv(
    "E2E_SUPABASE_SECRET_KEY",
    "E2E_SUPABASE_SERVICE_ROLE_KEY"
  );
  assertNonProduction(url);

  const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, secretKey, noPersist);

  // Create the user if it doesn't exist yet; "already registered" is fine.
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|exists|registered/i.test(created.error.message)) {
    throw new Error(`Could not create ${email}: ${created.error.message}`);
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    throw new Error(
      `Could not generate a sign-in link for ${email}: ${link.error?.message ?? "no token"}. ` +
        "The Email provider must be enabled on the non-production project."
    );
  }

  const anon = createClient(url, publishableKey, noPersist);
  const verified = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  const session = verified.data.session;
  if (verified.error || !session) {
    throw new Error(
      `Could not sign ${email} in: ${verified.error?.message ?? "no session"}`
    );
  }

  // Write the session through @supabase/ssr so cookie names, encoding and
  // chunking match what proxy.ts and the server client read.
  const jar = new Map<string, string>();
  const ssr = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new Error(`Could not store the session: ${error.message}`);

  const { hostname, protocol } = new URL(baseURL);
  const cookies = [...jar].map(([name, value]) => ({
    name,
    value,
    domain: hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: protocol === "https:",
    sameSite: "Lax" as const,
  }));
  return { cookies, userId: session.user.id };
}

// Removes a test user from Supabase Auth (best effort, used in teardown).
export async function deleteAuthUser(userId: string): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertNonProduction(url);
  const secretKey = requireEnv(
    "E2E_SUPABASE_SECRET_KEY",
    "E2E_SUPABASE_SERVICE_ROLE_KEY"
  );
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.auth.admin.deleteUser(userId);
}
