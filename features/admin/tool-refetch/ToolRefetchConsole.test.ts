import type { ToolRefetchSummaryRow } from "./service";
import { projectToolRefetchRows } from "./ToolRefetchConsole";

const row = (
  toolName: string,
  sameDataRepeats: number,
): ToolRefetchSummaryRow =>
  ({ toolName, sameDataRepeats } as ToolRefetchSummaryRow);

describe("projectToolRefetchRows", () => {
  it("keeps copy/export rows aligned with the canonical filtered and sorted view", () => {
    const rows = [row("zeta", 2), row("alpha", 9)];
    const columns = [
      { id: "toolName", accessorKey: "toolName" as const, header: "Tool" },
      {
        id: "sameDataRepeats",
        accessorKey: "sameDataRepeats" as const,
        header: "Same-data",
        filter: "number" as const,
      },
    ];

    expect(
      projectToolRefetchRows(rows, columns, {
        page: 1,
        pageSize: 50,
        search: "alpha",
        anyOf: "",
        columnFilters: { sameDataRepeats: { kind: "number", min: 5 } },
        sort: { id: "toolName", direction: "asc" },
      }).map(
        (item) => item.toolName,
      ),
    ).toEqual(["alpha"]);
  });
});
