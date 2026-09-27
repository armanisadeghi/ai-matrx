import { initialOutlineExpansion, outlineIndentLevel, studyGuideOutlineDisplayTitle, studyGuideOutlineItems, studyGuideOutlineTitle, studyGuideOutlineTree, toggleOutlineSection, visibleOutlineItems } from "../outline";
import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { parseNoteOutline } from "@/features/notes/utils/noteOutline";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OutlineHeader } from "./OutlineHeader";

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
    const headings = parseNoteOutline(source);
    expect(studyGuideOutlineTitle(headings)).toMatchObject({
      level: 1, headingIndex: 0, text: "AP Human Geography Unit 1: Thinking Geographically",
    });
    const titleMarkup = renderToStaticMarkup(createElement(OutlineHeader, { title: studyGuideOutlineTitle(headings), active: false, onJump: () => undefined }));
    expect(titleMarkup).toContain("<button");
    expect(titleMarkup).toContain("AP Human Geography Unit 1: Thinking Geographically");
    expect(titleMarkup).not.toContain("On this page");
    const items = studyGuideOutlineItems(headings);
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
    expect(items.map((item) => outlineIndentLevel(item, items))).toEqual([1, 2, 3, 3, 1, 2]);
  });

  it("retains multiple H1 section roots", () => {
    const headings = parseNoteOutline("# First\n## Child\n# Second\n## Child");
    expect(studyGuideOutlineTitle(headings)).toBeNull();
    expect(renderToStaticMarkup(createElement(OutlineHeader, { title: studyGuideOutlineTitle(headings), active: false, onJump: () => undefined }))).toContain("On this page");
    const items = studyGuideOutlineItems(headings);
    expect(items.map((item) => item.level)).toEqual([1, 2, 1, 2]);
    expect(initialOutlineExpansion(items)).toEqual({ 0: true, 2: false });
  });

  it("does not manufacture a title when there is no H1", () => {
    const headings = parseNoteOutline("## First\n### Child\n## Second");
    expect(studyGuideOutlineTitle(headings)).toBeNull();
    expect(renderToStaticMarkup(createElement(OutlineHeader, { title: studyGuideOutlineTitle(headings), active: false, onJump: () => undefined }))).toContain("On this page");
    expect(studyGuideOutlineItems(headings)).toEqual(headings);
    expect(initialOutlineExpansion(headings)).toEqual({ 0: true, 2: false });
  });

  it("keeps a lone H1 visible when it is the entire document", () => {
    const headings = parseNoteOutline("# Only title");
    expect(studyGuideOutlineTitle(headings)?.headingIndex).toBe(0);
    expect(studyGuideOutlineItems(headings)).toEqual([]);
  });

  it("nests H2-first material under its note title and excludes extraction fragments without changing heading indices", () => {
    const material = [
      "## Evolution of Atomic Theory",
      "The theory evolved.",
      "## J.J. Thomson noticed that mysterious rays bent away from ... - ▪ Proton: a clipped bullet...",
      "## J.J. Thomson and the Discovery of the Electron",
      "### Cathode Ray Experiments",
      "## • Bromine is a red-orange liquid with an average atomic m... - <page number=\"41\">",
      "## 1. Characteristics of Bromine",
      "### Naturally Occurring Isotopes",
    ].join("\n");
    const headings = parseNoteOutline(material);
    const items = studyGuideOutlineItems(headings, material);
    expect(studyGuideOutlineDisplayTitle(headings, "Agent Test Note")).toMatchObject({ text: "Agent Test Note", headingIndex: -1 });
    expect(items.map((item) => [item.text, item.headingIndex, outlineIndentLevel(item, items)])).toEqual([
      ["Evolution of Atomic Theory", 0, 1],
      ["J.J. Thomson and the Discovery of the Electron", 2, 1],
      ["Cathode Ray Experiments", 3, 2],
      ["1. Characteristics of Bromine", 5, 1],
      ["Naturally Occurring Isotopes", 6, 2],
    ]);
    const tree = studyGuideOutlineTree(items);
    expect(tree.map((node) => [node.item.text, node.children.map((child) => child.item.text)])).toEqual([
      ["Evolution of Atomic Theory", []],
      ["J.J. Thomson and the Discovery of the Electron", ["Cathode Ray Experiments"]],
      ["1. Characteristics of Bromine", ["Naturally Occurring Isotopes"]],
    ]);
  });

  it("preserves ordinary sibling headings while omitting a clipped source caption", () => {
    const material = "## What happened... - and why\n## First section\n## Second section\n## Safety - • Lab checklist\nA real section body.\n## 2) Fill-in the charges for the ions. On the top line, thi... - Example 2.8 (2 of 3)\n## Ion Charges and Polyatomic Patterns";
    const headings = parseNoteOutline(material);
    expect(studyGuideOutlineItems(headings, material).map((item) => item.text)).toEqual([
      "What happened... - and why",
      "First section",
      "Second section",
      "Safety - • Lab checklist",
      "Ion Charges and Polyatomic Patterns",
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
