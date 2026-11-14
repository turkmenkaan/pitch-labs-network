"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentAdmin, VIEW_AS_COOKIE } from "@/lib/session";
import {
  emailInRole,
  isValidEmail,
  normalizeMemberEmail,
  rolesHeldBy,
  writeAudit,
} from "@/lib/admin";
import { deliver } from "@/lib/notify";
import type { ActionState } from "../actions";

// Every action here starts with getCurrentAdmin(), which 404s non-admins.
// Identity always comes from the session, never from form fields.

type MemberType = "advisor" | "founder";
const isMemberType = (v: string): v is MemberType =>
  v === "advisor" || v === "founder";

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

// --- Members --------------------------------------------------------------
export async function createMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeMemberEmail(String(formData.get("email") ?? ""));
  const extra = String(formData.get("extra") ?? "").trim(); // title | company

  if (!isMemberType(type)) return { ok: false, error: "Pick advisor or founder." };
  if (!name) return { ok: false, error: "Name is required." };
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email." };
  if (await emailInRole(type, email)) {
    return { ok: false, error: `That email is already ${type === "advisor" ? "an advisor" : "a founder"}.` };
  }

  // The member completes the rest of their dossier on first login. Advisors
  // stay out of the founder directory until their intro is filled in.
  const created =
    type === "advisor"
      ? await prisma.advisor.create({
          data: { name, email, title: extra, expertise: "", bio: "" },
        })
      : await prisma.founder.create({
          data: { name, email, company: extra },
        });

  await writeAudit(admin, "member.create", type, created.id, `Added ${type} ${name} <${email}>`);
  revalidateAdmin();
  return { ok: true, message: `${name} added. They can sign in with Slack now.` };
}

export async function updateMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const type = String(formData.get("type") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeMemberEmail(String(formData.get("email") ?? ""));

  if (!isMemberType(type) || !id) return { ok: false, error: "Invalid member." };
  if (!name) return { ok: false, error: "Name is required." };
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email." };

  const before =
    type === "advisor"
      ? await prisma.advisor.findUnique({ where: { id } })
      : await prisma.founder.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "Member not found." };

  // A changed email moves with the person: every role held under the old email
  // follows, so one person never splits into two. Each role needs the new
  // email to be free.
  const emailChanged = before.email !== email;
  const held = emailChanged ? await rolesHeldBy(before.email) : [type];
  for (const role of held) {
    if (await emailInRole(role, email, role === type ? id : undefined)) {
      return {
        ok: false,
        error:
          role === type
            ? "That email already belongs to someone else."
            : `That email already has a ${role} role, so ${before.name}'s ${role} role can't move to it.`,
      };
    }
  }

  // Founders only: optional overrides of the booking guardrails (blank = default).
  let limits: { monthlyHoursLimit: number | null; advisorCallLimit: number | null } | null =
    null;
  if (type === "founder") {
    const parse = (v: FormDataEntryValue | null): number | null | "bad" => {
      const t = String(v ?? "").trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isInteger(n) && n >= 1 && n <= 40 ? n : "bad";
    };
    const hours = parse(formData.get("monthlyHoursLimit"));
    const calls = parse(formData.get("advisorCallLimit"));
    if (hours === "bad" || calls === "bad") {
      return { ok: false, error: "Limits must be whole numbers from 1 to 40, or blank." };
    }
    limits = { monthlyHoursLimit: hours, advisorCallLimit: calls };
  }

  const moved = held.filter((r) => r !== type);
  await prisma.$transaction([
    type === "advisor"
      ? prisma.advisor.update({ where: { id }, data: { name, email } })
      : prisma.founder.update({ where: { id }, data: { name, email, ...limits } }),
    ...(moved.includes("advisor")
      ? [prisma.advisor.update({ where: { email: before.email }, data: { email } })]
      : []),
    ...(moved.includes("founder")
      ? [prisma.founder.update({ where: { email: before.email }, data: { email } })]
      : []),
    ...(moved.includes("admin")
      ? [prisma.admin.update({ where: { email: before.email }, data: { email } })]
      : []),
  ]);

  const show = (n: number | null | undefined) => (n == null ? "default" : String(n));
  const prev = before as { monthlyHoursLimit?: number | null; advisorCallLimit?: number | null };
  const changes = [
    before.name !== name && `name "${before.name}" → "${name}"`,
    before.email !== email && `email ${before.email} → ${email}`,
    limits &&
      (prev.monthlyHoursLimit ?? null) !== limits.monthlyHoursLimit &&
      `monthly hours limit ${show(prev.monthlyHoursLimit)} → ${show(limits.monthlyHoursLimit)}`,
    limits &&
      (prev.advisorCallLimit ?? null) !== limits.advisorCallLimit &&
      `calls per advisor limit ${show(prev.advisorCallLimit)} → ${show(limits.advisorCallLimit)}`,
  ].filter(Boolean);
  if (changes.length) {
    await writeAudit(admin, "member.update", type, id, `Edited ${type}: ${changes.join(", ")}`);
  }
  revalidateAdmin();
  return { ok: true, message: "Saved." };
}

