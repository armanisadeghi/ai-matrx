import type { SpendDimensionRow } from "../types";
import { paretoCut } from "./ParetoPanel";

function row(key: string, cost: number, total = 100): SpendDimensionRow {
  return {
    key,
    label: key,
    cost,
    share: cost / total,
    n: 1,
    requests: 1,
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    manualCost: cost,
    automatedCost: 0,
    lastAt: null,
  };
}

describe("paretoCut", () => {
  it("shows at least three rows even when one row already exceeds 80%", () => {
    const cut = paretoCut(
      [row("a", 85), row("b", 7), row("c", 5), row("d", 3)],
      4,
      100,
    );

    expect(cut.head.map((item) => item.key)).toEqual(["a", "b", "c"]);
    expect(cut.restCount).toBe(1);
    expect(cut.restCost).toBe(3);
  });

  it("never shows more than six rows when 80% needs a long tail", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(String(index + 1), 10),
    );
    const cut = paretoCut(rows, 10, 100);

    expect(cut.head).toHaveLength(6);
    expect(cut.headCost).toBe(60);
    expect(cut.restCount).toBe(4);
    expect(cut.restCost).toBe(40);
  });

  it("keeps the honest row count when fewer than three values exist", () => {
    const cut = paretoCut([row("a", 70), row("b", 30)], 2, 100);

    expect(cut.head).toHaveLength(2);
    expect(cut.restCount).toBe(0);
    expect(cut.restCost).toBe(0);
  });
});
