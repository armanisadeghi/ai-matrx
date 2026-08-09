/**
 * The `matrx-user/marketing-brand` write targets patch ONE jsonb column. The
 * failure these tests exist to prevent is the destructive one: a write that
 * lands its own fields and silently drops the rest of the client's brand
 * profile.
 */

import {
  mergeBrandProfileWrite,
  validateBrandIdentityWrite,
} from "@/features/marketing/lib/brand-write-targets";
import type { BrandProfile } from "@/features/marketing/types";

const EXISTING: BrandProfile = {
  audience: "Homeowners in the East Bay",
  voice_tone: "Warm, plain-spoken",
  positioning: "The reliable local option",
  value_props: ["Same-day service"],
  offerings: ["Drain cleaning", "Water heater install"],
  service_area: "Alameda County",
  competitors: ["Acme Plumbing"],
  target_keywords: ["emergency plumber oakland"],
  content_guidelines: "Never promise arrival times.",
  notes: "Owner prefers 'technician', not 'guy'.",
};

describe("mergeBrandProfileWrite", () => {
  it("preserves every unmentioned field when one field is written", () => {
    const merged = mergeBrandProfileWrite(EXISTING, {
      voice_tone: "Direct and technical",
    });
    expect(merged.voice_tone).toBe("Direct and technical");
    // The whole rest of the profile survives — this is the point.
    expect(merged).toEqual({ ...EXISTING, voice_tone: "Direct and technical" });
  });

  it("replaces a list field wholesale", () => {
    const merged = mergeBrandProfileWrite(EXISTING, {
      offerings: ["Sewer inspection"],
    });
    expect(merged.offerings).toEqual(["Sewer inspection"]);
    expect(merged.competitors).toEqual(EXISTING.competitors);
  });

  it("clears a string field on empty string and a list on empty array", () => {
    const merged = mergeBrandProfileWrite(EXISTING, {
      notes: "",
      competitors: [],
    });
    expect(merged.notes).toBeUndefined();
    expect(merged.competitors).toBeUndefined();
    expect(merged.audience).toBe(EXISTING.audience);
  });

  it("trims values and drops empty list entries", () => {
    const merged = mergeBrandProfileWrite(EXISTING, {
      audience: "  Facility managers  ",
      value_props: ["  Certified destruction ", "", "  "],
    });
    expect(merged.audience).toBe("Facility managers");
    expect(merged.value_props).toEqual(["Certified destruction"]);
  });

  it("throws on unknown keys instead of coercing", () => {
    expect(() => mergeBrandProfileWrite(EXISTING, { voice: "x" })).toThrow(
      /unknown field/,
    );
  });

  it("throws on wrong shapes and non-objects", () => {
    expect(() => mergeBrandProfileWrite(EXISTING, { offerings: "one" })).toThrow(
      /string array/,
    );
    expect(() =>
      mergeBrandProfileWrite(EXISTING, { audience: 42 }),
    ).toThrow(/must be a string/);
    expect(() => mergeBrandProfileWrite(EXISTING, [])).toThrow(/object value/);
    expect(() => mergeBrandProfileWrite(EXISTING, {})).toThrow(
      /at least one/,
    );
  });
});

describe("validateBrandIdentityWrite", () => {
  it("passes through provided fields, trimmed", () => {
    expect(
      validateBrandIdentityWrite({ industry: " Recycling ", description: "d" }),
    ).toEqual({ industry: "Recycling", description: "d" });
  });

  it("maps empty string to null (clear) and keeps omitted fields out", () => {
    expect(validateBrandIdentityWrite({ industry: "" })).toEqual({
      industry: null,
    });
  });

  it("refuses the human-owned brand name and empty patches", () => {
    expect(() => validateBrandIdentityWrite({ name: "New Co" })).toThrow(
      /human-owned/,
    );
    expect(() => validateBrandIdentityWrite({})).toThrow(
      /industry and\/or description/,
    );
    expect(() => validateBrandIdentityWrite({ industry: 3 })).toThrow(
      /must be a string/,
    );
  });
});
