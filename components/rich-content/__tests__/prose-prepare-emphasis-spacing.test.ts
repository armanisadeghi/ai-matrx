/**
 * The one core never changes what GFM says a document IS (verify-RC-B4 round 9
 * ruling): the bold/italic readability spacing may separate a "**Meta Title:**"
 * line from its content, but never where that changes GFM's lists or quotes.
 * Each case judged by an independent GFM parser: list and list-item counts, and
 * quote counts, are identical before and after prose preparation.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { preprocessProse } from "../prose/prose-prepare";

type N = { type: string; children?: N[] };
const tree = (md: string) => unified().use(remarkParse).use(remarkGfm).parse(md) as N;
const count = (n: N, t: string): number => (n.type === t ? 1 : 0) + (n.children ?? []).reduce((a, c) => a + count(c, t), 0);
const shape = (md: string) => { const t = tree(md); return { lists: count(t, "list"), items: count(t, "listItem"), quotes: count(t, "blockquote"), tables: count(t, "table"), headings: count(t, "heading") }; };

it.each([
  ["a bold label inside a list item, then lazy text", "- **Owner:** Priya\nkeeps the dock keys\n- **Backup:** Tom"],
  ["an ordered item ending in bold, then lazy text", "1. Drain the queue **first**\nthen swap labels\n2. Sign off"],
  ["a bold line, then an ordered list starting at 2", "**Andon-cord flags:**\n2. load_for_execution enforces no RLS\n3. agent_call is gated"],
  ["a bold label inside a quote", "> **Note:** the dock closes at six\nbring the keys back"],
  ["an italic line inside a list item", "- Drain the queue\n  *before midnight*\n  then sign"],
])("%s keeps GFM's structure", (_label, md) => {
  expect(shape(preprocessProse(md))).toEqual(shape(md));
});

it("a bold label in plain prose still gets its readability spacing", () => {
  expect(preprocessProse("**Meta Title:**\nHarbor warehouse night shift")).toBe("**Meta Title:**\n\nHarbor warehouse night shift");
});
