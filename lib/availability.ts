import { prisma } from "./db";
import { currentMonth } from "./types";

export type AvailabilitySummary = {
  month: string;
  totalHours: number; // hours the advisor committed for the month
  committedHours: number; // hours already locked in by accepted meetings
  remainingHours: number; // totalHours - committedHours (floored at 0)
  hasSetAvailability: boolean;
};

// Availability "auto-decreases": remaining is always derived from the sum of
// accepted meeting hours in the month, never stored, so it can't drift.
export async function getAvailability(
  advisorId: string,
  month = currentMonth()
): Promise<AvailabilitySummary> {
  const [record, accepted] = await Promise.all([
    prisma.monthlyAvailability.findUnique({
      where: { advisorId_month: { advisorId, month } },
    }),
    prisma.meetingRequest.findMany({
      where: { advisorId, month, status: "ACCEPTED" },
      select: { estimatedHours: true },
    }),
  ]);

  const totalHours = record?.totalHours ?? 0;
  const committedHours = accepted.reduce((sum, r) => sum + r.estimatedHours, 0);

  return {
    month,
    totalHours,
    committedHours,
    remainingHours: Math.max(totalHours - committedHours, 0),
    hasSetAvailability: record != null,
  };
}
