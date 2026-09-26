/**
 * The shared GFM table vectors (gfm-table-vectors.json) are exactly what THE
 * TypeScript rule computes. aidream's Python block detector reads a byte-identical
 * copy (packages/matrx-ai/tests/fixtures/gfm_table_vectors.json) and must agree —
 * so a change to the rule here regenerates the JSON and moves the Python twin.
 *
 * Regenerate (never hand-edit the JSON; the splitter needs jest's environment):
 *   GFM_TABLE_VECTORS_WRITE=1 pnpm exec jest --maxWorkers=1 gfm-table-vectors
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeGfmTableVectors } from "../gfm-table-vectors";
import { oracleTableGrid } from "@/scripts/lib/gfm-table-oracle";

const FILE = resolve(__dirname, "gfm-table-vectors.json");
if (process.env.GFM_TABLE_VECTORS_WRITE === "1") {
  writeFileSync(FILE, `${JSON.stringify(computeGfmTableVectors(), null, 2)}\n`);
}
const stored = JSON.parse(readFileSync(FILE, "utf8"));

it("the stored vectors are what the TypeScript rule computes today", () => {
  expect(computeGfmTableVectors()).toEqual(stored);
});

it("the vectors cover pipe-less tables, the R5-1 list line, and escaped pipes", () => {
  const withTable = (stored.documents as Array<{ name: string; blocks: Array<[string, string]> }>)
    .filter((d) => d.blocks.some(([type]) => type === "table"))
    .map((d) => d.name);
  expect(withTable).toEqual(
    expect.arrayContaining([
      "pipe-less, three columns",
      "pipe-less, escaped pipe in code",
      "a list item ends a pipe-less table (verify-RC-B4 R5-1 shape)",
    ]),
  );
  expect(stored.cellPipes[0]).toEqual({ cell: "`err\\|warn`", display: "`err|warn`" });
});

// verify-RC-B4 round 9: the rule is judged, not just recorded — every stored table
// end is where an independent GFM parser (micromark via remark-gfm) ends the table.
it.each((stored.tableEnds as Array<{ lines: string[]; start: number; end: number }>).map((v) => [JSON.stringify(v.lines[v.start + 3] ?? v.lines.at(-1)), v] as const))(
  "the table ends where GFM ends it: %s",
  (_label, v) => {
    const grid = oracleTableGrid(v.lines.join("\n"));
    expect(grid).not.toBeNull();
    // GFM's grid is the header plus its rows; the delimiter row is not in it.
    expect(v.start + (grid?.length ?? 0) + 1).toBe(v.end);
  },
);

it.each((stored.tableStarts as Array<{ lines: string[]; index: number; opens: boolean }>).map((v) => [JSON.stringify(v.lines.slice(0, v.index)), v] as const))(
  "a table opens (or not) where GFM opens it, under %s",
  (_label, v) => {
    expect(oracleTableGrid(v.lines.join("\n")) !== null).toBe(v.opens);
  },
);

it("a trailing lone | is an empty row the parser keeps", () => {
  const table = (stored.tables as Array<{ table: string; rows?: string[][] }>).find((t) => t.table.endsWith("\n |"));
  expect(table?.rows).toEqual([["B3", "re-scan"], [""]]);
});