export async function setMemberActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const type = String(formData.get("type") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!isMemberType(type) || !id) return { ok: false, error: "Invalid member." };

  const deactivatedAt = active ? null : new Date();
  const row =
    type === "advisor"
      ? await prisma.advisor.update({ where: { id }, data: { deactivatedAt } })
      : await prisma.founder.update({ where: { id }, data: { deactivatedAt } });

  await writeAudit(
    admin,
    active ? "member.reactivate" : "member.deactivate",
    type,
    id,
    `${active ? "Reactivated" : "Deactivated"} ${type} ${row.name}`
  );
  revalidateAdmin();
  revalidatePath("/founder");
  return { ok: true };
}

// --- Admins ---------------------------------------------------------------
export async function addAdmin(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeMemberEmail(String(formData.get("email") ?? ""));
  if (!name) return { ok: false, error: "Name is required." };
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email." };
  if (await emailInRole("admin", email)) {
    return { ok: false, error: "That email is already an admin." };
  }

  const created = await prisma.admin.create({
    data: { name, email, createdById: admin.id },
  });
  await writeAudit(admin, "admin.add", "admin", created.id, `Added admin ${name} <${email}>`);
  revalidateAdmin();
  return { ok: true, message: `${name} is now an admin.` };
}

export async function removeAdmin(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const id = String(formData.get("id") ?? "");
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Admin not found." };

  if ((await prisma.admin.count()) <= 1) {
    return { ok: false, error: "You can't remove the last admin." };
  }

  await prisma.admin.delete({ where: { id } });
  await writeAudit(
    admin,
    "admin.remove",
    "admin",
    id,
    `Removed admin ${target.name} <${target.email}>`
  );
  revalidateAdmin();
  return { ok: true };
}

// --- Conflicts ------------------------------------------------------------
export async function resolveConflict(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const notificationId = String(formData.get("notificationId") ?? "");
  const ruling = String(formData.get("ruling") ?? ""); // "met" | "not_met"
  const note = String(formData.get("note") ?? "").trim();

  if (ruling !== "met" && ruling !== "not_met") {
    return { ok: false, error: "Choose whether the meeting happened." };
  }
  if (!note) return { ok: false, error: "Add a short note explaining the ruling." };

  const notification = await prisma.adminNotification.findUnique({
    where: { id: notificationId },
    include: { meetingRequest: true },
  });
  if (!notification || notification.type !== "MEETING_CONFLICT") {
    return { ok: false, error: "Conflict not found." };
  }
  if (notification.resolved) {
    return { ok: false, error: "This conflict was already resolved." };
  }

  const adminMet = ruling === "met";
  await prisma.$transaction([
    prisma.meetingRequest.update({
      where: { id: notification.meetingRequestId },
      data: { adminMet, outcomeRecordedAt: new Date() },
    }),
    prisma.adminNotification.update({
      where: { id: notificationId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedById: admin.id,
        resolutionNote: note,
      },
    }),
  ]);

  await writeAudit(
    admin,
    "conflict.resolve",
    "meeting",
    notification.meetingRequestId,
    `Ruled "${notification.meetingRequest.topic}" ${adminMet ? "did happen" : "did not happen"}: ${note}`
  );
  revalidateAdmin();
  revalidatePath("/advisor");
  return { ok: true, message: "Conflict resolved." };
}

// --- Notifications ----------------------------------------------------------
export async function retryNotification(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { current: admin } = await getCurrentAdmin();

  const id = String(formData.get("notificationId") ?? "");
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) return { ok: false, error: "Notification not found." };
  if (n.status !== "FAILED") {
    return { ok: false, error: "Only failed notifications can be retried." };
  }

  await deliver(id, true);
  const after = await prisma.notification.findUnique({ where: { id } });
  await writeAudit(
    admin,
    "notification.retry",
    "meeting",
    id,
    `Retried ${n.type} to ${n.recipientEmail}: ${after?.status ?? "unknown"}`
  );
  revalidatePath("/admin/notifications");
  return after?.status === "FAILED"
    ? { ok: false, error: `Still failing: ${after.lastError ?? "unknown error"}` }
    : { ok: true, message: "Retried." };
}

// --- View as (read-only preview) -------------------------------------------
export async function startViewingAs(formData: FormData): Promise<void> {
  const { current: admin } = await getCurrentAdmin();

  const type = String(formData.get("type") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!isMemberType(type) || !id) redirect("/admin/members");

  const member =
    type === "advisor"
      ? await prisma.advisor.findUnique({ where: { id } })
      : await prisma.founder.findUnique({ where: { id } });
  if (!member) redirect("/admin/members");

  (await cookies()).set(VIEW_AS_COOKIE, `${type}:${id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  await writeAudit(
    admin,
    "member.view_as",
    type,
    id,
    `Started a read-only preview as ${type} ${member.name}`
  );
  redirect(type === "advisor" ? "/" : "/founder");
}

export async function stopViewingAs(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin");
}
