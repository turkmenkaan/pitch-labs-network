import Link from "next/link";
import { getCurrentAdvisor } from "@/lib/session";
import { TopBar } from "@/app/components/TopBar";
import { MyDossierForm } from "@/app/components/MyDossierForm";

export const dynamic = "force-dynamic";

export default async function MyDossier() {
  const { current } = await getCurrentAdvisor();

  return (
    <>
      <TopBar role="advisor" active="dossier" />
      <main className="shell">
        <Link href="/" className="back-link">
          ← Back to requests
        </Link>

        <div className="page-head">
          <p className="eyebrow">Your dossier</p>
          <h1>{current.name}</h1>
          <p className="sub">
            This is what founders see when they browse the network. Keep it
            current — it&apos;s how they decide who to reach out to.
          </p>
        </div>

        <section className="card dossier">
          <MyDossierForm
            values={{
              title: current.title,
              expertise: current.expertise,
              bio: current.bio,
              experience: current.experience ?? "",
              howIHelp: current.howIHelp ?? "",
              location: current.location ?? "",
              linkedinUrl: current.linkedinUrl ?? "",
            }}
          />
        </section>
      </main>
    </>
  );
}
