"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SlackSignInButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "slack_oidc",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setLoading(false);
    // On success the browser is redirected to Slack, so no further UI here.
  }

  return (
    <button className="btn btn-primary" onClick={signIn} disabled={loading}>
      {loading ? "Redirecting…" : "Sign in with Slack"}
    </button>
  );
}
