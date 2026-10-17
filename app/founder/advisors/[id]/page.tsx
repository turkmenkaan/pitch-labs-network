import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRoles, getCurrentFounder } from "@/lib/session";
import { getAvailability } from "@/lib/availability";
import { currentMonth, formatMonth } from "@/lib/types";
import { TopBar } from "@/app/components/TopBar";
import { SendRequestForm } from "@/app/components/SendRequestForm";

export const dynamic = "force-dynamic";

export default async function AdvisorDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getRoles()).includes("founder")) redirect("/");

  const { id } = await params;
  const { current } = await getCurrentFounder();
  const month = currentMonth();

  const advisor = await prisma.advisor.findUnique({ where: { id } });
  if (!advisor || advisor.deactivatedAt) notFound();

  const [availability, activeRequest] = await Promise.all([
    getAvailability(advisor.id, month),
    prisma.meetingRequest.findFirst({
      where: {
        advisorId: advisor.id,
        founderId: current.id,
        month,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
    }),
  ]);

  const tags = advisor.expertise
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const facts = [
    { label: "Location", value: advisor.location },
    {
      label: "This month",
      value: availability.hasSetAvailability
        ? `${availability.remainingHours} of ${availability.totalHours}h free`
        : "No hours set",
    },
    {
      label: "LinkedIn",
      value: advisor.linkedinUrl ? "Profile" : null,
      href: advisor.linkedinUrl ?? undefined,
    },
  ];

  const sections = [
    { label: "Experience", value: advisor.experience },
    { label: "How I help founders", value: advisor.howIHelp },
  ];

  return (
    <>
      <TopBar role="founder" active="advisors" />
      <main className="shell">
        <Link href="/founder" className="back-link">
          ← Back to advisors
        </Link>

        <div className="page-head">
          <p className="eyebrow">{advisor.title}</p>
          <h1>{advisor.name}</h1>
          <p className="sub">{advisor.bio}</p>
          <div className="tags" style={{ marginTop: 14 }}>
            {tags.map((t) => (
              <span key={t} className="tag-chip">
                {t}
              </span>
            ))}
          </div>
        </div>

        <section className="card dossier">
          <dl className="facts">
            {facts
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="fact">
                  <dt>{f.label}</dt>
                  <dd>
                    {f.href ? (
                      <a href={f.href} target="_blank" rel="noreferrer">
                        {f.value} ↗
                      </a>
                    ) : (
                      f.value
                    )}
                  </dd>
                </div>
              ))}
          </dl>
          {sections
            .filter((s) => s.value)
            .map((s) => (
              <div key={s.label} className="dossier-section">
                <h2>{s.label}</h2>
                <p>{s.value}</p>
              </div>
            ))}
        </section>

        <section style={{ marginTop: 40 }}>
          <div className="section-label">
            <h2>Request a meeting</h2>
            <span className="count">{formatMonth(month)}</span>
          </div>

          {activeRequest ? (
            <div className="card req">
              <div className="req-top">
                <div>
                  <h3>{activeRequest.topic}</h3>
                  <p className="founder">You&apos;ve already reached out.</p>
                </div>
                <span
                  className={`pill ${
                    activeRequest.status === "ACCEPTED"
                      ? "pill-accepted"
                      : "pill-pending"
                  }`}
                >
                  {activeRequest.status === "ACCEPTED" ? "Accepted" : "Pending"}
                </span>
              </div>
              <p className="message">
                {activeRequest.status === "ACCEPTED"
                  ? "Accepted — you'll coordinate a time directly."
                  : "Waiting on the advisor to accept or decline."}{" "}
                <Link href="/founder/meetings">Manage in My meetings →</Link>
              </p>
            </div>
          ) : (
            <div className="card dossier">
              <SendRequestForm
                advisorId={advisor.id}
                remainingHours={availability.remainingHours}
                canRequest
              />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
