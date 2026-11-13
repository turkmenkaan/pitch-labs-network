import type { Advisor, Founder } from "@prisma/client";

// A profile counts as filled in once it has what other people read first.
// Members with an unfinished one are sent to it when they sign in, and the
// admin Members list marks them "Profile incomplete".
export const isAdvisorProfileComplete = (a: Pick<Advisor, "bio" | "expertise">) =>
  Boolean(a.bio && a.expertise);

export const isFounderProfileComplete = (f: Pick<Founder, "company" | "about">) =>
  Boolean(f.company && f.about);
