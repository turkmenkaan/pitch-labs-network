import type { Prisma } from "@prisma/client";

// Booking guardrails for founders. A founder's usage is derived from their
// requests for the month, never stored. Admins can override a founder's limits
// (Founder.monthlyHoursLimit / advisorCallLimit); null means the default.

export const DEFAULT_MONTHLY_HOURS = 4;
export const DEFAULT_CALLS_PER_ADVISOR = 2;

export type FounderLimits = { monthlyHours: number; callsPerAdvisor: number };

export function limitsFor(founder: {
  monthlyHoursLimit: number | null;
  advisorCallLimit: number | null;
}): FounderLimits {
  return {
    monthlyHours: founder.monthlyHoursLimit ?? DEFAULT_MONTHLY_HOURS,
    callsPerAdvisor: founder.advisorCallLimit ?? DEFAULT_CALLS_PER_ADVISOR,
  };
}

type UsageRequest = {
  advisorId: string;
  estimatedHours: number;
  status: string;
  advisorMet: boolean | null;
  adminMet: boolean | null;
};

// Pending and accepted requests count. A meeting that turned out not to happen
// (the admin's ruling, else the advisor's answer) gives its hours back.
export function countsTowardLimits(r: UsageRequest): boolean {
  if (r.status !== "PENDING" && r.status !== "ACCEPTED") return false;
  return (r.adminMet ?? r.advisorMet) !== false;
}

export type FounderUsage = {
  limits: FounderLimits;
  hoursUsed: number;
  hoursLeft: number;
  callsByAdvisor: Record<string, number>;
};

export function summarizeUsage(
  requests: UsageRequest[],
  limits: FounderLimits
): FounderUsage {
  let hoursUsed = 0;
  const callsByAdvisor: Record<string, number> = {};
  for (const r of requests) {
    if (!countsTowardLimits(r)) continue;
    hoursUsed += r.estimatedHours;
    callsByAdvisor[r.advisorId] = (callsByAdvisor[r.advisorId] ?? 0) + 1;
  }
  return {
    limits,
    hoursUsed,
    hoursLeft: Math.max(limits.monthlyHours - hoursUsed, 0),
    callsByAdvisor,
  };
}

export function callsLeftWith(usage: FounderUsage, advisorId: string): number {
  return Math.max(
    usage.limits.callsPerAdvisor - (usage.callsByAdvisor[advisorId] ?? 0),
    0
  );
}

// Returns the message to show if a new request would break a limit, else null.
export function checkNewRequest(
  usage: FounderUsage,
  advisorId: string,
  hours: number
): string | null {
  const { monthlyHours, callsPerAdvisor } = usage.limits;
  if (callsLeftWith(usage, advisorId) === 0) {
    return `You can have at most ${callsPerAdvisor} call${
      callsPerAdvisor === 1 ? "" : "s"
    } with the same advisor in a month.`;
  }
  if (usage.hoursLeft === 0) {
    return `You've used all ${monthlyHours} of your advisor hours for this month.`;
  }
  if (hours > usage.hoursLeft) {
    return `You have ${usage.hoursLeft} hour${
      usage.hoursLeft === 1 ? "" : "s"
    } left this month (limit ${monthlyHours}). Ask for fewer hours.`;
  }
  return null;
}

type RequestReader = Pick<Prisma.TransactionClient, "meetingRequest">;

export async function getFounderUsage(
  db: RequestReader,
  founder: {
    id: string;
    monthlyHoursLimit: number | null;
    advisorCallLimit: number | null;
  },
  month: string
): Promise<FounderUsage> {
  const requests = await db.meetingRequest.findMany({
    where: {
      founderId: founder.id,
      month,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    select: {
      advisorId: true,
      estimatedHours: true,
      status: true,
      advisorMet: true,
      adminMet: true,
    },
  });
  return summarizeUsage(requests, limitsFor(founder));
}
