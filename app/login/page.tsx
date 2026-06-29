import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session";
import { SlackSignInButton } from "./SlackSignInButton";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Send them into the app (role routing happens there).
  if (await getSessionEmail()) redirect("/");

  return (
    <main className="shell auth-shell">
      <div className="card auth-card">
        <p className="eyebrow">Pitch Labs Network</p>
        <h1>Sign in</h1>
        <p className="sub">
          Use your Slack account to access the advisory network.
        </p>
        <SlackSignInButton />
      </div>
    </main>
  );
}
