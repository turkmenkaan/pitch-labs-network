import type { Advisor, Founder } from "@prisma/client";

// A profile counts as filled in once it has what other people read first.
// Members with an unfinished one are sent to it when they sign in, and the
// admin Members list marks them "Profile incomplete".
export const isAdvisorProfileComplete = (a: Pick<Advisor, "bio" | "expertise">) =>
  Boolean(a.bio && a.expertise);

export const isFounderProfileComplete = (f: Pick<Founder, "company" | "about">) =>
  Boolean(f.company && f.about);

// The stages a founder can pick. Stored as the plain label.
export const FOUNDER_STAGES = [
  "Idea",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C or later",
] as const;

// A stage is valid if it is on the list, or is the value the founder already
// has stored (older profiles hold free text, which must keep saving).
export const isAllowedStage = (stage: string, stored?: string | null) =>
  (FOUNDER_STAGES as readonly string[]).includes(stage) || stage === (stored ?? "");
