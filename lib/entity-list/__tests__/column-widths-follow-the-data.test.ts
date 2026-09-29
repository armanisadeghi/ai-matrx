// COLUMN WIDTHS FOLLOW THE DATA (page-pass 2026-09-27, /education/flashcards at
// 1280px: 1376px of declared widths in a 1210px box, the actions off the edge,
// Topic / Difficulty / Folders holding full width over "—").
// Breaks: a mostly-empty column keeps its width → "yields" red; a column with
// values shrinks → "keeps" red; the name is not frozen with a known width, or a
// non-marker column before it is frozen → "pinned" red.
import { fitColumnWidths, PINNED_NAME_MAX, YIELD_WIDTH } from "../columnWidths";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";

type Row = { id: string; name: string; topic: string | null; folders: string[]; shownTo: string };
const rows: Row[] = [
  { id: "1", name: "AP Chemistry", topic: null, folders: [], shownTo: "My team" },
  { id: "2", name: "AP Biology", topic: "", folders: [], shownTo: "My team" },
  { id: "3", name: "Precalc", topic: "Functions", folders: [], shownTo: "Only me" },
  { id: "4", name: "Geo", topic: "—", folders: ["A"], shownTo: "My team" },
];
const col = (id: keyof Row & string, width?: number, extra: Partial<MatrxColumnDef<Row>> = {}): MatrxColumnDef<Row> =>
  ({ id, accessorKey: id, header: id, ...(width === undefined ? {} : { width }), ...extra }) as MatrxColumnDef<Row>;

describe("fitColumnWidths", () => {
  const fitted = Object.fromEntries(
    fitColumnWidths([col("name", 420), col("topic", 220), col("folders", 160), col("shownTo", 180)], rows, "name").map((c) => [c.id, c]),
  );

  it("yields: a column empty in most rows drops to the yield width", () => {
    expect(fitted.topic?.width).toBe(YIELD_WIDTH);
    expect(fitted.folders?.width).toBe(YIELD_WIDTH);
  });

  it("keeps: a column that carries values keeps its declared width", () => {
    expect(fitted.shownTo?.width).toBe(180);
  });

  it("pinned: the name freezes with an explicit, capped width", () => {
    expect(fitted.name?.frozen).toBe(true);
    expect(fitted.name?.width).toBe(PINNED_NAME_MAX);
  });

  it("pinned: nothing freezes when a non-marker column comes before the name", () => {
    const out = fitColumnWidths([col("shownTo", 180), col("name", 300)], rows, "name");
    expect(out.some((c) => c.frozen)).toBe(false);
  });

  it("too few rows to judge: nothing yields", () => {
    const out = fitColumnWidths([col("name"), col("topic", 220)], rows.slice(0, 2), "name");
    expect(out[1]?.width).toBe(220);
  });
});

// /education/quizzes (page-pass 2026-09-27): columns empty or identical on every
// loaded row, hand-hidden page by page. Break: a uniform column is not found, a
// varying one is, a button column (no accessor) is judged, or a column the person
// showed is hidden again → red.
import { effectiveHiddenColumns, hiddenColumnsPatch, uniformColumnIds } from "../columnWidths";

describe("uniform columns hide by default", () => {
  const specs = [
    { id: "name", column: col("name") },
    { id: "topic", column: col("topic") },
    { id: "shownTo", column: col("shownTo") },
    { id: "study", column: { id: "study", header: "Study" } as MatrxColumnDef<Row> },
  ];
  const same = rows.map((r) => ({ ...r, shownTo: "My team" }));

  it("finds the empty-or-identical columns, never the name or a button column", () => {
    expect(uniformColumnIds(specs, same, ["name"])).toEqual(["shownTo"]);
    expect(uniformColumnIds(specs, rows, ["name"])).toEqual([]);
  });

  it("an all-EMPTY column hides at any row count; 'identical' still needs 3 rows (/connected-sources, 2 rows)", () => {
    const two = [
      { id: "1", name: "A", topic: null, folders: [], shownTo: "My team" },
      { id: "2", name: "B", topic: "", folders: [], shownTo: "My team" },
    ] as Row[];
    expect(uniformColumnIds(specs, two, ["name"])).toEqual(["topic"]);
    // …and when those 2 rows ARE the whole list, an identical value hides too.
    expect(uniformColumnIds(specs, two, ["name"], { complete: true })).toEqual(["topic", "shownTo"]);
    expect(uniformColumnIds(specs, two.slice(0, 1), ["name"], { complete: true })).toEqual(["topic"]);
  });

  it("a column the person shows stays shown", () => {
    const eff = effectiveHiddenColumns([], ["shownTo"], []);
    expect(eff).toEqual(["shownTo"]);
    const patch = hiddenColumnsPatch([], eff, []);
    expect(patch).toEqual({ hiddenColumns: [], shownColumns: ["shownTo"] });
    expect(effectiveHiddenColumns(patch.hiddenColumns, ["shownTo"], patch.shownColumns)).toEqual([]);
  });
});
