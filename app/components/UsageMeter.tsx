import { callsLeftWith, type FounderUsage } from "@/lib/guardrails";

// Tells a founder where they stand against the monthly guardrails.
export function UsageMeter({
  usage,
  advisorId,
  advisorName,
}: {
  usage: FounderUsage;
  advisorId?: string;
  advisorName?: string;
}) {
  const { hoursUsed, limits } = usage;
  const pct = Math.min((hoursUsed / limits.monthlyHours) * 100, 100);
  const callsLeft = advisorId ? callsLeftWith(usage, advisorId) : null;

  return (
    <div className="usage" role="group" aria-label="Your monthly advisor time">
      <div className="usage-row">
        <span>
          <b>
            {hoursUsed} of {limits.monthlyHours} hours
          </b>{" "}
          booked this month
        </span>
        {callsLeft !== null && (
          <span>
            {callsLeft} of {limits.callsPerAdvisor} calls left with{" "}
            {advisorName ?? "this advisor"}
          </span>
        )}
      </div>
      <div className="usage-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="usage-note">
        Pending and accepted requests count. Declined, withdrawn and missed
        meetings give the time back.
      </p>
    </div>
  );
}
