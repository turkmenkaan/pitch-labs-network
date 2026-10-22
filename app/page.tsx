import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRoles, getSessionEmail } from "@/lib/session";
import { SlackSignInButton } from "./login/SlackSignInButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pitch Labs Network — Expert advisors for early-stage founders",
  description:
    "An advisory network where early-stage founders meet a different experienced startup advisor every month, in year-long cohorts.",
};

const REQUEST_ACCESS_HREF =
  "mailto:info@pitchlabs.net?subject=" +
  encodeURIComponent("Request access to Pitch Labs Network");

const STEPS = [
  {
    title: "Join a cohort",
    body: "A cohort is about 30 founders and lasts a year. Once you're added, you sign in with your Slack account.",
  },
  {
    title: "Pick an advisor each month",
    body: "Every advisor has a profile with their background and the hours they have open that month. Choose the one who fits your current question and send a request with a topic and the time you need.",
  },
  {
    title: "Meet, then confirm",
    body: "The advisor accepts or declines. If they accept, you find a time on your own calendars. Afterward you both confirm the meeting happened and the advisor leaves feedback.",
  },
];

const FITS = [
  {
    who: "Founders",
    points: [
      "You're early-stage and want to talk to experienced startup advisors.",
      "Your questions change from month to month, and you'd like a different person's experience for each one.",
      "You can commit to a year alongside about 30 other founders.",
    ],
  },
  {
    who: "Advisors",
    points: [
      "You have startup experience worth sharing with people at the beginning.",
      "You set how many hours you can offer each month and accept only the requests you want.",
      "You like meeting founders who arrive with a specific topic.",
    ],
  },
];

export default async function LandingPage() {
  // Signed-in members skip the pitch and land in their own workspace.
  if (await getSessionEmail()) {
    const roles = await getRoles();
    if (roles.includes("admin")) redirect("/admin");
    if (roles.includes("advisor")) redirect("/advisor");
    redirect("/founder");
  }

  return (
    <div className="lp">
      <header className="lp-bar">
        <span className="mark">
          <em>Pitch Labs</em> Network
        </span>
        <a className="lp-signin" href="/login">
          Sign in
        </a>
      </header>

      <main>
        <section className="lp-hero">
          <p className="lp-eyebrow">Advisory network for early-stage founders</p>
          <h1>
            A <em>different startup advisor</em> every month.
          </h1>
          <p className="lp-lede">
            Pitch Labs Network is an advisory network. Each cohort runs for a
            year with about 30 early-stage founders and around 10 experienced
            advisors from different backgrounds. Every month, each founder
            picks the advisor whose experience fits what they&apos;re working
            on right now, and meets them one on one.
          </p>
          <div className="lp-cta">
            <SlackSignInButton />
            <a className="btn btn-ghost" href={REQUEST_ACCESS_HREF}>
              Request access
            </a>
          </div>
          <p className="lp-note">
            Members sign in with Slack. To join a cohort as a founder or an
            advisor, request access and we&apos;ll reply by email.
          </p>
        </section>

        <section className="lp-section" aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section" aria-labelledby="fit">
          <h2 id="fit">Who it&apos;s a good fit for</h2>
          <div className="lp-fits">
            {FITS.map((f) => (
              <div className="lp-fit" key={f.who}>
                <h3>{f.who}</h3>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-close">
          <h2>Want to join a cohort?</h2>
          <p>
            Already a member? Sign in. If not, email us and say whether you
            would join as a founder or an advisor.
          </p>
          <div className="lp-cta">
            <SlackSignInButton />
            <a className="btn btn-ghost" href={REQUEST_ACCESS_HREF}>
              Request access
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <span>© Pitch Labs Network</span>
        <a href="mailto:info@pitchlabs.net">info@pitchlabs.net</a>
      </footer>
    </div>
  );
}
