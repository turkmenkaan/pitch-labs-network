import Link from "next/link";
import { getIdentity } from "@/lib/session";
import { IdentitySwitcher } from "./IdentitySwitcher";

type AdvisorActive = "requests" | "dossier";
type FounderActive = "advisors" | "profile";

export async function TopBar({
  role,
  active,
}: {
  role: "advisor" | "founder";
  active: AdvisorActive | FounderActive;
}) {
  const { advisors, founders, currentId } = await getIdentity();
  const currentValue = `${role}:${currentId}`;
  const home = role === "advisor" ? "/" : "/founder";

  return (
    <header className="topbar">
      <div className="brand">
        <Link href={home} className="mark">
          <em>Pitch Labs</em> Network
        </Link>
        <nav className="nav">
          {role === "advisor" ? (
            <>
              <Link
                href="/"
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
                href="/founder/profile"
                className={active === "profile" ? "nav-link on" : "nav-link"}
              >
                My profile
              </Link>
            </>
          )}
        </nav>
      </div>
      <IdentitySwitcher
        advisors={advisors}
        founders={founders}
        currentValue={currentValue}
      />
    </header>
  );
}
