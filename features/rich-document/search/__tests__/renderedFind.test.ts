import { collectRenderedFindRanges, findRenderedTextMatches } from "../renderedFind";

describe("rendered document search", () => {
  it("keeps text search inside the rendered guide and honors find options", () => {
    expect(findRenderedTextMatches("Map maps MAP", "map")).toEqual([[0, 3], [4, 7], [9, 12]]);
    expect(findRenderedTextMatches("Map maps MAP", "map", { caseSensitive: true, wholeWord: true })).toEqual([]);
    expect(findRenderedTextMatches("Map maps MAP", "Map", { caseSensitive: true, wholeWord: true })).toEqual([[0, 3]]);
    expect(findRenderedTextMatches("alpha beta", "(alpha|beta)", { regex: true })).toEqual([[0, 5], [6, 10]]);
    expect(findRenderedTextMatches("alpha beta", "[", { regex: true })).toEqual([]);
  });

  it("finds across inline formatting but excludes controls", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p>Large-<strong>scale map</strong></p><button>Large-scale map</button>';
    const ranges = collectRenderedFindRanges(root, "large-scale map");
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("Large-scale map");
  });

  it("does not join independent blocks into a match", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>alpha <strong>beta</strong></p><p>gamma</p>";
    expect(collectRenderedFindRanges(root, "alpha beta")).toHaveLength(1);
    expect(collectRenderedFindRanges(root, "betagamma")).toHaveLength(0);
    root.innerHTML = "<div>alpha</div><div>beta</div>";
    expect(collectRenderedFindRanges(root, "alphabeta")).toHaveLength(0);
    expect(collectRenderedFindRanges(root, "alpha")).toHaveLength(1);
  });

  it("recognizes whole-word boundaries in international text", () => {
    expect(findRenderedTextMatches("éclair clair", "clair", { wholeWord: true })).toEqual([[7, 12]]);
    expect(findRenderedTextMatches("домик дом", "дом", { wholeWord: true })).toEqual([[6, 9]]);
  });
});
