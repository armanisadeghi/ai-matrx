import { visibleOutlineItems } from "../outline";
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
