import { describe, expect, it } from "vitest";
import type { ToolRefetchSummaryRow } from "./service";
import { sortToolRefetchRows } from "./ToolRefetchConsole";

const row = (
  toolName: string,
  sameDataRepeats: number,
): ToolRefetchSummaryRow =>
  ({ toolName, sameDataRepeats } as ToolRefetchSummaryRow);

describe("sortToolRefetchRows", () => {
  it("keeps copy/export rows aligned with the canonical current sort", () => {
    const rows = [row("zeta", 2), row("alpha", 9)];

    expect(
      sortToolRefetchRows(rows, {
        id: "sameDataRepeats",
        direction: "desc",
      }).map((item) => item.toolName),
    ).toEqual(["alpha", "zeta"]);
    expect(
      sortToolRefetchRows(rows, { id: "toolName", direction: "asc" }).map(
        (item) => item.toolName,
      ),
    ).toEqual(["alpha", "zeta"]);
  });
});
