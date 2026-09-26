import { choiceControlFor } from "../choice-rule";
import {
  groupRatioOptions,
  isAspectRatioOptionSet,
  ratioShapeName,
} from "@/components/official/aspect-ratio/aspect-ratio-options";

// The 23 ratios gpt-image / Gemini image models expose (Product Shot Studio).
const MANY_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "16:10",
  "10:16",
  "21:9",
  "9:21",
  "2:3",
  "3:2",
  "9:19.5",
  "19.5:9",
  "9:20",
  "20:9",
  "1:2",
  "2:1",
  "4:5",
  "5:4",
  "1:4",
  "1:8",
  "4:1",
  "8:1",
];

describe("THE CHOICE RULE", () => {
  it("≤ 4 short options → pills", () => {
    expect(choiceControlFor(["low", "medium", "high"])).toBe("pill-toggle");
  });
  it("5–12 options → select", () => {
    expect(choiceControlFor(["a1", "b2", "c3", "d4", "e5"])).toBe("select");
  });
  it("> 12 options → searchable select", () => {
    expect(
      choiceControlFor(Array.from({ length: 13 }, (_, i) => `voice-${i}`)),
    ).toBe("searchable");
  });
  it("ratios at any count → the aspect-ratio picker", () => {
    expect(choiceControlFor(MANY_RATIOS)).toBe("aspect-ratio");
    expect(choiceControlFor(["16:9", "9:16"])).toBe("aspect-ratio");
    expect(choiceControlFor(["auto", "1280:720", "720:1280"])).toBe(
      "aspect-ratio",
    );
  });
  it("numbers that are not ratios are not ratios", () => {
    expect(isAspectRatioOptionSet(["4", "6", "8"])).toBe(false);
  });
});

describe("groupRatioOptions", () => {
  it("common ratios first in reach order, the rest under More", () => {
    const g = groupRatioOptions(MANY_RATIOS);
    expect(g.common).toEqual([
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
    ]);
    expect(g.more).toHaveLength(13);
    expect(g.words).toEqual([]);
  });
  it("a short list has no More group", () => {
    const g = groupRatioOptions(["16:9", "9:16"]);
    expect(g.common).toEqual(["16:9", "9:16"]);
    expect(g.more).toEqual([]);
  });
  it("pixel pairs reduce to their common ratio", () => {
    expect(
      groupRatioOptions([
        "1280:720",
        "720:1280",
        "960:960",
        "1104:832",
        "832:1104",
        "1584:672",
        "1:8",
      ]).common,
    ).toEqual(["960:960", "1280:720", "720:1280"]);
  });
  it("names shapes plainly", () => {
    expect(ratioShapeName("1:1")).toBe("Square");
    expect(ratioShapeName("16:9")).toBe("Widescreen");
    expect(ratioShapeName("9:16")).toBe("Story");
    expect(ratioShapeName("4:3")).toBe("Landscape");
    expect(ratioShapeName("21:9")).toBe("Ultrawide");
  });
});
