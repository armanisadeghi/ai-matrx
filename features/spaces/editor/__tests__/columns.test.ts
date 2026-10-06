// Round 18 blocker: "/2 columns" typed inside a column nested a column list in a column — Notion never
// does — and the page's next save was refused while later edits were lost. Every page crossing the
// store boundary (stored → editor on load, editor → stored on save) leaves with flat columns: a nested
// list's columns join the outer list, a stray block in a list gets its own column, a one-column list
// melts into its blocks. The result is always a snapshot the database takes.

import { validateSnapshot } from "@/lib/spaces-blocks/schema";
import { DEFAULT_PAGE_SETTINGS, type SpaceBlock } from "@/lib/spaces-blocks/types";

import { fromEngine, toEngine, type EngineBlock } from "../convert";

const p = (id: string, text: string): SpaceBlock => ({ id, type: "text", text: [{ text }] });
const col = (id: string, width: number, children: SpaceBlock[]): SpaceBlock => ({ id, type: "column", props: { width }, children });
const list = (id: string, children: SpaceBlock[]): SpaceBlock => ({ id, type: "columnList", children });

const valid = (blocks: SpaceBlock[]) => validateSnapshot({ v: 1, icon: null, cover: null, settings: DEFAULT_PAGE_SETTINGS, blocks });

/** Every columnList that sits anywhere inside a column. */
function nestedLists(blocks: SpaceBlock[], inColumn = false): string[] {
  return blocks.flatMap((b) => [...(inColumn && b.type === "columnList" ? [b.id] : []), ...nestedLists(b.children ?? [], inColumn || b.type === "column")]);
}
const texts = (blocks: SpaceBlock[]): string[] => blocks.flatMap((b) => [...(b.text ?? []).map((s) => s.text), ...texts(b.children ?? [])]);
const widthsOf = (l: SpaceBlock) => (l.children ?? []).map((c) => Number(c.props?.width));

// The tree the editor held after "/2 columns" in the left column (read back from a live page).
const NESTED: SpaceBlock[] = [
  list("L", [
    col("A", 0.5, [p("a1", "Left column text"), list("N", [col("N1", 0.5, [p("n1", "After nested columns")]), col("N2", 0.5, [p("n2", "")])]), p("a2", "Below")]),
    col("B", 0.5, [p("b1", "Right")]),
  ]),
];

describe("columns are never nested across the store boundary", () => {
  for (const [name, run] of [
    ["editor → stored (save)", (b: SpaceBlock[]) => fromEngine(b.length ? (toEngineRaw(b) as EngineBlock[]) : [])],
    ["stored → editor (load)", (b: SpaceBlock[]) => fromEngineRaw(toEngine(b))],
  ] as const) {
    it(`${name}: a list nested in a column joins the outer list, nothing lost`, () => {
      const out = run(NESTED);
      expect(nestedLists(out)).toEqual([]);
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("columnList");
      expect(texts(out)).toEqual(["Left column text", "After nested columns", "", "Below", "Right"]);
      const w = widthsOf(out[0]);
      expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
      expect(valid(out)).toEqual([]);
      // Ids stay unique and the same on every run (two co-editors seeding the room write identical items).
      expect(JSON.stringify(run(NESTED))).toBe(JSON.stringify(out));
    });
  }

  it("a stray block straight inside a list gets its own column; a one-column list melts into its blocks", () => {
    const stray = fromEngine(toEngineRaw([list("S", [col("S1", 0.5, [p("s1", "one")]), p("s2", "stray")]), list("O", [col("O1", 1, [p("o1", "alone")])])]) as EngineBlock[]);
    expect(stray.map((b) => b.type)).toEqual(["columnList", "text"]);
    expect(stray[0].children?.map((c) => c.type)).toEqual(["column", "column"]);
    expect(texts(stray)).toEqual(["one", "stray", "alone"]);
    expect(valid(stray)).toEqual([]);
  });

  it("valid columns pass through unchanged", () => {
    const flat = [list("F", [col("F1", 0.3, [p("f1", "x")]), col("F2", 0.7, [p("f2", "y")])])];
    expect(fromEngine(toEngine(flat))).toEqual(flat);
  });
});

/** The raw engine shape of a stored tree, normalisation skipped — what a live editor can hold. */
function toEngineRaw(blocks: SpaceBlock[]): EngineBlock[] {
  return blocks.map((b) => ({
    id: b.id,
    type: b.type === "text" ? "paragraph" : b.type,
    props: { ...(b.props ?? {}) },
    ...(b.type === "text" ? { content: (b.text ?? []).map((s) => ({ type: "text", text: s.text, styles: {} })) } : {}),
    children: toEngineRaw(b.children ?? []),
  }));
}
function fromEngineRaw(blocks: EngineBlock[]): SpaceBlock[] {
  return blocks.map((b) => {
    const type = b.type === "paragraph" ? "text" : b.type;
    const out: SpaceBlock = { id: b.id, type };
    if (type === "text") out.text = ((b.content as Array<{ text: string }>) ?? []).map((t) => ({ text: t.text }));
    if (b.props && Object.keys(b.props).length) out.props = { ...b.props };
    if (b.children?.length) out.children = fromEngineRaw(b.children);
    return out;
  });
}
