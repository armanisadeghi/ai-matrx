/**
 * The press expertise profile lives in `web.brand.profile` beside the editorial
 * fields. Every save rewrites the whole jsonb from `parseBrandProfile`'s output,
 * so a field the parser does not know is ERASED on the next save — these keys
 * must survive the round trip or the source-request responder loses them.
 */

import { brandProfileToJson, mergeBrandProfile, parseBrandProfile } from "@/features/marketing/types";

describe("brand press expertise profile", () => {
  const stored = {
    audience: "IT managers",
    spokesperson_name: "Jane Doe",
    spokesperson_title: "Founder",
    expertise_areas: ["E-waste law", "Data destruction"],
    credentials: ["R2v3 certified since 2019"],
    do_not_comment_on: ["Politics"],
    outlets_to_skip: ["tabloid.example"],
    contact_block: "Jane Doe, Founder\njane@example.com",
  };

  it("survives parse and serialize unchanged", () => {
    expect(brandProfileToJson(parseBrandProfile(stored))).toEqual(stored);
  });

  it("drops empty entries instead of storing blanks", () => {
    const parsed = parseBrandProfile({ expertise_areas: ["  ", "Recycling"], contact_block: "  " });
    expect(parsed).toEqual({ expertise_areas: ["Recycling"] });
  });
});

describe("an editor save merges into the stored profile", () => {
  it("keeps every key the editor does not own (brand_aliases)", () => {
    const stored = { audience: "IT managers", brand_aliases: ["AI Matrx", "aimatrx"], agent_note: { a: 1 } };
    const edited = { ...parseBrandProfile(stored), voice_tone: "Plain" };
    expect(mergeBrandProfile(stored, edited)).toEqual({
      audience: "IT managers",
      voice_tone: "Plain",
      brand_aliases: ["AI Matrx", "aimatrx"],
      agent_note: { a: 1 },
    });
  });

  it("removes an owned field the person cleared", () => {
    const stored = { audience: "IT managers", brand_aliases: ["X"] };
    expect(mergeBrandProfile(stored, {})).toEqual({ brand_aliases: ["X"] });
  });
});
