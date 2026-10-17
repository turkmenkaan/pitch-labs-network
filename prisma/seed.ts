import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function month(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Date relative to now, kept within the current month so it counts correctly.
function daysFromNow(days: number, hour = 14): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  // The seed wipes every member and meeting. Local .env points at the shared
  // Supabase database, so make that an explicit choice.
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    console.error(
      "Refusing to seed: this deletes all advisors, founders and meetings.\n" +
        "Re-run with ALLOW_DESTRUCTIVE_SEED=1 if the target database is disposable."
    );
    process.exit(1);
  }

  // Clean slate so the seed is idempotent. Admins are kept (never wiped).
  await prisma.auditLog.deleteMany();
  await prisma.adminNotification.deleteMany();
  await prisma.meetingRequest.deleteMany();
  await prisma.monthlyAvailability.deleteMany();
  await prisma.founder.deleteMany();
  await prisma.advisor.deleteMany();

  const [maya, daniel, priya] = await Promise.all([
    prisma.advisor.create({
      data: {
        name: "Maya Okonkwo",
        title: "Former VP Growth, Stripe",
        expertise: "Go-to-market, Pricing, Marketplaces",
        bio: "Two decades scaling fintech and marketplace businesses from seed to IPO. Mentors founders on growth loops and pricing strategy.",
        experience:
          "VP Growth at Stripe (2015–2021); earlier led growth at a Series B marketplace through its acquisition. Angel investor in 20+ early-stage companies.",
        howIHelp:
          "Best on pricing & packaging, growth-loop design, and early GTM. I like a working session with real numbers in front of us rather than abstract advice.",
        location: "Lisbon, PT",
        linkedinUrl: "https://linkedin.com/in/mayaokonkwo",
        email: "maya@advisory.network",
        availability: {
          create: [{ month: month(), totalHours: 8 }],
        },
      },
    }),
    prisma.advisor.create({
      data: {
        name: "Daniel Reyes",
        title: "Co-founder & CTO, Lumen (acq. by Datadog)",
        expertise: "Platform architecture, Hiring, 0→1 engineering",
        bio: "Built and sold an infrastructure startup. Helps technical founders make early architecture and team decisions they won't regret.",
        experience:
          "Co-founded Lumen (observability) and ran engineering through its acquisition by Datadog. Before that, staff engineer at two infra startups.",
        howIHelp:
          "Architecture reviews, first senior eng hires, and avoiding premature scaling. Happy to read a design doc beforehand and dig in live.",
        location: "Austin, TX",
        linkedinUrl: "https://linkedin.com/in/danielreyes",
        email: "daniel@advisory.network",
        availability: {
          create: [{ month: month(), totalHours: 12 }],
        },
      },
    }),
    prisma.advisor.create({
      data: {
        name: "Priya Nair",
        title: "Partner, Northwind Capital",
        expertise: "Fundraising, Board strategy, SaaS metrics",
        bio: "Early-stage investor and operator. Coaches founders through fundraising narrative and board management.",
        // Sparser dossier on purpose — shows the "fill this in" prompts.
        email: "priya@advisory.network",
        // Intentionally has NOT set availability yet — exercises the empty state.
      },
    }),
  ]);

  const [aisha, marcus, lena, tomas] = await Promise.all([
    prisma.founder.create({
      data: {
        name: "Aisha Bello",
        company: "Verdant",
        email: "aisha@verdant.io",
        oneLiner: "Carbon-aware routing for freight logistics.",
        stage: "Seed",
        industry: "Climate / Logistics",
        website: "https://verdant.io",
        about:
          "Verdant plans freight routes that cut emissions and cost together, plugging into existing TMS systems. Live with three mid-market shippers.",
        traction: "$22k MRR, growing ~18% MoM. 3 paying customers, 2 in pilot.",
        lookingFor:
          "Help packaging an enterprise tier and thinking through usage-based pricing.",
      },
    }),
    prisma.founder.create({
      data: {
        name: "Marcus Lin",
        company: "Tindle Health",
        email: "marcus@tindle.health",
        oneLiner: "Async primary care for shift workers.",
        stage: "Pre-seed",
        industry: "Digital Health",
        website: "https://tindle.health",
        about:
          "Tindle delivers async primary-care visits designed around non-9-to-5 schedules. Currently a 4-person team post-prototype.",
        traction: "1,200 waitlist signups; pilot with a logistics employer (800 staff).",
        lookingFor:
          "Advice on the first senior engineering hire and a referral-driven growth loop.",
      },
    }),
    prisma.founder.create({
      data: {
        name: "Lena Schmidt",
        company: "Cobalt Robotics",
        email: "lena@cobalt.ai",
        oneLiner: "Perception software for warehouse robotics.",
        stage: "Seed",
        industry: "Robotics / AI",
        website: "https://cobalt.ai",
        about:
          "Cobalt builds the perception stack that lets off-the-shelf arms handle mixed-SKU picking. Strong technical team out of a robotics lab.",
        traction: "2 design partners; p99 latency cut 40% last quarter.",
        lookingFor:
          "Architecture guidance on scaling the inference pipeline and marketplace liquidity.",
      },
    }),
    prisma.founder.create({
      data: {
        name: "Tomás Ferreira",
        company: "Brava Payments",
        email: "tomas@brava.com",
        oneLiner: "Embedded payments for LATAM marketplaces.",
        stage: "Seed",
        industry: "Fintech / Payments",
        website: "https://brava.com",
        about:
          "Brava gives marketplaces a drop-in ledger and payouts layer tuned for LATAM rails. Two engineers, founder-led sales.",
        traction: "Processing ~$400k/mo GMV across 2 marketplaces.",
        lookingFor:
          "A second opinion on ledger architecture: managed service vs. building in-house.",
      },
    }),
  ]);

  await prisma.meetingRequest.createMany({
    data: [
      {
        advisorId: maya.id,
        founderId: aisha.id,
        topic: "Pricing our enterprise tier",
        message:
          "We're moving upmarket and unsure how to package usage-based pricing for enterprise. Would love 45 min to pressure-test our model.",
        estimatedHours: 1,
        month: month(),
        status: "PENDING",
      },
      {
        advisorId: maya.id,
        founderId: marcus.id,
        topic: "Growth loop teardown",
        message:
          "Our referral loop has stalled. Hoping for a teardown of our current funnel and ideas on activation.",
        estimatedHours: 2,
        month: month(),
        status: "PENDING",
      },
      {
        advisorId: maya.id,
        founderId: lena.id,
        topic: "Marketplace liquidity",
        message:
          "Chicken-and-egg problem on the supply side. Want to talk through cold-start tactics.",
        estimatedHours: 1,
        month: month(),
        status: "ACCEPTED",
        decidedAt: new Date(),
      },
      {
        advisorId: maya.id,
        founderId: tomas.id,
        topic: "Intro call",
        message: "General intro and roadmap feedback.",
        estimatedHours: 1,
        month: month(),
        status: "REJECTED",
        decisionNote: "Out of my area — better suited to a payments specialist.",
        decidedAt: new Date(),
      },
      {
        advisorId: daniel.id,
        founderId: lena.id,
        topic: "Scaling our perception pipeline",
        message:
          "We're hitting latency limits on our inference pipeline. Want architecture advice before we over-engineer.",
        estimatedHours: 2,
        month: month(),
        status: "PENDING",
      },
      // Daniel — meetings across every lifecycle stage:
      // 1) ACCEPTED, no time yet  → NEEDS_SCHEDULE
      {
        advisorId: daniel.id,
        founderId: marcus.id,
        topic: "First senior eng hire",
        message: "How to evaluate and structure our first staff-level hire.",
        estimatedHours: 1,
        month: month(),
        status: "ACCEPTED",
        decidedAt: new Date(),
      },
      // 2) ACCEPTED, scheduled in the future  → UPCOMING
      {
        advisorId: daniel.id,
        founderId: aisha.id,
        topic: "Infra cost review before Series A",
        message: "Want a sanity check on our cloud spend ahead of diligence.",
        estimatedHours: 1,
        month: month(),
        status: "ACCEPTED",
        decidedAt: new Date(),
        scheduledAt: daysFromNow(3),
      },
      // 3) ACCEPTED, time has passed, no outcome yet  → AWAITING_OUTCOME.
      //    Founder already reported they met — answering "no" triggers a
      //    conflict notification to admins.
      {
        advisorId: daniel.id,
        founderId: tomas.id,
        topic: "Payments architecture review",
        message: "Deciding between a ledger service vs. building in-app.",
        estimatedHours: 1,
        month: month(),
        status: "ACCEPTED",
        decidedAt: new Date(),
        scheduledAt: daysFromNow(-2),
        founderMet: true,
      },
      // 4) ACCEPTED, happened, feedback left  → COMPLETED_MET
      {
        advisorId: daniel.id,
        founderId: lena.id,
        topic: "Inference pipeline latency",
        message: "Cut p99 latency on our perception stack.",
        estimatedHours: 1,
        month: month(),
        status: "ACCEPTED",
        decidedAt: new Date(),
        scheduledAt: daysFromNow(-9),
        advisorMet: true,
        founderMet: true,
        advisorRating: 5,
        advisorFeedback:
          "Sharp team. Pointed them at batching + a caching layer; they're going to prototype both.",
        outcomeRecordedAt: daysFromNow(-9, 16),
      },
    ],
  });

  await prisma.admin.upsert({
    where: { email: "admin@advisory.network" },
    update: {},
    create: { name: "Demo Admin", email: "admin@advisory.network" },
  });

  console.log("Seeded advisors, founders, meeting requests, and a demo admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
