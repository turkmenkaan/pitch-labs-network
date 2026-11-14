import { describe, expect, it } from "vitest";
import { checkSlots, openProposal } from "./slots";

const now = new Date("2026-11-14T15:00:00Z"); // 10:00 ET

describe("checkSlots", () => {
  it("needs at least one time, and ignores blanks", () => {
    expect(checkSlots(["", "  "], now)).toEqual({ error: "Propose at least one time." });
    const ok = checkSlots(["", "2026-11-16T14:00"], now);
    expect("slots" in ok && ok.slots).toHaveLength(1);
  });

  it("allows at most three", () => {
    const r = checkSlots(
      ["2026-11-16T14:00", "2026-11-17T14:00", "2026-11-18T14:00", "2026-11-19T14:00"],
      now
    );
    expect(r).toEqual({ error: "Propose at most 3 times." });
  });

  it("reads times as Eastern and sorts them", () => {
    const r = checkSlots(["2026-11-17T14:00", "2026-11-16T14:00"], now);
    expect("slots" in r && r.slots.map((d) => d.toISOString())).toEqual([
      "2026-11-16T19:00:00.000Z",
      "2026-11-17T19:00:00.000Z",
    ]);
  });

  it("rejects the past, invalid dates and duplicates", () => {
    expect(checkSlots(["2026-11-14T09:00"], now)).toEqual({ error: "Pick times in the future." });
    expect(checkSlots(["2026-02-31T09:00"], now)).toEqual({
      error: "One of those date/times isn't valid.",
    });
    expect(checkSlots(["2026-11-16T14:00", "2026-11-16T14:00"], now)).toEqual({
      error: "Each proposed time must be different.",
    });
  });
});

describe("openProposal", () => {
  const slot = (id: string, startsAt: string, status = "OPEN", by = "advisor") => ({
    id,
    startsAt: new Date(startsAt),
    proposedBy: by,
    status,
  });

  it("is null with nothing open", () => {
    expect(openProposal([], now)).toBeNull();
    expect(openProposal([slot("a", "2026-11-16T19:00:00Z", "SUPERSEDED")], now)).toBeNull();
  });

  it("drops slots that have already passed", () => {
    expect(openProposal([slot("a", "2026-11-14T14:00:00Z")], now)).toBeNull();
  });

  it("reports who proposed and orders the slots", () => {
    const p = openProposal(
      [slot("b", "2026-11-17T19:00:00Z", "OPEN", "founder"), slot("a", "2026-11-16T19:00:00Z", "OPEN", "founder")],
      now
    );
    expect(p?.by).toBe("founder");
    expect(p?.slots.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
