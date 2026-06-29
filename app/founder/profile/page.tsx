import Link from "next/link";
import { redirect } from "next/navigation";
import { getRole, getCurrentFounder } from "@/lib/session";
import { TopBar } from "@/app/components/TopBar";
import { FounderProfileForm } from "@/app/components/FounderProfileForm";

export const dynamic = "force-dynamic";

export default async function FounderProfile() {
  if ((await getRole()) !== "founder") redirect("/");

  const { current } = await getCurrentFounder();

  return (
    <>
      <TopBar role="founder" active="profile" />
      <main className="shell">
        <Link href="/founder" className="back-link">
          ← Back to advisors
        </Link>

        <div className="page-head">
          <p className="eyebrow">Your profile &amp; dossier</p>
          <h1>{current.company}</h1>
          <p className="sub">
            This is what advisors see when you send a meeting request. The more
            context you give, the better the advice you&apos;ll get back.
          </p>
        </div>

        <section className="card dossier">
          <FounderProfileForm
            values={{
              name: current.name,
              company: current.company,
              oneLiner: current.oneLiner ?? "",
              stage: current.stage ?? "",
              industry: current.industry ?? "",
              website: current.website ?? "",
              about: current.about ?? "",
              traction: current.traction ?? "",
              lookingFor: current.lookingFor ?? "",
            }}
          />
        </section>
      </main>
    </>
  );
}
