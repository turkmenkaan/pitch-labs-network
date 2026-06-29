import { createBrowserClient } from "@supabase/ssr";

// Supabase client for the browser (used by the "Sign in with Slack" button to
// start the OAuth redirect). Reads/writes the session via document cookies.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
