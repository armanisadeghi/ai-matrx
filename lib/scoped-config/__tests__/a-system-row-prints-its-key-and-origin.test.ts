/**
 * An operator on /administration/users/limits scans ~880 rows for one key and
 * has to know whether a value is still what shipped. Both facts used to live
 * only inside a per-row "…" popover, which is not something you can scan
 * (independent review, 2026-09-22). These prove the sentence itself, which the
 * row line and the popover now BOTH read, so they cannot drift apart.
 */
import { systemOriginSentence } from "../ladder";
import type { ScopedKnob } from "../types";

const knob = (platformDefault: unknown) =>
  ({ platform_default: platformDefault } as ScopedKnob);

describe("systemOriginSentence", () => {
  it("says System default when the value is exactly what the register shipped", () => {
    expect(systemOriginSentence(knob(5), 5)).toBe("System default");
  });

  it("says the platform was changed when it no longer matches", () => {
    expect(systemOriginSentence(knob(9), 5)).toBe("Set for the platform");
  });

  it("compares by value, not identity, so an equal object is still the default", () => {
    expect(systemOriginSentence(knob({ a: [1] }), { a: [1] })).toBe("System default");
    expect(systemOriginSentence(knob({ a: [1] }), { a: [2] })).toBe("Set for the platform");
  });

  it("names organization dissent as a count, singular and plural", () => {
    expect(systemOriginSentence(knob(5), 5, 1)).toBe(
      "System default · overridden by 1 organization",
    );
    expect(systemOriginSentence(knob(9), 5, 2)).toBe(
      "Set for the platform · overridden by 2 organizations",
    );
  });

  it("stays silent about overrides when the count is NOT KNOWN, never claiming zero", () => {
    expect(systemOriginSentence(knob(5), 5, undefined)).toBe("System default");
    expect(systemOriginSentence(knob(5), 5, null)).toBe("System default");
    expect(systemOriginSentence(knob(5), 5, 0)).toBe("System default");
  });
});
