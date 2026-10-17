import { prisma } from "./db";
import type { Admin } from "@prisma/client";

export function normalizeMemberEmail(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// An email may belong to only one of Admin / Advisor / Founder, otherwise
// role resolution at login gets ambiguous. `except` lets an edit keep its own.
export async function emailInUse(
  email: string,
  except?: { type: "admin" | "advisor" | "founder"; id: string }
): Promise<boolean> {
  const [admin, advisor, founder] = await Promise.all([
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    prisma.advisor.findUnique({ where: { email }, select: { id: true } }),
    prisma.founder.findUnique({ where: { email }, select: { id: true } }),
  ]);
  const hit = (type: string, row: { id: string } | null) =>
    row != null && !(except?.type === type && except.id === row.id);
  return hit("admin", admin) || hit("advisor", advisor) || hit("founder", founder);
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
