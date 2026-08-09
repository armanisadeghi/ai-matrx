/**
 * The `matrx-user/marketing-brand` write targets stage sub-keys of ONE jsonb
 * column. The failure these tests exist to prevent is the destructive one: a
 * target that writes its own field and silently drops the rest of the client's
 * brand profile.
 */

import {
  buildCompetitorsPatch,
  buildContentGuidelinesPatch,
  buildOfferingsPatch,
  buildVoicePatch,
  mergeBrandProfile,
} from "@/features/marketing/lib/brand-write-targets";
import { brandProfileToJson } from "@/features/marketing/types";
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

describe("brand profile sub-key merge", () => {
  it("preserves every unmentioned field when one target applies", () => {
    const merged = mergeBrandProfile(
      EXISTING,
      buildVoicePatch({ voice_tone: "Direct and technical" }),
    );
    expect(merged.voice_tone).toBe("Direct and technical");
    // The whole rest of the profile survives — this is the point.
    expect(merged.audience).toBe(EXISTING.audience);
    expect(merged.positioning).toBe(EXISTING.positioning);
    expect(merged.offerings).toEqual(EXISTING.offerings);
    expect(merged.competitors).toEqual(EXISTING.competitors);
    expect(merged.content_guidelines).toBe(EXISTING.content_guidelines);
    expect(merged.value_props).toEqual(EXISTING.value_props);
    expect(merged.target_keywords).toEqual(EXISTING.target_keywords);
    expect(merged.service_area).toBe(EXISTING.service_area);
    expect(merged.notes).toBe(EXISTING.notes);
  });

  it("survives the round trip through the jsonb serializer", () => {
    const merged = mergeBrandProfile(
      EXISTING,
      buildOfferingsPatch({ offerings: ["Drain cleaning", "Repiping"] }),
    );
    expect(brandProfileToJson(merged)).toEqual({
      ...EXISTING,
      offerings: ["Drain cleaning", "Repiping"],
    });
  });

  it("applies a full-set list replacement rather than appending", () => {
    const merged = mergeBrandProfile(
      EXISTING,
      buildCompetitorsPatch({ competitors: ["Bravo Plumbing"] }),
    );
    expect(merged.competitors).toEqual(["Bravo Plumbing"]);
  });

  it("clears a list when handed an empty set", () => {
    const merged = mergeBrandProfile(
      EXISTING,
      buildOfferingsPatch({ offerings: [] }),
    );
    expect(merged.offerings).toEqual([]);
    // `brandProfileToJson` drops empty lists, so the field leaves the column.
    expect(brandProfileToJson(merged)).not.toHaveProperty("offerings");
  });
});

describe("brand profile target validation", () => {
  it("rejects non-object values", () => {
    expect(() => buildVoicePatch("just a string")).toThrow(
      /expects an object value/,
    );
    expect(() => buildOfferingsPatch(["a", "b"])).toThrow(
      /expects an object value/,
    );
    expect(() => buildVoicePatch(null)).toThrow(/expects an object value/);
  });

  it("rejects a voice write that names no field", () => {
    expect(() => buildVoicePatch({})).toThrow(/at least one of/);
    // Whitespace-only is empty, not a value.
    expect(() => buildVoicePatch({ audience: "   " })).toThrow(
      /at least one of/,
    );
  });

  it("rejects wrong scalar types instead of coercing them", () => {
    expect(() => buildVoicePatch({ audience: 42 })).toThrow(
      /must be a string when provided/,
    );
    expect(() =>
      buildContentGuidelinesPatch({ content_guidelines: { a: 1 } }),
    ).toThrow(/must be a string when provided/);
  });

  it("rejects a list field that is not an array of strings", () => {
    expect(() => buildOfferingsPatch({ offerings: "Drain cleaning" })).toThrow(
      /must be an array of strings/,
    );
    expect(() => buildCompetitorsPatch({})).toThrow(/must be an array/);
    expect(() => buildOfferingsPatch({ offerings: ["ok", 7] })).toThrow(
      /every offerings entry must be a string/,
    );
  });

  it("requires content guidelines to be non-empty", () => {
    expect(() =>
      buildContentGuidelinesPatch({ content_guidelines: "  " }),
    ).toThrow(/required and must be non-empty/);
  });

  it("trims values and drops blank list entries", () => {
    expect(buildVoicePatch({ positioning: "  Premium  " })).toEqual({
      positioning: "Premium",
    });
    expect(
      buildOfferingsPatch({ offerings: [" Repiping ", "", "   ", "Repairs"] }),
    ).toEqual({ offerings: ["Repiping", "Repairs"] });
  });
});
