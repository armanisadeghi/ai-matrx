// No id ever reaches a name a person reads (verify-6 #6, 2026-10-01): six
// decks were named "… section 5 of 6: Chunk 9e46adde-0a23-4fbf-8f4d-9a9c096e9a37
// (page 25) (1/2)". Every generator names its sections through ONE function,
// and this census fails on a generator that composes the title itself.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { sectionLabelForName, sectionRunTitle } from "../coverage";

const ROOT = path.resolve(__dirname, "../../../..");

describe("sectionRunTitle", () => {
  it("reads a chunk header as its page and never keeps the id", () => {
    expect(
      sectionRunTitle("official-ap-biology-ced.pdf and 1 more", {
        index: 5,
        total: 6,
        label: "Chunk 9e46adde-0a23-4fbf-8f4d-9a9c096e9a37 (page 25) (1/2)",
      }),
    ).toBe("official-ap-biology-ced.pdf and 1 more - section 5 of 6: Page 25 (1/2)");
  });

  it("drops a bare id and keeps a real heading", () => {
    expect(sectionLabelForName("Chunk b93ab938-98d8-43d2-a1e4-c5ab3a0b8da1")).toBe("");
    expect(sectionLabelForName("Cell membranes - 9e46adde-0a23-4fbf-8f4d-9a9c096e9a37")).toBe("Cell membranes");
    expect(sectionLabelForName("Page 12 - Page 14")).toBe("Page 12 - Page 14");
    expect(sectionRunTitle("Deck", { index: 1, total: 2, label: "" })).toBe("Deck - section 1 of 2");
  });

  it("is the only place a section title is composed", () => {
    const out = execFileSync(
      "git",
      ["grep", "-l", "-F", " - section ${segment.index} of ${segment.total}", "--", "features/*.ts", "features/*.tsx"],
      { cwd: ROOT, encoding: "utf8" },
    ).toString();
    const composers = out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__"));
    expect(composers).toEqual(["features/education/convert/coverage.ts"]);
  });
});
