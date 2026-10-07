/** Round 27, D5: an emptied column is removed and the layout merges back (Notion). */
import { planColumnHeal, type HealBlock } from "../column-heal";

const p = (id: string): HealBlock => ({ id, type: "paragraph" });
const col = (id: string, width: number, kids: HealBlock[]): HealBlock => ({ id, type: "column", props: { width }, children: kids });
const row = (id: string, cols: HealBlock[]): HealBlock => ({ id, type: "columnList", children: cols });

describe("column heal", () => {
  it("two columns, the left emptied: the row melts into the right column's blocks", () => {
    expect(planColumnHeal([p("a"), row("r", [col("L", 0.5, []), col("R", 0.5, [p("x"), p("y")])])])).toEqual([{ kind: "melt", id: "r", blocks: [p("x"), p("y")] }]);
  });
  it("three columns, one emptied: it is removed and the other two share its width", () => {
    expect(planColumnHeal([row("r", [col("A", 0.25, [p("1")]), col("B", 0.25, []), col("C", 0.5, [p("2")])])])).toEqual([
      { kind: "remove", id: "B" },
      { kind: "width", id: "A", width: 1 / 3 },
      { kind: "width", id: "C", width: 2 / 3 },
    ]);
  });
  it("every column emptied: the row becomes an empty line", () => {
    expect(planColumnHeal([row("r", [col("A", 0.5, []), col("B", 0.5, [])])])).toEqual([{ kind: "melt", id: "r", blocks: [] }]);
  });
  it("a nested row inside a column heals too; full rows are left alone", () => {
    const nested = row("n", [col("n1", 0.5, []), col("n2", 0.5, [p("z")])]);
    expect(planColumnHeal([row("r", [col("A", 0.5, [nested]), col("B", 0.5, [p("b")])])])).toEqual([{ kind: "melt", id: "n", blocks: [p("z")] }]);
    expect(planColumnHeal([row("r", [col("A", 0.5, [p("a")]), col("B", 0.5, [p("b")])])])).toEqual([]);
  });
});
