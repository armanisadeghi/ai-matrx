import { initialOutlineExpansion, toggleOutlineSection, visibleOutlineItems } from "../outline";
import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";

const outline: NoteOutlineItem[] = [
  { level: 1, text: "Unit one", charOffset: 0, headingIndex: 0 },
  { level: 2, text: "Topic one", charOffset: 10, headingIndex: 1 },
  { level: 3, text: "Detail", charOffset: 20, headingIndex: 2 },
  { level: 1, text: "Unit two", charOffset: 30, headingIndex: 3 },
];

describe("visibleOutlineItems", () => {
  it("hides every descendant of a collapsed heading while keeping sibling roots", () => {
    expect(visibleOutlineItems(outline, { 0: false }).map((item) => item.text)).toEqual([
      "Unit one",
      "Unit two",
    ]);
  });
});

 describe("major outline accordion", () => {
  it("opens only the first root initially and switches roots without losing nested state", () => {
    const initial = initialOutlineExpansion(outline);
    expect(initial).toEqual({ 0: true, 3: false });
    const nested = toggleOutlineSection(outline, initial, 1);
    const switched = toggleOutlineSection(outline, nested, 3);
    expect(switched).toEqual({ 0: false, 1: false, 3: true });
    expect(visibleOutlineItems(outline, switched).map((item) => item.headingIndex)).toEqual([0, 3]);
    expect(toggleOutlineSection(outline, switched, 3)[3]).toBe(false);
    expect(toggleOutlineSection(outline, switched, 0)).toEqual({ 0: true, 1: false, 3: false });
  });
});
