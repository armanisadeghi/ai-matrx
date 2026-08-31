import { isValidDateOnly, parseDateOnly, toDateOnly } from "@/utils/dateOnly";

describe("date-only helpers", () => {
  it("accepts real calendar dates and rejects rollover dates", () => {
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-04-31")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("2026-1-01")).toBe(false);
  });

  it("round-trips a valid local calendar day without a timezone shift", () => {
    const parsed = parseDateOnly("2026-08-30");
    if (!parsed) throw new Error("Expected a valid local calendar date.");
    expect(toDateOnly(parsed)).toBe("2026-08-30");
  });
});
