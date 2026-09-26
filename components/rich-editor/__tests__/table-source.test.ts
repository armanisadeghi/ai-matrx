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
