import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRoles, getCurrentFounder } from "@/lib/session";
import { getAvailability } from "@/lib/availability";
import { currentMonth, formatMonth } from "@/lib/types";
import { TopBar } from "@/app/components/TopBar";
import { callsLeftWith, getFounderUsage } from "@/lib/guardrails";
import { UsageMeter } from "@/app/components/UsageMeter";
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

  const [availability, activeRequests, usage] = await Promise.all([
    getAvailability(advisor.id, month),
    prisma.meetingRequest.findMany({
      where: {
        advisorId: advisor.id,
        founderId: current.id,
        month,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      orderBy: { createdAt: "asc" },
    }),
    getFounderUsage(prisma, current, month),
  ]);
  const callsLeft = callsLeftWith(usage, advisor.id);
  const canRequest = callsLeft > 0 && usage.hoursLeft > 0;

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

          <UsageMeter
            usage={usage}
            advisorId={advisor.id}
            advisorName={advisor.name.split(" ")[0]}
          />

          {activeRequests.map((r) => (
            <div className="card req" key={r.id} style={{ marginBottom: 16 }}>
              <div className="req-top">
                <div>
                  <h3>{r.topic}</h3>
                  <p className="founder">
                    {r.estimatedHours}h requested this month.
                  </p>
                </div>
                <span
                  className={`pill ${
                    r.status === "ACCEPTED" ? "pill-accepted" : "pill-pending"
                  }`}
                >
                  {r.status === "ACCEPTED" ? "Accepted" : "Pending"}
                </span>
              </div>
              <p className="message">
                {r.status === "ACCEPTED"
                  ? "Accepted — you'll coordinate a time directly."
                  : "Waiting on the advisor to accept or decline."}{" "}
                <Link href="/founder/meetings">Manage in My meetings →</Link>
              </p>
            </div>
          ))}

          {canRequest ? (
            <div className="card dossier">
              <SendRequestForm
                advisorId={advisor.id}
                advisorHoursLeft={availability.remainingHours}
                maxHours={usage.hoursLeft}
              />
            </div>
          ) : (
            <p className="note">
              {callsLeft === 0
                ? `You've reached the limit of ${usage.limits.callsPerAdvisor} calls with ${advisor.name} this month. Try another advisor, or come back next month.`
                : `You've used all ${usage.limits.monthlyHours} of your advisor hours this month. Withdrawn, declined and missed meetings give hours back.`}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
