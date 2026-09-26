import {
  MANDATE_STATUS_META,
  countMandateStatuses,
  mandateStatusLabel,
  mandateStatusOf,
  mandateStatusOfRow,
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

describe("mandateStatusOfRow — the definition row + its live bindings", () => {
  it("no default holder, no fallback, no live binding is a draft", () => {
    expect(mandateStatusOfRow({ is_enabled: true }, [{ deleted_at: "x" }])).toBe("draft");
  });
  it("a live binding, a fallback, or a default holder each make it active", () => {
    expect(mandateStatusOfRow({ is_enabled: true }, [{ deleted_at: null }])).toBe("active");
    expect(mandateStatusOfRow({ is_enabled: true, fallback_mandate_key: "a.b" })).toBe("active");
    expect(mandateStatusOfRow({ is_enabled: true, default_holder_version_id: "v" })).toBe("active");
  });
  it("a removed row is archived", () => {
    expect(mandateStatusOfRow({ is_enabled: true, deleted_at: "2026-09-25" })).toBe("archived");
  });
});
