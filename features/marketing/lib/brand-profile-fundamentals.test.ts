/**
 * Brand fundamentals (mission, pillars, claims, hashtags...) live in web.brand.profile.
 * They must survive parse -> serialize -> merge, be normalized, and never be erased
 * by an editor that does not own them.
 */

import { brandProfileToJson, mergeBrandProfile, parseBrandProfile } from "@/features/marketing/types";
import { buildBrandContextXml } from "@/features/marketing/lib/surface-context";
import type { MarketingBrand } from "@/features/marketing/types";

const stored = {
  mission: "Make data destruction provable.",
  vision: "No drive leaves a building unaccounted for.",
  story: "Founded after a client found their drives on a resale site.",
  values: ["Proof over promises", "Plain language"],
  messaging_pillars: [
    { title: "Certified destruction", proof_points: ["NAID AAA certified", "Serial-number audit trail"] },
  ],
  elevator_pitches: { ten_second: "We destroy drives and prove it.", sixty_second: "Long form." },
  content_pillars: [{ name: "Compliance explained", description: "HIPAA and R2 in plain terms" }, { name: "Behind the shredder" }],
  hashtags: [{ tag: "ShredItRight", use: "branded" }, { tag: "ewasteweek", use: "campaign" }],
  approved_claims: ["NAID AAA certified"],
  forbidden_claims: ["100% data-breach proof"],
  disclaimers: ["Certificates issued per job."],
  brand_aliases: ["Acme Shred"],
};

describe("brand fundamentals in the profile", () => {
  it("round-trips every new field unchanged", () => {
    const { brand_aliases: _aliases, ...owned } = stored;
    expect(brandProfileToJson(parseBrandProfile(stored))).toEqual(owned);
  });

  it("normalizes hashtags, drops blanks, defaults an unknown use to branded", () => {
    const parsed = parseBrandProfile({
      hashtags: [{ tag: " #Hello World ", use: "weird" }, { tag: "  " }, "nope"],
      messaging_pillars: [{ title: " ", proof_points: ["x"] }, { title: "Real", proof_points: [" a ", ""] }],
      elevator_pitches: { ten_second: "  ", thirty_second: "Thirty" },
      content_pillars: [{ name: "" }, { name: "Tips", description: "  " }],
    });
    expect(parsed).toEqual({
      hashtags: [{ tag: "HelloWorld", use: "branded" }],
      messaging_pillars: [{ title: "Real", proof_points: ["a"] }],
      elevator_pitches: { thirty_second: "Thirty" },
      content_pillars: [{ name: "Tips" }],
    });
  });

  it("an editor that edits one field keeps all the others and unknown keys", () => {
    const next = mergeBrandProfile(stored, { ...parseBrandProfile(stored), mission: "New mission" });
    expect(next).toMatchObject({ mission: "New mission", brand_aliases: ["Acme Shred"], hashtags: stored.hashtags });
  });

  it("clearing a structured field removes it", () => {
    const next = mergeBrandProfile(stored, { ...parseBrandProfile(stored), hashtags: [], elevator_pitches: {} });
    expect(next).not.toHaveProperty("hashtags");
    expect(next).not.toHaveProperty("elevator_pitches");
  });

  it("reaches agents: the brand context XML carries the new fields and personas", () => {
    const xml = buildBrandContextXml({
      brand: { name: "Data Destruction Inc", description: null, industry: null, website_url: null, profile: stored } as unknown as MarketingBrand,
      personas: [
        {
          id: "p", organization_id: "o", brand_id: "b", name: "IT director", summary: "Owns compliance",
          demographics: { job_titles: "IT director" }, goals: ["Pass audit"], pain_points: [], objections: ["Cost"],
          channels: ["LinkedIn"], is_primary: true, sort: 0, version: 1,
        },
      ],
    });
    for (const needle of ["<mission>", "<forbidden_claims>", "100% data-breach proof", "Certified destruction", "#ShredItRight", "ten_second", 'persona name="IT director"', "<objections>"]) {
      expect(xml).toContain(needle);
    }
  });
});
