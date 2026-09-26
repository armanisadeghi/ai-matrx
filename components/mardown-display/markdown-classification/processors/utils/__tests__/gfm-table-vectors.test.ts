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
