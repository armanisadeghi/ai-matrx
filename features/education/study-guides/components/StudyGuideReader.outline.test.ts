import { initialOutlineExpansion, outlineIndentLevel, studyGuideOutlineItems, toggleOutlineSection, visibleOutlineItems } from "../outline";
import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { parseNoteOutline } from "@/features/notes/utils/noteOutline";

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

describe("study guide outline", () => {
  const source = [
    "# AP Human Geography Unit 1: Thinking Geographically",
    "## Topic 1.1: Introduction to Maps",
    "### 1. What Maps Are and What They Show",
    "#### Reference Maps",
    "#### Thematic Maps",
    "## Topic 1.2: Geographic Data",
    "### 1. Types of Geographic Data",
  ].join("\n");

  it("treats a sole H1 as the title and opens only the first topic", () => {
    const items = studyGuideOutlineItems(parseNoteOutline(source));
    expect(items.map((item) => item.text)).not.toContain("AP Human Geography Unit 1: Thinking Geographically");
    expect(items.map((item) => item.headingIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    const initial = initialOutlineExpansion(items);
    expect(initial).toEqual({ 1: true, 5: false });
    expect(visibleOutlineItems(items, initial).map((item) => item.text)).toEqual([
      "Topic 1.1: Introduction to Maps", "1. What Maps Are and What They Show", "Reference Maps", "Thematic Maps", "Topic 1.2: Geographic Data",
    ]);
    const switched = toggleOutlineSection(items, initial, 5);
    expect(visibleOutlineItems(items, switched).map((item) => item.text)).toEqual([
      "Topic 1.1: Introduction to Maps", "Topic 1.2: Geographic Data", "1. Types of Geographic Data",
    ]);
    expect(items.map((item) => outlineIndentLevel(item, items))).toEqual([0, 1, 2, 2, 0, 1]);
  });

  it("retains multiple H1 section roots", () => {
    const items = studyGuideOutlineItems(parseNoteOutline("# First\n## Child\n# Second\n## Child"));
    expect(items.map((item) => item.level)).toEqual([1, 2, 1, 2]);
    expect(initialOutlineExpansion(items)).toEqual({ 0: true, 2: false });
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
