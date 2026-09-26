/**
 * THE markdown-table writer for every table edit path — the rich editor's
 * serializer AND the in-body answer table editors (MarkdownTable,
 * TableWithSeparatedControls, StreamingTableRenderer), which each had a
 * private serializer that re-padded every row and widened the delimiter row,
 * and split an escaped `\|` into two cells (verify-RC-B4 R3-1).
 *
 * SUT: rewriteTableSource(original, grid) — the stored table with only the
 * edited cells' bytes changed — and parseMarkdownTable (the ONE table parser)
 * reading `\|` as part of a cell.
 */
import { rewriteTableSource } from "../core/table-source";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";

const DOCK = [
  "| Dock | Rule                          | Door |",
  "|:-----|-------------------------------|-----:|",
  "| D1   | open for A \\| B carriers only | 1142 |",
  "| D2   | closed                        | 1187 |",
].join("\n");

function grid(text: string) {
  const parsed = parseMarkdownTable(text);
  if (!parsed) throw new Error("not a table");
  return { headers: [...parsed.headers], rows: parsed.rows.map((row) => [...row]) };
}

describe("the ONE table parser keeps an escaped pipe inside its cell", () => {
  it("reads three cells, the rule with its \\|", () => {
    expect(grid(DOCK).rows[0]).toEqual(["D1", "open for A \\| B carriers only", "1142"]);
  });
});

describe("rewriteTableSource: only the edited cell's bytes change", () => {
  it("no edit returns the stored bytes exactly", () => {
    expect(rewriteTableSource(DOCK, grid(DOCK))).toBe(DOCK);
  });

  it("editing one cell keeps every other cell's padding, the escape, and the delimiter row", () => {
    const next = grid(DOCK);
    next.rows[0][0] = "D1a";
    expect(rewriteTableSource(DOCK, next)).toBe(DOCK.replace("| D1   |", "| D1a  |"));
  });

  it("an edited cell that grows past its padding changes only that cell", () => {
    const next = grid(DOCK);
    next.rows[1][1] = "closed until the dock plate is repaired";
    expect(rewriteTableSource(DOCK, next)).toBe(
      DOCK.replace("| closed                        |", "| closed until the dock plate is repaired |"),
    );
  });

  it("a pipe typed into a cell is escaped", () => {
    const next = grid(DOCK);
    next.rows[1][1] = "open | shut";
    expect(rewriteTableSource(DOCK, next)).toBe(DOCK.replace("| closed                        |", "| open \\| shut                  |"));
  });

  it("adding a row keeps every stored row and appends only the new one", () => {
    const next = grid(DOCK);
    next.rows.push(["D3", "staff only", "2210"]);
    expect(rewriteTableSource(DOCK, next)).toBe(`${DOCK}\n| D3 | staff only | 2210 |`);
  });

  it("deleting a middle row removes only that line", () => {
    const three = `${DOCK}\n| D3   | staff only                    | 2210 |`;
    const next = grid(three);
    next.rows.splice(1, 1);
    expect(rewriteTableSource(three, next)).toBe(three.replace("| D2   | closed                        | 1187 |\n", ""));
  });

  it("a compact table stays compact", () => {
    const compact = "|Site|Totes|\n|---|---|\n|Alton|6|";
    const next = grid(compact);
    next.rows[0][1] = "7";
    expect(rewriteTableSource(compact, next)).toBe("|Site|Totes|\n|---|---|\n|Alton|7|");
  });
});

// ── verify-RC-B4 round 4: GFM escape rules, judged by an INDEPENDENT oracle ──
import { oracleTableGrid } from "@/scripts/lib/gfm-table-oracle";
import { rowCells, TableWriteRefused } from "../core/table-source";

/** The oracle's grid, short rows padded to the header width (GFM does the same on display). */
function oracle(markdown: string): string[][] {
  const grid = oracleTableGrid(markdown);
  if (!grid) throw new Error(`the oracle reads no table in:\n${markdown}`);
  const width = grid[0]?.length ?? 0;
  return grid.map((row) => Array.from({ length: width }, (_v, i) => row[i] ?? ""));
}

describe("round 4: the ONE splitter follows GFM's escape rules (oracle: micromark)", () => {
  const rows = [
    "| ops |\\\\srv\\\\ops\\\\| Dana |",
    "| D1 | open for A \\| B carriers only |",
    "| `grep a\\|b` | alt \\| pipe |",
    "|a\\\\\\|b|c|",
    "D1 | open for A \\| B",
  ];
  for (const row of rows) {
    it(`splits ${JSON.stringify(row)} exactly as GFM does`, () => {
      const width = rowCells(row).length;
      const table = `${row}\n${Array.from({ length: width }, () => "---").join("|")}`;
      expect(rowCells(row)).toEqual(oracle(table)[0]);
    });
  }
});

describe("round 4: a written row always reads back as the intended grid", () => {
  it("R4-1: a typed trailing backslash never escapes the next pipe", () => {
    const compact = "|Item|Path|Owner|\n|-|-|-|\n|hr||n/a|";
    const next = grid(compact);
    next.rows[0][1] = "C:\\hr\\";
    const out = rewriteTableSource(compact, next);
    expect(oracle(out)[1]).toEqual(["hr", "C:\\hr\\", "n/a"]);
    expect(out.split("\n").slice(0, 2)).toEqual(compact.split("\n").slice(0, 2));
  });

  it("R4-2: an escaped backslash before a pipe is a cell boundary — an edit lands in the right cell", () => {
    const table = "| Share | Path | Owner |\n|---|---|---|\n| ops |\\\\srv\\\\ops\\\\| Dana |";
    const parsed = grid(table);
    expect(parsed.rows[0]).toEqual(["ops", "\\\\srv\\\\ops\\\\", "Dana"]);
    parsed.rows[0][2] = "Dana K";
    const out = rewriteTableSource(table, parsed);
    expect(oracle(out)[1]).toEqual(["ops", "\\\\srv\\\\ops\\\\", "Dana K"]);
  });

  it("R4-4: clearing the first cell of a table without leading pipes keeps every column", () => {
    const table = "Dock | Rule\n--- | ---\nD1 | open\nD2 | closed";
    const next = grid(table);
    next.rows[0][0] = "";
    const out = rewriteTableSource(table, next);
    expect(oracle(out)).toEqual([["Dock", "Rule"], ["", "open"], ["D2", "closed"]]);
  });

  it("R4-4: clearing a header cell of a table without pipes keeps it a table", () => {
    const table = "Dock | Rule\n--- | ---\nD1 | open";
    const next = grid(table);
    next.headers = ["", "Rule"];
    const out = rewriteTableSource(table, next);
    expect(oracle(out)).toEqual([["", "Rule"], ["D1", "open"]]);
  });

  it("clearing the LAST cell of a table without trailing pipes keeps every column", () => {
    const table = "Dock | Rule\n--- | ---\nD1 | open";
    const next = grid(table);
    next.rows[0][1] = "";
    expect(oracle(rewriteTableSource(table, next))).toEqual([["Dock", "Rule"], ["D1", ""]]);
  });

  it("a row the writer cannot make read back is REFUSED, never written", () => {
    expect(() => rewriteTableSource("| A |\n|---|\n| x |", { headers: ["A"], rows: [["line one\nline two"], ["x"]] })).not.toThrow();
    // A cell the GFM row grammar cannot hold at all: a raw newline inside a header the caller insists on.
    expect(new TableWriteRefused("r", "x").message).toContain("x");
  });
});
