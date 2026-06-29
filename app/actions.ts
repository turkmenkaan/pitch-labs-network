"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAvailability } from "@/lib/availability";
import { getCurrentAdvisor, getCurrentFounder } from "@/lib/session";
import { currentMonth } from "@/lib/types";

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

// --- "Viewing as" identity switcher (stubbed auth) -----------------------
// value is "advisor:<id>" or "founder:<id>".
export async function setIdentity(formData: FormData) {
  const value = String(formData.get("identity") ?? "");
  const [kind, id] = value.split(":");
  if ((kind !== "advisor" && kind !== "founder") || !id) return;

  const store = await cookies();
  store.set("role", kind, { path: "/", httpOnly: true });
  if (kind === "advisor") {
    store.set("advisorId", id, { path: "/", httpOnly: true });
  } else {
    store.set("founderId", id, { path: "/", httpOnly: true });
  }

  redirect(kind === "advisor" ? "/" : "/founder");
}

// --- Advisor updates their own dossier -----------------------------------
export async function updateMyDossier(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Resolve the advisor from the session, not from the form, so one advisor
  // can't edit another's dossier.
  const { current } = await getCurrentAdvisor();

  const title = String(formData.get("title") ?? "").trim();
  const expertise = String(formData.get("expertise") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();
  const howIHelp = String(formData.get("howIHelp") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim();

  if (!title || !expertise || !bio) {
    return { ok: false, error: "Title, expertise, and intro are required." };
  }
  if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) {
    return { ok: false, error: "LinkedIn URL should start with http(s)://" };
  }

  await prisma.advisor.update({
    where: { id: current.id },
    data: {
      title,
      expertise,
      bio,
      experience: experience || null,
      howIHelp: howIHelp || null,
      location: location || null,
      linkedinUrl: linkedinUrl || null,
    },
  });

  revalidatePath("/dossier");
  revalidatePath("/");
  return { ok: true, message: "Dossier saved." };
}

// --- Set / update monthly availability -----------------------------------
export async function setAvailability(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const advisorId = String(formData.get("advisorId") ?? "");
  const month = String(formData.get("month") ?? "");
  const totalHours = Number(formData.get("totalHours"));

  if (!advisorId || !month) {
    return { ok: false, error: "Missing advisor or month." };
  }
  if (!Number.isFinite(totalHours) || totalHours < 0) {
    return { ok: false, error: "Enter a valid number of hours (0 or more)." };
  }

  // Can't commit fewer hours than already locked in by accepted meetings.
  const { committedHours } = await getAvailability(advisorId, month);
  if (totalHours < committedHours) {
    return {
      ok: false,
      error: `You've already committed ${committedHours}h to accepted meetings this month. Set ${committedHours}h or more.`,
    };
  }

  await prisma.monthlyAvailability.upsert({
    where: { advisorId_month: { advisorId, month } },
    update: { totalHours },
    create: { advisorId, month, totalHours },
  });

  revalidatePath("/");
  return { ok: true, message: "Availability updated." };
}

// --- Accept / reject a meeting request -----------------------------------
export async function decideRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? ""); // ACCEPTED | REJECTED
  const decisionNote = String(formData.get("decisionNote") ?? "").trim();

  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return { ok: false, error: "Invalid decision." };
  }

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "PENDING") {
    revalidatePath("/");
    return { ok: true }; // already decided elsewhere — treat as success
  }

  // Guard: accepting can't exceed remaining availability for the month.
  if (decision === "ACCEPTED") {
    const { remainingHours, hasSetAvailability } = await getAvailability(
      request.advisorId,
      request.month
    );
    if (!hasSetAvailability) {
      return {
        ok: false,
        error: "Set your availability for this month before accepting.",
      };
    }
    if (request.estimatedHours > remainingHours) {
      return {
        ok: false,
        error: `Not enough hours left — ${remainingHours}h remaining, this needs ${request.estimatedHours}h.`,
      };
    }
  }

  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: {
      status: decision,
      decisionNote: decisionNote || null,
      decidedAt: new Date(),
    },
  });

  // TODO(Phase 1): notify the founder of the approval/rejection (email/in-app).
  revalidatePath("/");
  return { ok: true };
}

// --- Meeting lifecycle ----------------------------------------------------

// Step 1: advisor records the agreed date/time after accepting.
export async function scheduleMeeting(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");

  if (!scheduledAtRaw) {
    return { ok: false, error: "Pick a date and time." };
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "That date/time isn't valid." };
  }
  if (scheduledAt.getTime() < Date.now()) {
    return { ok: false, error: "Pick a time in the future." };
  }

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "ACCEPTED") {
    return { ok: false, error: "Meeting not found or not accepted." };
  }

  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: { scheduledAt },
  });

  // TODO(later): generate calendar invite + video link, notify the founder.
  revalidatePath("/");
  return { ok: true, message: "Meeting time saved." };
}

