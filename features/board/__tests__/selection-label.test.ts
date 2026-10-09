import { describeSelection, type SelectedKind } from "../board/selection-label";

const kinds: Record<string, SelectedKind> = { a: "sticky", b: "sticky", c: "tile", d: "frame", e: "rect", f: "oval", g: "arrow" };
const kindOf = (id: string) => kinds[id];

describe("describeSelection names a selection in plain words", () => {
  it("one kind", () => expect(describeSelection(["a", "b"], kindOf)).toBe("2 stickies"));
  it("singular", () => expect(describeSelection(["c"], kindOf)).toBe("1 tile"));
  it("mixed kinds, rect and oval are both shapes", () =>
    expect(describeSelection(["a", "c", "e", "f"], kindOf)).toBe("1 sticky, 1 tile and 2 shapes"));
  it("unknown ids say nothing", () => expect(describeSelection(["zz"], kindOf)).toBe(""));
});
