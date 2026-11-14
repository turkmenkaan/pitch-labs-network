"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAvailability } from "@/lib/availability";
import { checkNewRequest, getFounderUsage } from "@/lib/guardrails";
import {
  getActingAdvisor,
  getActingFounder,
  getSessionEmail,
  LAST_ROLE_COOKIE,
  previewBlock,
  ROLE_HOME,
  rolesForEmail,
  VIEW_AS_COOKIE,
  type Role,
} from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkReason } from "@/lib/reason";
import { notify } from "@/lib/notify";
import {
  meetingCancelledMessage,
  meetingConflictMessage,
  requestDecidedMessage,
  requestSentMessage,
} from "@/lib/notify/messages";
import { canChangeTime } from "@/lib/meeting";
import { checkSlots, otherSide, type Side } from "@/lib/slots";
import { parseEasternInput } from "@/lib/time";
import { currentMonth } from "@/lib/types";

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

const isRole = (v: string): v is Role =>
  v === "admin" || v === "advisor" || v === "founder";

// --- Sign out ------------------------------------------------------------
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/login");
}

// --- Switch workspace (people who hold several roles) ----------------------
// Remembers the choice so the next sign-in lands there. Only roles the signed-in
// email really holds are accepted; the cookie is a preference, never a grant.
export async function switchRole(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const held = await rolesForEmail(email);
  if (!isRole(role) || !held.includes(role)) redirect("/");

  (await cookies()).set(LAST_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Leave any preview behind: it belongs to the admin workspace.
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect(ROLE_HOME[role]);
}

// --- Advisor updates their own dossier -----------------------------------
export async function updateMyDossier(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  // Resolve the advisor from the session, not from the form, so one advisor
  // can't edit another's dossier.
  const { current } = await getActingAdvisor();

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
  revalidatePath("/advisor");
  return { ok: true, message: "Dossier saved." };
}

// --- Set / update monthly availability -----------------------------------
export async function setAvailability(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  // Resolve the advisor from the session, never from the form, so one advisor
  // can't set another's availability.
  const { current } = await getActingAdvisor();
  const advisorId = current.id;
  const month = String(formData.get("month") ?? "");
  const totalHours = Number(formData.get("totalHours"));

  if (!month) {
    return { ok: false, error: "Missing month." };
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

  revalidatePath("/advisor");
  return { ok: true, message: "Availability updated." };
}

// What to tell an advisor who acts on a request that is no longer pending.
function alreadyDecided(status: string | undefined): string {
  return status === "WITHDRAWN"
    ? "The founder withdrew this request, so it can't be accepted or declined."
    : "This request was already decided.";
}

// --- Accept / reject a meeting request -----------------------------------
export async function decideRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? ""); // ACCEPTED | REJECTED
  const decisionNote = String(formData.get("decisionNote") ?? "").trim();

  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return { ok: false, error: "Invalid decision." };
  }
  // Declining needs a reason; the founder sees it.
  let note = decisionNote;
  if (decision === "REJECTED") {
    const checked = checkReason(decisionNote, "declining");
    if ("error" in checked) return { ok: false, error: checked.error };
    note = checked.reason;
  }

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Request not found." };

  // Only the advisor the request was sent to can decide it.
  const { current } = await getActingAdvisor();
  if (request.advisorId !== current.id) {
    return { ok: false, error: "Not your meeting." };
  }

  if (request.status !== "PENDING") {
    return { ok: false, error: alreadyDecided(request.status) };
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

  // Only while still pending, so a founder's withdrawal can't be overwritten.
  const decided = await prisma.meetingRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: decision,
      decisionNote: note || null,
      decidedAt: new Date(),
    },
  });
  if (decided.count === 0) {
    // Changed between the read above and this write.
    const now = await prisma.meetingRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    return { ok: false, error: alreadyDecided(now?.status) };
  }

  const founder = await prisma.founder.findUnique({
    where: { id: request.founderId },
  });
  if (founder && !founder.deactivatedAt) {
    notify([
      {
        type: "REQUEST_DECIDED",
        recipientEmail: founder.email,
        dedupeKey: `request-decided:${request.id}`,
        message: requestDecidedMessage({
          advisorName: current.name,
          topic: request.topic,
          accepted: decision === "ACCEPTED",
          note: note || null,
        }),
      },
    ]);
  }
  revalidatePath("/advisor");
  return { ok: true };
}

// --- Meeting lifecycle ----------------------------------------------------

