import { findParts, isWordQuery, matchesPart, partPages, type SourcePart } from "./partsSearch";

/**
 * V1-A (verifier shot 06): "Search parts — words, a page (12) or pages (3-10)"
 * matched only labels, so "photosynthesis" found nothing in the AP Biology course
 * description; and a chunk tiling pages 22–24 said "Page 22".
 */
const parts: SourcePart[] = [
  { id: "c-10", label: "Page 10", page: 10, chars: 4700, preview: "Unit 2: Cell Structure and Function. Cells are the basic unit of life" },
  { id: "c-22", label: "Pages 22–24", page: 22, chars: 5700, preview: "Unit 3: Cellular Energetics. Enzyme structure and catalysis" },
  { id: "c-25", label: "Page 25", page: 25, chars: 4300, preview: "Topic 3.5 Photosynthesis. Organisms capture energy from light" },
];

describe("finding a part", () => {
  it("finds a part by a word in its opening words (A5 preview)", () => {
    expect(findParts(parts, "photosynthesis").map((p) => p.id)).toEqual(["c-25"]);
    expect(findParts(parts, "Cellular energetics").map((p) => p.id)).toEqual(["c-22"]);
  });

  it("finds a word deep inside a part once the server names the parts that hold it", () => {
    // `POST /sources/parts/search` answered: only c-22's text holds "thylakoid".
    const serverMatches = new Set(["c-22"]);
    expect(findParts(parts, "thylakoid").map((p) => p.id)).toEqual([]);
    expect(findParts(parts, "thylakoid", serverMatches).map((p) => p.id)).toEqual(["c-22"]);
    // A preview match still shows while (or without) the server's answer.
    expect(findParts(parts, "photosynthesis", serverMatches).map((p) => p.id)).toEqual(["c-22", "c-25"]);
  });

  it("a part spanning pages covers every page in its span", () => {
    expect(partPages(parts[1]!)).toEqual([22, 24]);
    expect(matchesPart(parts[1]!, "23")).toBe(true);
    expect(findParts(parts, "23-30").map((p) => p.id)).toEqual(["c-22", "c-25"]);
    expect(findParts(parts, "10").map((p) => p.id)).toEqual(["c-10"]);
    expect(findParts(parts, "11 to 12")).toEqual([]);
  });

  it("tells words from pages", () => {
    expect(isWordQuery("photosynthesis")).toBe(true);
    expect(isWordQuery("12")).toBe(false);
    expect(isWordQuery("3-10")).toBe(false);
    expect(isWordQuery("  ")).toBe(false);
  });
});
