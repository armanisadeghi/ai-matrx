// Round 18 blocker: "/2 columns" typed inside a column nested a column list there, and the page's next
// save was refused ('"column" was expected') while later edits were lost. The editor no longer nests
// (slash-insert.editor-proof.mts); and every page crossing the store boundary (stored → editor on load,
// editor → stored on save) leaves with well-formed lists: a stray block in a list gets its own column, a
// list straight inside a list joins it, a one-column list melts into its blocks. A list inside a COLUMN
// is valid and kept (the sample's ring row above its client table). The result always validates.

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

// A list straight inside a list, a stray block in a list, and the editor's nested list in a column.
const BROKEN: SpaceBlock[] = [
  list("L", [col("A", 0.5, [p("a1", "Left column text")]), list("N", [col("N1", 0.5, [p("n1", "Joined")]), col("N2", 0.5, [p("n2", "")])]), p("s1", "Stray")]),
];

describe("column lists are always well formed across the store boundary", () => {
  for (const [name, run] of [
    ["editor → stored (save)", (b: SpaceBlock[]) => fromEngine(toEngineRaw(b))],
    ["stored → editor (load)", (b: SpaceBlock[]) => fromEngineRaw(toEngine(b))],
  ] as const) {
    it(`${name}: a list in a list joins it, a stray block gets a column, nothing lost, the database takes it`, () => {
      expect(valid(BROKEN)).not.toEqual([]);
      const out = run(BROKEN);
      expect(out).toHaveLength(1);
      expect(out[0].children?.map((c) => c.type)).toEqual(["column", "column", "column", "column"]);
      expect(texts(out)).toEqual(["Left column text", "Joined", "", "Stray"]);
      expect(widthsOf(out[0]).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
      expect(valid(out)).toEqual([]);
      // Ids stay unique and the same on every run (two co-editors seeding the room write identical items).
      expect(JSON.stringify(run(BROKEN))).toBe(JSON.stringify(out));
    });
    it(`${name}: a column list inside a column is valid and kept as it is`, () => {
      expect(run(NESTED)).toEqual(NESTED);
      expect(nestedLists(NESTED)).toEqual(["N"]);
    });
  }

  it("a one-column list melts into its blocks; a column outside a list too", () => {
    const out = fromEngine(toEngineRaw([list("O", [col("O1", 1, [p("o1", "alone")])]), col("X", 1, [p("x1", "loose")])]));
    expect(out.map((b) => b.type)).toEqual(["text", "text"]);
    expect(texts(out)).toEqual(["alone", "loose"]);
    expect(valid(out)).toEqual([]);
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
