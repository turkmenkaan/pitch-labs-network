import { prisma } from "./db";
import type { Admin } from "@prisma/client";

export function normalizeMemberEmail(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type MemberRole = "admin" | "advisor" | "founder";

// One email may hold several roles (say an advisor who is also a founder), but
// only one row per role. `exceptId` lets an edit keep its own email.
export async function emailInRole(
  role: MemberRole,
  email: string,
  exceptId?: string
): Promise<boolean> {
  const where = { email };
  const select = { id: true };
  const row =
    role === "admin"
      ? await prisma.admin.findUnique({ where, select })
      : role === "advisor"
        ? await prisma.advisor.findUnique({ where, select })
        : await prisma.founder.findUnique({ where, select });
  return row != null && row.id !== exceptId;
}

// Every role row (deactivated or not) that holds this email.
export async function rolesHeldBy(email: string): Promise<MemberRole[]> {
  const [admin, advisor, founder] = await Promise.all([
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    prisma.advisor.findUnique({ where: { email }, select: { id: true } }),
    prisma.founder.findUnique({ where: { email }, select: { id: true } }),
  ]);
  const held: MemberRole[] = [];
  if (admin) held.push("admin");
  if (advisor) held.push("advisor");
  if (founder) held.push("founder");
  return held;
}

export async function writeAudit(
  admin: Pick<Admin, "id" | "name">,
  action: string,
  targetType: "advisor" | "founder" | "admin" | "meeting",
  targetId: string,
  detail: string
) {
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      adminName: admin.name,
      action,
      targetType,
      targetId,
      detail,
    },
  });
}
