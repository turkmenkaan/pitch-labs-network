import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentAdvisor } from "@/lib/session";
import { TopBar } from "@/app/components/TopBar";

export const dynamic = "force-dynamic";

export default async function FounderDossier({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { current } = await getCurrentAdvisor();

  // Gate: an advisor can only see a founder's dossier if that founder has
  // actually sent them a meeting request.
  const link = await prisma.meetingRequest.findFirst({
    where: { advisorId: current.id, founderId: id },
    select: { id: true },
  });
  if (!link) notFound();

  const founder = await prisma.founder.findUnique({ where: { id } });
  if (!founder) notFound();

  const rows: { label: string; value: string | null; href?: string }[] = [
    { label: "Company", value: founder.company },
    { label: "Stage", value: founder.stage },
    { label: "Industry", value: founder.industry },
    {
      label: "Website",
      value: founder.website,
      href: founder.website ?? undefined,
    },
  ];

  const sections: { label: string; value: string | null }[] = [
    { label: "What they're building", value: founder.about },
    { label: "Traction", value: founder.traction },
    { label: "What they're looking for", value: founder.lookingFor },
  ];

  return (
    <>
      <TopBar role="advisor" active="requests" />
      <main className="shell">
        <Link href="/advisor" className="back-link">
          ← Back to requests
        </Link>

        <div className="page-head">
          <p className="eyebrow">Founder dossier · read-only</p>
          <h1>{founder.name}</h1>
          {founder.oneLiner && <p className="sub">{founder.oneLiner}</p>}
        </div>

        <section className="card dossier">
          <dl className="facts">
            {rows
              .filter((r) => r.value)
              .map((r) => (
                <div key={r.label} className="fact">
                  <dt>{r.label}</dt>
                  <dd>
                    {r.href ? (
                      <a href={r.href} target="_blank" rel="noreferrer">
                        {r.value} ↗
                      </a>
                    ) : (
                      r.value
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
      </main>
    </>
  );
}
