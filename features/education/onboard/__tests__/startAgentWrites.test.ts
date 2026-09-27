import { parseKitRequestDraftValue } from "../startAgentWrites";

const AVAILABLE = ["deck", "summary", "quiz", "mind_map", "audio", "notes"] as const;
const parse = (v: unknown) => parseKitRequestDraftValue(v, [...AVAILABLE]);

describe("kit_request_draft value", () => {
  it("fills every field and infers the tab from the input", () => {
    expect(
      parse({
        paste_text: "Photosynthesis",
        outputs: ["deck", "quiz"],
        depth: "quick",
        count: 20,
        focus: "chapter 3",
      }),
    ).toEqual({
      mode: "paste",
      pasteText: "Photosynthesis",
      outputs: ["deck", "quiz"],
      depth: "quick",
      count: 20,
      focus: "chapter 3",
    });
    expect(parse({ url: "https://example.com/a" }).mode).toBe("link");
    expect(
      parse({ file_id: "0f8fad5b-d9cb-469f-a165-70867728950e" }).mode,
    ).toBe("files");
    expect(parse({ count: null }).count).toBeNull();
    expect(parse({ count: "12" }).count).toBe(12);
  });

  it("keeps an explicit input_mode when several inputs are sent", () => {
    expect(
      parse({ input_mode: "link", paste_text: "x", url: "https://a.com" }).mode,
    ).toBe("link");
  });

  it("refuses what the form cannot take", () => {
    expect(() => parse("text")).toThrow(/JSON object/);
    expect(() => parse([])).toThrow(/JSON object/);
    expect(() => parse({})).toThrow(/at least one/);
    expect(() => parse({ input_mode: "upload" })).toThrow(/Only the person/);
    expect(() => parse({ url: "not a url" })).toThrow(/not a web address/);
    expect(() => parse({ url: "ftp://a.com" })).toThrow(/http/);
    expect(() => parse({ file_id: "abc" })).toThrow(/not a file id/);
    expect(() => parse({ outputs: [] })).toThrow(/at least one/);
    expect(() => parse({ outputs: ["poster"] })).toThrow(/Unknown output/);
    expect(() => parse({ outputs: ["practice_test"] })).toThrow(/cannot be made yet/);
    expect(() => parse({ outputs: ["deck", "deck"] })).toThrow(/twice/);
    expect(() => parse({ depth: "deep" })).toThrow(/depth/);
    expect(() => parse({ count: 0 })).toThrow(/1 to 150/);
    expect(() => parse({ count: 151 })).toThrow(/1 to 150/);
    expect(() => parse({ count: 2.5 })).toThrow(/1 to 150/);
    expect(() => parse({ title: "x" })).toThrow(/Unknown field title/);
    expect(() =>
      parse({ paste_text: "x", url: "https://a.com" }),
    ).toThrow(/only one/);
  });
});

describe("kit_request_draft: every problem at once (owner ruling 2026-09-27)", () => {
  it("reports every bad field in one refusal", () => {
    let message = "";
    try {
      parse({ title: "x", url: "ftp://a.com", outputs: ["poster", "practice_test"], depth: "deep", count: 0 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/^kit_request_draft was refused: 6 problems\./);
    for (const bit of [/Unknown field title/, /http/, /Unknown output "poster"/, /cannot be made yet/, /depth/, /1 to 150/])
      expect(message).toMatch(bit);
    expect(message.endsWith("Nothing was changed.")).toBe(true);
  });
});
