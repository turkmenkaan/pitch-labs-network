import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPreview, getRoles, getSessionEmail, landingPath } from "@/lib/session";
import {
  DEFAULT_CALLS_PER_ADVISOR,
  DEFAULT_MONTHLY_HOURS,
} from "@/lib/guardrails";
import { SlackSignInButton } from "./login/SlackSignInButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pitch Labs Network — Expert advisors for early-stage founders",
  description:
    "A year-long advisory cohort where early-stage founders get a team of experienced startup advisors in their corner.",
};

const REQUEST_ACCESS_HREF =
  "mailto:info@pitchlabs.net?subject=" +
  encodeURIComponent("Request information about Pitch Labs Network");

const ADVISOR_HREF =
  "mailto:info@pitchlabs.net?subject=" +
  encodeURIComponent("Advising with Pitch Labs Network");

const STEPS = [
  {
    title: "Apply to a cohort",
    body: "Fill out a short application, and we'll set up an intro call to get to know you and your startup. Once you're in, you sign in with Slack and can see every advisor in the cohort.",
  },
  {
    title: "Request time with advisors",
    body: "Browse advisor profiles to see their background and availability. Choose the one whose experience fits what you're working on right now, and send a request with your topic.",
  },
  {
    title: "Meet your advisor",
    body: "Spend the time one on one with someone who has been where you are. Bring your hardest question and get an experienced perspective on it.",
  },
];

// `photo` is a path under /public; without one the card shows a neutral avatar.
const ADVISORS: { name: string; line?: string; photo?: string; linkedin?: string }[] = [
  {
    name: "Josh Frankel",
    line: "Founder, Startcase. Marketing for early-stage startups.",
    photo: "/advisors/josh-frankel.jpg",
    linkedin: "https://www.linkedin.com/in/joshuamfrankel/",
  },
  {
    name: "Christian Carello",
    line: "Five-time founder and co-founder of The Forge.",
    photo: "/advisors/christian-carello.jpg",
    linkedin: "https://www.linkedin.com/in/christianjcarello/",
  },
  {
    name: "Larry Cynkin",
    line: "Consulting CTO. President of the DC CTO Club.",
    photo: "/advisors/larry-cynkin.jpg",
    linkedin: "https://www.linkedin.com/in/larrycynkin/",
  },
  {
    name: "Cory Lebson",
    line: "UX research consultant. Past president of UXPA International.",
    photo: "/advisors/cory-lebson.jpg",
    linkedin: "https://www.linkedin.com/in/lebson/",
  },
  {
    name: "Lokesh Kumar",
    line: "CTO of Sheeva.AI. AI strategy consultant.",
    photo: "/advisors/lokesh-kumar.jpg",
    linkedin: "https://www.linkedin.com/in/lkumar/",
  },
  {
    name: "David Tucker",
    line: "Software engineer and founder of Gloworm.",
    photo: "/advisors/david-tucker.png",
    linkedin: "https://www.linkedin.com/in/david-tucker-5132207/",
  },
  {
    name: "Sam Wu",
    line: "Founder and CEO of Savforce and Samssoft.",
    photo: "/advisors/sam-wu.jpg",
    linkedin: "https://www.linkedin.com/in/samjwu/",
  },
  {
    name: "Carla Fleming",
    line: "Fractional B2B growth and go-to-market strategist.",
    photo: "/advisors/carla-fleming.jpg",
    linkedin: "https://www.linkedin.com/in/flemingc/",
  },
  {
    name: "Jonathan Jenkins",
    line: "Founder, The Jenkins Advisory Group. AI strategy and governance.",
    photo: "/advisors/jonathan-jenkins.jpg",
    linkedin: "https://www.linkedin.com/in/jonathanpjenkins/",
  },
  {
    name: "Kaan Turkmen",
    line: "Sr. Software Engineer and board member @ DMV Petri Dish",
    photo: "/advisors/kaan-turkmen.png",
    linkedin: "https://www.linkedin.com/in/kaan-turkmen/",
  },
];

const FITS = [
  {
    who: "Founders",
    points: [
      "You're building something early and want advice from people who've done it before.",
      "Your questions span different areas, and you'd like more than one perspective.",
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
  const email = await getSessionEmail();
  if (email) {
    const roles = await getRoles();
    // A preview shows the workspace as it is; real members land on the role they
    // used last, and finish their profile first.
    const landing = (await getPreview()) ? null : await landingPath(email);
    if (landing) redirect(landing);
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
          <p className="lp-eyebrow">Advisory network for early-stage founders in the DMV</p>
          <h1>
            A team of <em>experienced advisors</em> in your corner.
          </h1>
          <p className="lp-lede">
            Pitch Labs Network is a year-long cohort of about 30 early-stage
            founders in the DMV (DC, Maryland, and Virginia) and around 10
            advisors from different backgrounds, all based in the area. Instead
            of relying on one mentor, you choose the advisors whose experience
            fits what you&apos;re working on, and meet them one on one.
          </p>
          <div className="lp-cta">
            <SlackSignInButton />
            <a className="btn btn-ghost" href={REQUEST_ACCESS_HREF}>
              Apply to next cohort
            </a>
          </div>
          <p className="lp-note">
            Already a member? Sign in with Slack. Joining as a founder? Fill
            out the application and we&apos;ll reach out to make sure
            it&apos;s a good fit.
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
          <p className="lp-rules">
            Every month you have {DEFAULT_MONTHLY_HOURS} hours of advisor time
            to spend however you like, with up to {DEFAULT_CALLS_PER_ADVISOR}{" "}
            calls with any one advisor. If a request is declined or cancelled,
            or a meeting doesn&apos;t happen, those hours go back to you.
          </p>
        </section>

        <section className="lp-section" aria-labelledby="advisors">
          <h2 id="advisors">Our advisors</h2>
          <ul className="lp-advisors">
            {ADVISORS.map((a) => (
              <li key={a.name}>
                {a.photo ? (
                  <Image
                    className="lp-avatar"
                    src={a.photo}
                    alt=""
                    width={96}
                    height={96}
                  />
                ) : (
                  <span className="lp-avatar lp-avatar-empty" aria-hidden="true" />
                )}
                <h3>{a.name}</h3>
                {a.line && <p>{a.line}</p>}
                {a.linkedin && (
                  <a
                    className="lp-linkedin"
                    href={a.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${a.name} on LinkedIn`}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                      />
                    </svg>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-cost" aria-labelledby="cost">
          <h2 id="cost">What it costs</h2>
          <p>
            The year-long commitment costs less than a single hour of a
            consultancy call. Request information and we&apos;ll send the
            details.
          </p>
          <a className="btn btn-ghost" href={REQUEST_ACCESS_HREF}>
            Request information
          </a>
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
          <h2>Ready to join?</h2>
          <p>
            <strong>Founders:</strong>{" "}
            apply for the next cohort and we&apos;ll set up an intro call.
          </p>
          <p>
            <strong>Advisors:</strong>{" "}
            if you have startup experience worth sharing,{" "}
            <a href={ADVISOR_HREF}>get in touch</a>{" "}
            and we&apos;ll tell you how it works.
          </p>
          <p>Already a member? Sign in with Slack.</p>
          <div className="lp-cta">
            <SlackSignInButton />
            <a className="btn btn-ghost" href={REQUEST_ACCESS_HREF}>
              Apply to next cohort
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
