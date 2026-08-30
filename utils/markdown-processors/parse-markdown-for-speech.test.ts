import {
  COMMON_ABBREVIATION_EXPANSIONS,
  normalizeSpeechAbbreviations,
  parseMarkdownToText,
} from "./parse-markdown-for-speech";

describe("speech abbreviation normalization", () => {
  it("reads initialisms as letters instead of their long-form meanings", () => {
    expect(parseMarkdownToText("AI calls an API over HTTPS with an SDK.")).toBe(
      "A I calls an A P I over H T T P S with an S D K.",
    );
  });

  it("keeps conventional word acronyms for natural model pronunciation", () => {
    expect(
      parseMarkdownToText("JSON, OAuth, REST, CRUD, SaaS, LAN, and WAN."),
    ).toBe("JSON, OAuth, REST, CRUD, SaaS, LAN, and WAN.");
  });

  it("does not reinterpret lowercase words that collide with acronyms", () => {
    expect(normalizeSpeechAbbreviations("rest at the spa beside dom and wan")).toBe(
      "rest at the spa beside dom and wan",
    );
  });

  it("still exposes the complete long-form reference list without speaking it", () => {
    expect(COMMON_ABBREVIATION_EXPANSIONS.AI).toBe("Artificial Intelligence");
    expect(COMMON_ABBREVIATION_EXPANSIONS.API).toBe(
      "Application Programming Interface",
    );
    expect(parseMarkdownToText("AI API")).not.toContain(
      COMMON_ABBREVIATION_EXPANSIONS.API,
    );
  });
});
