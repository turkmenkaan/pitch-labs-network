import { describe, expect, it } from "vitest";
import { checkReason, MAX_REASON_LENGTH } from "./reason";

describe("checkReason", () => {
  it("returns the trimmed reason", () => {
    expect(checkReason("  Not a fit.  ", "declining")).toEqual({ reason: "Not a fit." });
  });
  it("refuses an empty or blank reason", () => {
    expect(checkReason("", "declining")).toEqual({ error: "Add a reason for declining." });
    expect(checkReason("   ", "cancelling")).toEqual({ error: "Add a reason for cancelling." });
  });
  it("refuses a very long one", () => {
    expect(checkReason("x".repeat(MAX_REASON_LENGTH + 1), "cancelling")).toHaveProperty("error");
    expect(checkReason("x".repeat(MAX_REASON_LENGTH), "cancelling")).toHaveProperty("reason");
  });
});