// Step 1: advisor records the agreed date/time after accepting.
export async function scheduleMeeting(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const requestId = String(formData.get("requestId") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");

  if (!scheduledAtRaw) {
    return { ok: false, error: "Pick a date and time." };
  }
  // The picker sends the time as typed, which is Eastern Time.
  const scheduledAt = parseEasternInput(scheduledAtRaw);
  if (!scheduledAt) {
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

  // Only the advisor on the meeting can schedule it.
  const { current } = await getActingAdvisor();
  if (request.advisorId !== current.id) {
    return { ok: false, error: "Not your meeting." };
  }

  // The time is the advisor's to record, but not once anyone has said whether
  // the meeting happened. Entering it settles any times still on the table.
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.meetingRequest.updateMany({
      where: {
        id: requestId,
        status: "ACCEPTED",
        advisorMet: null,
        founderMet: null,
        adminMet: null,
      },
      data: { scheduledAt },
    });
    if (updated.count === 0) return false;
    await tx.meetingSlot.updateMany({
      where: { meetingRequestId: requestId, status: "OPEN" },
      data: { status: "SUPERSEDED" },
    });
    return true;
  });
  if (!saved) {
    return { ok: false, error: "This meeting can't be rescheduled any more." };
  }

  // TODO(later): generate calendar invite + video link, notify the founder.
  revalidatePath("/advisor");
  revalidatePath("/founder/meetings");
  return { ok: true, message: "Meeting time saved." };
}

// --- Agreeing a time: propose and pick -------------------------------------
// Either side proposes up to three times for an accepted meeting; the other
// side picks one (it becomes the meeting's time) or answers with times of their
// own. Only the latest round stays open. The current time, if any, stays in
// force until a new one is picked.

function revalidateScheduling() {
  revalidatePath("/advisor");
  revalidatePath("/founder/meetings");
}

async function proposeTimes(
  requestId: string,
  side: Side,
  memberId: string,
  rawSlots: string[]
): Promise<ActionState> {
  const checked = checkSlots(rawSlots);
  if ("error" in checked) return { ok: false, error: checked.error };

  const request = await prisma.meetingRequest.findUnique({ where: { id: requestId } });
  const mine =
    request && (side === "advisor" ? request.advisorId : request.founderId) === memberId;
  if (!request || !mine) return { ok: false, error: "Meeting not found." };
  if (!canChangeTime(request)) {
    return { ok: false, error: "This meeting's time can't be changed any more." };
  }

  const done = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction so a cancel can't slip in between.
    const live = await tx.meetingRequest.count({
      where: {
        id: requestId,
        status: "ACCEPTED",
        advisorMet: null,
        founderMet: null,
        adminMet: null,
      },
    });
    if (live === 0) return false;
    await tx.meetingSlot.updateMany({
      where: { meetingRequestId: requestId, status: "OPEN" },
      data: { status: "SUPERSEDED" },
    });
    await tx.meetingSlot.createMany({
      data: checked.slots.map((startsAt) => ({
        meetingRequestId: requestId,
        startsAt,
        proposedBy: side,
      })),
    });
    return true;
  });
  if (!done) return { ok: false, error: "This meeting's time can't be changed any more." };

  revalidateScheduling();
  return { ok: true, message: "Times sent." };
}

export async function proposeTimesAsAdvisor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingAdvisor();
  return proposeTimes(
    String(formData.get("requestId") ?? ""),
    "advisor",
    current.id,
    formData.getAll("slot").map(String)
  );
}

export async function proposeTimesAsFounder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingFounder();
  return proposeTimes(
    String(formData.get("requestId") ?? ""),
    "founder",
    current.id,
    formData.getAll("slot").map(String)
  );
}

async function pickTime(
  requestId: string,
  side: Side,
  memberId: string,
  slotId: string
): Promise<ActionState> {
  if (!slotId) return { ok: false, error: "Choose one of the proposed times." };

  const request = await prisma.meetingRequest.findUnique({ where: { id: requestId } });
  const mine =
    request && (side === "advisor" ? request.advisorId : request.founderId) === memberId;
  if (!request || !mine) return { ok: false, error: "Meeting not found." };

  const gone = "That time was already taken or withdrawn.";
  const picked = await prisma.$transaction(async (tx) => {
    // Only the side that did not propose can answer, and only while the meeting
    // is still open and the slot is still on the table.
    const slot = await tx.meetingSlot.findFirst({
      where: {
        id: slotId,
        meetingRequestId: requestId,
        status: "OPEN",
        proposedBy: otherSide(side),
        startsAt: { gt: new Date() },
        meetingRequest: {
          status: "ACCEPTED",
          advisorMet: null,
          founderMet: null,
          adminMet: null,
        },
      },
    });
    if (!slot) return null;
    const claimed = await tx.meetingSlot.updateMany({
      where: { id: slot.id, status: "OPEN" },
      data: { status: "PICKED" },
    });
    if (claimed.count === 0) return null;
    await tx.meetingSlot.updateMany({
      where: { meetingRequestId: requestId, status: "OPEN" },
      data: { status: "SUPERSEDED" },
    });
    await tx.meetingRequest.update({
      where: { id: requestId },
      data: { scheduledAt: slot.startsAt },
    });
    return slot;
  });
  if (!picked) return { ok: false, error: gone };

  revalidateScheduling();
  return { ok: true, message: "Time confirmed." };
}

