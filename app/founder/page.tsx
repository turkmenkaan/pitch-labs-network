import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRole, getCurrentFounder } from "@/lib/session";
import { getAvailability } from "@/lib/availability";
import { currentMonth, formatMonth } from "@/lib/types";
import { TopBar } from "@/app/components/TopBar";

export const dynamic = "force-dynamic";

export default async function FounderHome() {
  if ((await getRole()) !== "founder") redirect("/");

  const { current } = await getCurrentFounder();
  const month = currentMonth();

  const advisors = await prisma.advisor.findMany({ orderBy: { name: "asc" } });
  const withAvailability = await Promise.all(
    advisors.map(async (a) => ({
      advisor: a,
      availability: await getAvailability(a.id, month),
    }))
  );

  const firstName = current.name.split(" ")[0];

  return (
    <>
      <TopBar role="founder" active="advisors" />
      <main className="shell">
        <div className="page-head">
          <p className="eyebrow">{formatMonth(month)}</p>
          <h1>Find an advisor, {firstName}.</h1>
          <p className="sub">
            Browse the network, check who has time this month, and send a meeting
            request. Tip: keep{" "}
            <Link href="/founder/profile">your profile</Link> current before you
            reach out — advisors read it first.
          </p>
        </div>

        <div className="advisor-grid">
          {withAvailability.map(({ advisor, availability }) => {
            const tags = advisor.expertise
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            return (
              <Link
                key={advisor.id}
                href={`/founder/advisors/${advisor.id}`}
                className="card advisor-card"
              >
                <div className="advisor-card-head">
                  <div>
                    <h2>{advisor.name}</h2>
                    <p className="advisor-title">{advisor.title}</p>
                  </div>
                  {availability.hasSetAvailability ? (
                    <span
                      className={`pill ${
                        availability.remainingHours > 0
                          ? "pill-accepted"
                          : "pill-rejected"
                      }`}
                    >
                      {availability.remainingHours > 0
                        ? `${availability.remainingHours}h free`
                        : "Fully booked"}
                    </span>
                  ) : (
                    <span className="pill pill-pending">No hours set</span>
                  )}
                </div>

                <p className="advisor-bio">{advisor.bio}</p>

                <div className="tags">
                  {tags.map((t) => (
                    <span key={t} className="tag-chip">
                      {t}
                    </span>
                  ))}
                </div>

                <p className="advisor-foot">
                  {availability.hasSetAvailability
                    ? `${availability.remainingHours} of ${availability.totalHours}h available this month`
                    : "Hasn't set availability this month"}
                  <span className="go">View &amp; request →</span>
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
