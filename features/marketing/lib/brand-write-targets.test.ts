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
import { brandProfileToJson } from "@/features/marketing/types";
import type { BrandProfile } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

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
const EXISTING_JSON = brandProfileToJson(EXISTING) as Record<string, Json>;

describe("mergeBrandProfileWrite brand fundamentals", () => {
  it("writes the new string, list and structured keys and keeps the rest", () => {
    const merged = mergeBrandProfileWrite(EXISTING_JSON, {
      mission: "Keep pipes flowing",
      values: ["Honesty"],
      approved_claims: ["Licensed"],
      messaging_pillars: [{ title: "Trust", proof_points: ["20 years"] }],
      elevator_pitches: { ten_second: "We fix pipes." },
      content_pillars: [{ name: "How-to" }],
      hashtags: [{ tag: "#pipes", use: "branded" }],
    });
    expect(merged.mission).toBe("Keep pipes flowing");
    expect(merged.values).toEqual(["Honesty"]);
    expect(merged.messaging_pillars).toEqual([{ title: "Trust", proof_points: ["20 years"] }]);
    expect(merged.hashtags).toEqual([{ tag: "pipes", use: "branded" }]);
    expect(merged.audience).toBe(EXISTING.audience);
  });

  it("clears a structured field with an empty value and rejects malformed shapes", () => {
    const withPillars = mergeBrandProfileWrite(EXISTING_JSON, {
      content_pillars: [{ name: "How-to" }],
    });
    expect(mergeBrandProfileWrite(withPillars, { content_pillars: [] }).content_pillars).toBeUndefined();
    expect(() => mergeBrandProfileWrite(EXISTING_JSON, { hashtags: ["x"] })).toThrow(/shape/);
    expect(() => mergeBrandProfileWrite(EXISTING_JSON, { messaging_pillars: "x" })).toThrow(/shape/);
  });
});

describe("mergeBrandProfileWrite", () => {
  it("preserves every unmentioned field when one field is written", () => {
    const merged = mergeBrandProfileWrite(EXISTING_JSON, {
      voice_tone: "Direct and technical",
    });
    expect(merged.voice_tone).toBe("Direct and technical");
    // The whole rest of the profile survives — this is the point.
    expect(merged).toEqual({ ...EXISTING, voice_tone: "Direct and technical" });
  });

  it("replaces a list field wholesale", () => {
    const merged = mergeBrandProfileWrite(EXISTING_JSON, {
      offerings: ["Sewer inspection"],
    });
    expect(merged.offerings).toEqual(["Sewer inspection"]);
    expect(merged.competitors).toEqual(EXISTING.competitors);
  });

  it("clears a string field on empty string and a list on empty array", () => {
    const merged = mergeBrandProfileWrite(EXISTING_JSON, {
      notes: "",
      competitors: [],
    });
    expect(merged.notes).toBeUndefined();
    expect(merged.competitors).toBeUndefined();
    expect(merged.audience).toBe(EXISTING.audience);
  });

  it("trims values and drops empty list entries", () => {
    const merged = mergeBrandProfileWrite(EXISTING_JSON, {
      audience: "  Facility managers  ",
      value_props: ["  Certified destruction ", "", "  "],
    });
    expect(merged.audience).toBe("Facility managers");
    expect(merged.value_props).toEqual(["Certified destruction"]);
  });

  it("throws on unknown keys instead of coercing", () => {
    expect(() => mergeBrandProfileWrite(EXISTING_JSON, { voice: "x" })).toThrow(
      /unknown field/,
    );
  });

  it("throws on wrong shapes and non-objects", () => {
    expect(() =>
      mergeBrandProfileWrite(EXISTING_JSON, { offerings: "one" }),
    ).toThrow(/string array/);
    expect(() =>
      mergeBrandProfileWrite(EXISTING_JSON, { audience: 42 }),
    ).toThrow(/must be a string/);
    expect(() => mergeBrandProfileWrite(EXISTING_JSON, [])).toThrow(
      /object value/,
    );
    expect(() => mergeBrandProfileWrite(EXISTING_JSON, {})).toThrow(
      /at least one/,
    );
  });

  it("preserves stored sibling keys outside the writable editorial contract", () => {
    const current = {
      ...EXISTING_JSON,
      brand_aliases: ["Data Destruction Inc."],
      imported_profile_version: 2,
    };

    expect(
      mergeBrandProfileWrite(current, { positioning: "Audit-ready disposal" }),
    ).toEqual({
      ...current,
      positioning: "Audit-ready disposal",
    });
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