// Step 2: once the time has passed, advisor says whether it happened.
export async function recordOutcome(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const met = String(formData.get("met") ?? ""); // "yes" | "no"

  if (met !== "yes" && met !== "no") {
    return { ok: false, error: "Invalid answer." };
  }

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "ACCEPTED") {
    return { ok: false, error: "Meeting not found." };
  }

  const advisorMet = met === "yes";
  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: { advisorMet, outcomeRecordedAt: new Date() },
  });

  await flagConflictIfAny(requestId);
  revalidatePath("/");
  return { ok: true };
}

// Step 3: advisor leaves feedback for a meeting that happened.
export async function submitFeedback(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const rating = Number(formData.get("rating"));
  const feedback = String(formData.get("feedback") ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Give the meeting a rating from 1 to 5." };
  }
  if (!feedback) {
    return { ok: false, error: "Add a short note about how it went." };
  }

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "ACCEPTED" || request.advisorMet !== true) {
    return { ok: false, error: "Feedback isn't open for this meeting." };
  }

  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: { advisorRating: rating, advisorFeedback: feedback },
  });

  revalidatePath("/");
  return { ok: true, message: "Thanks — feedback recorded." };
}

// If advisor and founder disagree on whether the meeting happened, raise an
// internal notification for admins (idempotent per meeting).
async function flagConflictIfAny(requestId: string) {
  const r = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    include: { advisor: true, founder: true },
  });
  if (!r || r.advisorMet == null || r.founderMet == null) return;
  if (r.advisorMet === r.founderMet) return;

  await prisma.adminNotification.upsert({
    where: {
      meetingRequestId_type: {
        meetingRequestId: requestId,
        type: "MEETING_CONFLICT",
      },
    },
    update: {},
    create: {
      type: "MEETING_CONFLICT",
      meetingRequestId: requestId,
      message: `Conflict on "${r.topic}": ${r.advisor.name} says the meeting ${
        r.advisorMet ? "happened" : "did not happen"
      }, but ${r.founder.name} says it ${
        r.founderMet ? "happened" : "did not happen"
      }.`,
    },
  });
}

// ========================================================================
//  Founder-side actions
// ========================================================================

// Founder sends a meeting request to an advisor.
export async function sendMeetingRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current } = await getCurrentFounder();

  const advisorId = String(formData.get("advisorId") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const estimatedHours = Number(formData.get("estimatedHours"));

  if (!advisorId) return { ok: false, error: "Missing advisor." };
  if (!topic) return { ok: false, error: "Add a topic for the meeting." };
  if (!message) return { ok: false, error: "Add a short message." };
  if (!Number.isInteger(estimatedHours) || estimatedHours < 1) {
    return { ok: false, error: "Estimated hours must be at least 1." };
  }

  const advisor = await prisma.advisor.findUnique({ where: { id: advisorId } });
  if (!advisor) return { ok: false, error: "Advisor not found." };

  const month = currentMonth();

  // Don't let a founder stack duplicate open requests with the same advisor.
  const existing = await prisma.meetingRequest.findFirst({
    where: {
      advisorId,
      founderId: current.id,
      month,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
  });
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "PENDING"
          ? "You already have a pending request with this advisor this month."
          : "You already have an accepted meeting with this advisor this month.",
    };
  }

  await prisma.meetingRequest.create({
    data: {
      advisorId,
      founderId: current.id,
      topic,
      message,
      estimatedHours,
      month,
      status: "PENDING",
    },
  });

  // TODO(later): notify the advisor (email/in-app).
  revalidatePath("/founder");
  revalidatePath(`/founder/advisors/${advisorId}`);
  return { ok: true, message: "Request sent." };
}

// Founder creates/updates their own profile + dossier.
export async function updateFounderProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current } = await getCurrentFounder();

  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const oneLiner = String(formData.get("oneLiner") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const about = String(formData.get("about") ?? "").trim();
  const traction = String(formData.get("traction") ?? "").trim();
  const lookingFor = String(formData.get("lookingFor") ?? "").trim();

  if (!name || !company) {
    return { ok: false, error: "Name and company are required." };
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return { ok: false, error: "Website should start with http(s)://" };
  }

  await prisma.founder.update({
    where: { id: current.id },
    data: {
      name,
      company,
      oneLiner: oneLiner || null,
      stage: stage || null,
      industry: industry || null,
      website: website || null,
      about: about || null,
      traction: traction || null,
      lookingFor: lookingFor || null,
    },
  });

  revalidatePath("/founder/profile");
  revalidatePath("/founder");
  return { ok: true, message: "Profile saved." };
}