export async function pickTimeAsAdvisor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingAdvisor();
  return pickTime(
    String(formData.get("requestId") ?? ""),
    "advisor",
    current.id,
    String(formData.get("slotId") ?? "")
  );
}

export async function pickTimeAsFounder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingFounder();
  return pickTime(
    String(formData.get("requestId") ?? ""),
    "founder",
    current.id,
    String(formData.get("slotId") ?? "")
  );
}

// Step 2: once the time has passed, advisor says whether it happened.
export async function recordOutcome(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

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

  // Only the advisor on the meeting can record its outcome.
  const { current } = await getActingAdvisor();
  if (request.advisorId !== current.id) {
    return { ok: false, error: "Not your meeting." };
  }

  if (request.adminMet != null) {
    return { ok: false, error: "An admin has already ruled on this meeting." };
  }

  const advisorMet = met === "yes";
  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: { advisorMet, outcomeRecordedAt: new Date() },
  });

  await flagConflictIfAny(requestId);
  revalidatePath("/advisor");
  return { ok: true };
}

// Step 3: advisor leaves feedback for a meeting that happened.
export async function submitFeedback(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

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
  if (
    !request ||
    request.status !== "ACCEPTED" ||
    (request.adminMet ?? request.advisorMet) !== true
  ) {
    return { ok: false, error: "Feedback isn't open for this meeting." };
  }

  // Only the advisor on the meeting can leave feedback.
  const { current } = await getActingAdvisor();
  if (request.advisorId !== current.id) {
    return { ok: false, error: "Not your meeting." };
  }

  await prisma.meetingRequest.update({
    where: { id: requestId },
    data: { advisorRating: rating, advisorFeedback: feedback },
  });

  revalidatePath("/advisor");
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

  const admins = await prisma.admin.findMany({ select: { id: true, email: true } });
  const summary = `Conflict on "${r.topic}": ${r.advisor.name} says the meeting ${
    r.advisorMet ? "happened" : "did not happen"
  }, but ${r.founder.name} says it ${
    r.founderMet ? "happened" : "did not happen"
  }.`;
  notify(
    admins.map((a) => ({
      type: "MEETING_CONFLICT" as const,
      recipientEmail: a.email,
      dedupeKey: `conflict:${requestId}:${a.id}`,
      message: meetingConflictMessage({ summary }),
    }))
  );

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
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const { current } = await getActingFounder();

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
  if (!advisor || advisor.deactivatedAt) {
    return { ok: false, error: "Advisor not found." };
  }
  // Someone who is both an advisor and a founder can't book themselves.
  if (advisor.email === current.email) {
    return { ok: false, error: "You can't request a meeting with yourself." };
  }

  const month = currentMonth();

  // Guardrails: a monthly hours cap and a per-advisor call cap (see
  // lib/guardrails.ts). Count and insert run in one transaction under a
  // per-founder lock so two simultaneous requests can't both slip past.
  let requestId = "";
  const error = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${current.id}))`;
    const usage = await getFounderUsage(tx, current, month);
    const problem = checkNewRequest(usage, advisorId, estimatedHours);
    if (problem) return problem;
    const created = await tx.meetingRequest.create({
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
    requestId = created.id;
    return null;
  });
  if (error) return { ok: false, error };

  notify([
    {
      type: "REQUEST_SENT",
      recipientEmail: advisor.email,
      dedupeKey: `request-sent:${requestId}`,
      message: requestSentMessage({
        founderName: current.name,
        company: current.company,
        topic,
        estimatedHours,
      }),
    },
  ]);
  revalidatePath("/founder");
  revalidatePath(`/founder/advisors/${advisorId}`);
  return { ok: true, message: "Request sent." };
}

// Founder creates/updates their own profile + dossier.
export async function updateFounderProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const { current } = await getActingFounder();

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

// Founder answers "did we meet?". Runs the same conflict check as the
// advisor's answer, whichever side answers second.
export async function recordFounderOutcome(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const requestId = String(formData.get("requestId") ?? "");
  const met = String(formData.get("met") ?? ""); // "yes" | "no"
  if (met !== "yes" && met !== "no") {
    return { ok: false, error: "Invalid answer." };
  }

  const { current } = await getActingFounder();

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.founderId !== current.id) {
    return { ok: false, error: "Meeting not found." };
  }
  if (request.status !== "ACCEPTED") {
    return { ok: false, error: "This meeting hasn't been accepted." };
  }
  if (request.adminMet != null) {
    return { ok: false, error: "An admin has already ruled on this meeting." };
  }
  if (request.founderMet != null) {
    return { ok: false, error: "You've already answered for this meeting." };
  }
  // If the advisor recorded a time, don't accept an answer before it passes.
  if (request.scheduledAt && request.scheduledAt.getTime() > Date.now()) {
    return { ok: false, error: "This meeting is still in the future." };
  }

  // Only set it if still unanswered (guards a double submit).
  const updated = await prisma.meetingRequest.updateMany({
    where: { id: requestId, founderMet: null },
    data: { founderMet: met === "yes" },
  });
  if (updated.count === 0) {
    return { ok: false, error: "You've already answered for this meeting." };
  }

  await flagConflictIfAny(requestId);
  revalidatePath("/founder/meetings");
  revalidatePath("/advisor");
  return { ok: true, message: "Thanks, recorded." };
}

// Founder withdraws a request the advisor hasn't decided yet.
export async function withdrawRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;

  const requestId = String(formData.get("requestId") ?? "");
  const { current } = await getActingFounder();

  // Atomic: only a still-pending request of this founder can be withdrawn, so
  // it can't race with the advisor accepting.
  const updated = await prisma.meetingRequest.updateMany({
    where: { id: requestId, founderId: current.id, status: "PENDING" },
    data: { status: "WITHDRAWN", decidedAt: new Date() },
  });
  if (updated.count === 0) {
    return {
      ok: false,
      error: "This request was already decided, so it can't be withdrawn.",
    };
  }

  revalidatePath("/founder/meetings");
  revalidatePath("/founder");
  revalidatePath("/advisor");
  return { ok: true, message: "Request withdrawn." };
}

// Either side can cancel an accepted meeting until it happens. Hours come back
// to the advisor's availability and the founder's quota on their own: both are
// derived from requests that are still ACCEPTED (or PENDING, for the founder).
async function cancelMeeting(
  requestId: string,
  side: "advisor" | "founder",
  memberId: string,
  rawReason: string
): Promise<ActionState> {
  const checked = checkReason(rawReason, "cancelling");
  if ("error" in checked) return { ok: false, error: checked.error };

  // Atomic: only this member's own accepted meeting, with no outcome recorded
  // and no time that has already passed.
  const cancelled = await prisma.meetingRequest.updateMany({
    where: {
      id: requestId,
      ...(side === "advisor" ? { advisorId: memberId } : { founderId: memberId }),
      status: "ACCEPTED",
      advisorMet: null,
      founderMet: null,
      adminMet: null,
      OR: [{ scheduledAt: null }, { scheduledAt: { gt: new Date() } }],
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: side,
      cancelReason: checked.reason,
    },
  });

  if (cancelled.count === 0) {
    const request = await prisma.meetingRequest.findUnique({ where: { id: requestId } });
    const mine =
      request && (side === "advisor" ? request.advisorId : request.founderId) === memberId;
    if (!request || !mine) return { ok: false, error: "Meeting not found." };
    if (request.status === "CANCELLED") {
      return { ok: false, error: "This meeting was already cancelled." };
    }
    return {
      ok: false,
      error:
        "This meeting has already happened or its time has passed, so it can't be cancelled. Tell us how it went instead.",
    };
  }

  const meeting = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    include: { advisor: true, founder: true },
  });
  if (meeting) {
    const other = side === "advisor" ? meeting.founder : meeting.advisor;
    const actor = side === "advisor" ? meeting.advisor : meeting.founder;
    if (!other.deactivatedAt) {
      notify([
        {
          type: "MEETING_CANCELLED",
          recipientEmail: other.email,
          dedupeKey: `cancelled:${requestId}`,
          message: meetingCancelledMessage({
            cancelledByName: actor.name,
            cancelledBy: side,
            topic: meeting.topic,
            reason: checked.reason,
          }),
        },
      ]);
    }
  }

  revalidatePath("/advisor");
  revalidatePath("/founder");
  revalidatePath("/founder/meetings");
  return { ok: true, message: "Meeting cancelled." };
}

export async function cancelMeetingAsAdvisor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingAdvisor();
  return cancelMeeting(
    String(formData.get("requestId") ?? ""),
    "advisor",
    current.id,
    String(formData.get("reason") ?? "")
  );
}

export async function cancelMeetingAsFounder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const blocked = await previewBlock();
  if (blocked) return blocked;
  const { current } = await getActingFounder();
  return cancelMeeting(
    String(formData.get("requestId") ?? ""),
    "founder",
    current.id,
    String(formData.get("reason") ?? "")
  );
}
