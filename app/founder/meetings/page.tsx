import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRoles, getCurrentFounder } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { currentMonth, formatMonth } from "@/lib/types";
import { getFounderUsage } from "@/lib/guardrails";
import { getFounderStage, type FounderStage } from "@/lib/meeting";
import { TopBar } from "@/app/components/TopBar";
import { UsageMeter } from "@/app/components/UsageMeter";
import {
  FounderMeetingCard,
  type FounderMeetingView,
} from "@/app/components/FounderMeetingCard";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; stages: FounderStage[]; empty?: string }[] = [
  { title: "Needs your answer", stages: ["NEEDS_ANSWER"] },
  { title: "Accepted & upcoming", stages: ["ACCEPTED", "UPCOMING"] },
  { title: "Waiting on the advisor", stages: ["WAITING_ADVISOR"] },
  {
    title: "Past",
    stages: ["AWAITING_ADVISOR", "UNDER_REVIEW", "RULED", "COMPLETED", "DID_NOT_MEET"],
  },
  { title: "Declined & withdrawn", stages: ["DECLINED", "WITHDRAWN"] },
];

export default async function FounderMeetings() {
  if (!(await getRoles()).includes("founder")) redirect("/");
  const { current } = await getCurrentFounder();

  const requests = await prisma.meetingRequest.findMany({
    where: { founderId: current.id },
    include: { advisor: true, notifications: true },
    orderBy: { createdAt: "desc" },
  });

  const meetings = requests.map((r): FounderMeetingView & { sortKey: number } => {
    const ruling = r.notifications.find(
      (n) => n.type === "MEETING_CONFLICT" && n.resolved
    );
    return {
      id: r.id,
      topic: r.topic,
      advisorId: r.advisorId,
      advisorName: r.advisor.name,
      advisorTitle: r.advisor.title,
      estimatedHours: r.estimatedHours,
      month: formatMonth(r.month),
      stage: getFounderStage(r),
      scheduledAtLabel: r.scheduledAt ? fmtDateTime(r.scheduledAt) : null,
      decisionNote: r.decisionNote,
      adminRuling:
        r.adminMet != null
          ? { met: r.adminMet, note: ruling?.resolutionNote ?? null }
          : null,
      sortKey: r.createdAt.getTime(),
    };
  });

  const usage = await getFounderUsage(prisma, current, currentMonth());
  const firstName = current.name.split(" ")[0];

  return (
    <>
      <TopBar role="founder" active="meetings" />
      <main className="shell">
        <div className="page-head">
          <p className="eyebrow">Your requests</p>
          <h1>My meetings, {firstName}.</h1>
          <p className="sub">
            Every request you&apos;ve sent, and where it stands. Once an advisor
            accepts, agree a time with them directly in your own calendar, then
            tell us here how it went.
          </p>
        </div>

        <UsageMeter usage={usage} />

        {meetings.length === 0 ? (
          <div className="empty">
            <strong>No requests yet</strong>
            Browse the advisors and send your first meeting request.
          </div>
        ) : (
          SECTIONS.map((s) => {
            const items = meetings.filter((m) => s.stages.includes(m.stage));
            if (items.length === 0) return null;
            return (
              <section key={s.title} style={{ marginBottom: 44 }}>
                <div className="section-label">
                  <h2>{s.title}</h2>
                  <span className="count">{items.length}</span>
                </div>
                <div className="requests">
                  {items.map((m) => (
                    <FounderMeetingCard key={m.id} meeting={m} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
