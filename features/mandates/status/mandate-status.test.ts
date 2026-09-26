import {
  MANDATE_STATUS_META,
  countMandateStatuses,
  mandateStatusLabel,
  mandateStatusOf,
} from "./mandate-status";

describe("mandateStatusOf — the one status rule", () => {
  it("archived wins over everything", () => {
    expect(
      mandateStatusOf({ deletedAt: "2026-09-25T00:00:00Z", isEnabled: true, hasHolder: true }),
    ).toBe("archived");
  });
  it("disabled beats draft: a turned-off job is disabled even with no holder", () => {
    expect(mandateStatusOf({ isEnabled: false, hasHolder: false })).toBe("disabled");
  });
  it("on with nothing filling it is a draft, never 'active'", () => {
    expect(mandateStatusOf({ isEnabled: true, hasHolder: false })).toBe("draft");
  });
  it("on and filled is active", () => {
    expect(mandateStatusOf({ isEnabled: true, hasHolder: true, deletedAt: null })).toBe("active");
  });
  it("every status has a word, a tone and a sentence", () => {
    for (const meta of Object.values(MANDATE_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.meaning.length).toBeGreaterThan(10);
    }
    expect(MANDATE_STATUS_META.draft.tone).not.toBe(MANDATE_STATUS_META.active.tone);
  });
  it("facet labels read the database's keys", () => {
    expect(mandateStatusLabel("draft")).toBe("Draft");
    expect(mandateStatusLabel("something-else")).toBe("something-else");
  });
  it("counts every status, zero when absent", () => {
    const counts = countMandateStatuses(["draft", "active", "active"] as const, (s) => s);
    expect(counts).toEqual({ draft: 1, active: 2, disabled: 0, archived: 0 });
  });
});
