import { getSessionEmail } from "@/lib/session";
import { signOut } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const email = await getSessionEmail();

  return (
    <main className="shell auth-shell">
      <div className="card auth-card">
        <p className="eyebrow">Pitch Labs Network</p>
        <h1>You&apos;re not a member yet</h1>
        <p className="sub">
          {email ? (
            <>
              Your Slack account (<strong>{email}</strong>) isn&apos;t set up as an
              advisor or founder yet. Contact an admin to be added.
            </>
          ) : (
            <>This account isn&apos;t set up as an advisor or founder yet.</>
          )}
        </p>
        <form action={signOut}>
          <button className="btn btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
