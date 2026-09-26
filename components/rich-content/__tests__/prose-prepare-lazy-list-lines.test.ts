/**
 * A line right under a list item's text is that item's text (CommonMark 5.2 lazy
 * continuation), on screen exactly as in GFM, print and the Visual editor
 * (verify-RC-B4 round 9, R9-2): prose preparation never inserts a blank line
 * that turns it into a paragraph below the list — or, for `| a | b |` lines, into
 * a table under the bullet. Judged against an independent GFM parser.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { preprocessProse } from "../prose/prose-prepare";

type N = { type: string; children?: N[] };
const tree = (md: string) => unified().use(remarkParse).use(remarkGfm).parse(md) as N;
const count = (n: N, type: string): number => (n.type === type ? 1 : 0) + (n.children ?? []).reduce((a, c) => a + count(c, type), 0);
const topTypes = (md: string) => (tree(md).children ?? []).map((n) => n.type);

it.each([
  ["pipe lines under a list item", "Dock handover\n\n- Dock list item\n| Dock | Owner |\n|---|---|\n| D1 | Priya |\n\nTonight."],
  ["a lazy line under a list item", "- Drain the print queue\nbefore midnight\n- Swap the labels"],
  ["a lazy line under an ordered item", "1. Drain the print queue\nbefore midnight\n2. Swap the labels"],
  ["a lazy line under a nested item", "- Docks\n  - B3 re-scan\nafter the audit"],
  // A pipe-less table whose delimiter row starts with `---` stays a table (the
  // setext-heading guard used to put a blank line under its header).
  ["a pipe-less table", "Step | Task | Who\n--- | --- | ---\n1 | Drain the print queue | Tom"],
  // A table indented 3 spaces (split out of a list item) keeps its spaces — nbsp
  // there made GFM read no table.
  ["an indented table", "   | Mechanism | Active attachments |\n   |---|---:|\n   | stamp default | 321 |"],
])("%s reads as GFM reads it", (_label, md) => {
  const prepared = preprocessProse(md);
  expect(topTypes(prepared)).toEqual(topTypes(md));
  expect(count(tree(prepared), "table")).toBe(count(tree(md), "table"));
  expect(count(tree(prepared), "listItem")).toBe(count(tree(md), "listItem"));
});
