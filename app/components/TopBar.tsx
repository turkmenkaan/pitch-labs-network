import Link from "next/link";
import { getCurrentAdvisor, getCurrentFounder } from "@/lib/session";
import { signOut } from "../actions";
import { PreviewBanner } from "./PreviewBanner";

type AdvisorActive = "requests" | "dossier";
type FounderActive = "advisors" | "meetings" | "profile";

export async function TopBar({
  role,
  active,
}: {
  role: "advisor" | "founder";
  active: AdvisorActive | FounderActive;
}) {
  const { current } =
    role === "advisor" ? await getCurrentAdvisor() : await getCurrentFounder();
  const home = role === "advisor" ? "/advisor" : "/founder";

  return (
    <>
      <PreviewBanner />
      <header className="topbar">
        <div className="brand">
          <Link href={home} className="mark">
            <em>Pitch Labs</em> Network
          </Link>
          <nav className="nav">
            {role === "advisor" ? (
              <>
                <Link
                  href="/advisor"
                  className={active === "requests" ? "nav-link on" : "nav-link"}
                >
                  Requests
                </Link>
                <Link
                  href="/dossier"
                  className={active === "dossier" ? "nav-link on" : "nav-link"}
                >
                  My dossier
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/founder"
                  className={active === "advisors" ? "nav-link on" : "nav-link"}
                >
                  Advisors
                </Link>
                <Link
                  href="/founder/meetings"
                  className={active === "meetings" ? "nav-link on" : "nav-link"}
                >
                  My meetings
                </Link>
                <Link
                  href="/founder/profile"
                  className={active === "profile" ? "nav-link on" : "nav-link"}
                >
                  My profile
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="session">
          <span className="session-who">
            {current.name} <span className="session-role">· {role}</span>
          </span>
          <form action={signOut}>
            <button className="btn btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
    </>
  );
}
