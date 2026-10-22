import { prisma } from "@/lib/db";
import { getCurrentAdvisor } from "@/lib/session";
import { getAvailability } from "@/lib/availability";
import { currentMonth, formatMonth } from "@/lib/types";
import { redirect } from "next/navigation";
import { getRoles } from "@/lib/session";
import { getMeetingStage, type MeetingStage } from "@/lib/meeting";
import { TopBar } from "../components/TopBar";
import { AvailabilityForm } from "../components/AvailabilityForm";
import { RequestCard, type PendingRequest } from "../components/RequestCard";
import { MeetingCard, type MeetingView } from "../components/MeetingCard";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Float the meetings that need the advisor's attention to the top.
const STAGE_ORDER: Record<MeetingStage, number> = {
  AWAITING_OUTCOME: 0,
  NEEDS_FEEDBACK: 1,
  NEEDS_SCHEDULE: 2,
  UPCOMING: 3,
  COMPLETED_MET: 4,
  DID_NOT_MEET: 5,
};

export default async function AdvisorDashboard() {
  // Route people who aren't advisors to their own workspace.
  const roles = await getRoles();
  if (!roles.includes("advisor")) {
    redirect(roles.includes("admin") ? "/admin" : "/founder");
  }

  const { current } = await getCurrentAdvisor();
  const month = currentMonth();

  const [availability, requests] = await Promise.all([
    getAvailability(current.id, month),
    prisma.meetingRequest.findMany({
      where: { advisorId: current.id, month },
      include: { founder: true, notifications: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pending = requests.filter((r) => r.status === "PENDING");
  const accepted = requests.filter((r) => r.status === "ACCEPTED");
  const rejected = requests.filter((r) => r.status === "REJECTED");

  const toCard = (r: (typeof requests)[number]): PendingRequest => ({
    id: r.id,
    topic: r.topic,
    message: r.message,
    estimatedHours: r.estimatedHours,
    createdAt: fmtDate(r.createdAt),
    founderId: r.founderId,
    founderName: r.founder.name,
    founderCompany: r.founder.company,
  });

  const toMeeting = (r: (typeof requests)[number]): MeetingView => {
    const stage = getMeetingStage(r)!;
    return {
      id: r.id,
      topic: r.topic,
      founderId: r.founderId,
      founderName: r.founder.name,
      founderCompany: r.founder.company,
      estimatedHours: r.estimatedHours,
      stage,
      scheduledAtInput: r.scheduledAt ? toLocalInput(r.scheduledAt) : null,
      scheduledAtLabel: r.scheduledAt ? fmtDateTime(r.scheduledAt) : null,
      advisorRating: r.advisorRating,
      advisorFeedback: r.advisorFeedback,
      hasConflict: r.notifications.some(
        (n) => n.type === "MEETING_CONFLICT" && !n.resolved
      ),
    };
  };

  const meetings = accepted
    .map(toMeeting)
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);

  const pct =
    availability.totalHours > 0
      ? Math.round(
          (availability.remainingHours / availability.totalHours) * 100
        )
      : 0;

  const firstName = current.name.split(" ")[0];

  return (
    <>
      <TopBar role="advisor" active="requests" />

      <main className="shell">
        <div className="page-head">
          <p className="eyebrow">{formatMonth(month)}</p>
          <h1>Good to see you, {firstName}.</h1>
          <p className="sub">
            Set how many hours you can give this month, then review the founders
            who&apos;d like your counsel. Accepting a meeting draws down your
            remaining hours.
          </p>
        </div>

        {/* Availability ------------------------------------------------- */}
        <section className="card availability">
          <div className="left">
            <p className="month-name">Monthly availability</p>
            <h2>{formatMonth(month)}</h2>
            <AvailabilityForm
              month={month}
              totalHours={availability.totalHours}
              committedHours={availability.committedHours}
            />
          </div>
          <div className="right">
            <p
              className="month-name"
              style={{ color: "rgba(244,241,234,0.7)" }}
            >
              Hours remaining
            </p>
            <div className="gauge">
              <span className="big">{availability.remainingHours}</span>
              <span className="unit">
                / {availability.totalHours || "—"} h
              </span>
            </div>
            <p className="gauge-caption">
              {availability.hasSetAvailability
                ? `${availability.committedHours}h committed to accepted meetings`
                : "You haven't set availability for this month yet."}
            </p>
            <div className="bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="legend">
              <span>
                <i className="dot" style={{ background: "#f4f1ea" }} />
                Remaining
              </span>
              <span>
                <i
                  className="dot"
                  style={{ background: "rgba(244,241,234,0.3)" }}
                />
                Committed
              </span>
            </div>
          </div>
        </section>

        {/* Pending requests --------------------------------------------- */}
        <section>
          <div className="section-label">
            <h2>Meeting requests</h2>
            <span className="count">
              {pending.length} awaiting your decision
            </span>
          </div>

          {pending.length === 0 ? (
            <div className="empty">
              <strong>You&apos;re all caught up</strong>
              No pending meeting requests this month.
            </div>
          ) : (
            <div className="requests">
              {pending.map((r) => (
                <RequestCard key={r.id} request={toCard(r)} />
              ))}
            </div>
          )}
        </section>

        {/* Your meetings (accepted → lifecycle) ------------------------- */}
        {meetings.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <div className="section-label">
              <h2>Your meetings</h2>
              <span className="count">
                {
                  meetings.filter((m) =>
                    ["NEEDS_SCHEDULE", "AWAITING_OUTCOME", "NEEDS_FEEDBACK"].includes(
                      m.stage
                    )
                  ).length
                }{" "}
                need action
              </span>
            </div>
            <div className="requests">
              {meetings.map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          </section>
        )}

        {/* Rejected ----------------------------------------------------- */}
        {rejected.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <div className="section-label">
              <h2>Rejected</h2>
              <span className="count">{rejected.length}</span>
            </div>
            <div className="requests">
              {rejected.map((r) => (
                <article key={r.id} className="card mini">
                  <div className="req-top">
                    <div>
                      <h3>{r.topic}</h3>
                      <p className="founder">
                        {r.founder.name} · {r.founder.company}
                      </p>
                    </div>
                    <span className="pill pill-rejected">Rejected</span>
                  </div>
                  {r.decisionNote && (
                    <p className="decision-note">{r.decisionNote}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
