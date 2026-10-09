import {
  USAGE_WARNINGS_FILTER_OPTIONS,
  formatWarningsFacet,
  usageColumns,
} from "./usageColumns";

interface Row {
  runs: number;
  warnings: number;
}

const read = (row: Row) => ({
  runs: row.runs,
  successes: 0,
  failures: 0,
  lastUsedAt: null,
  costUsd: null,
});

describe("usageColumns — Warnings", () => {
  it("has no Warnings column when the entity does not count warnings (agents)", () => {
    const ids = usageColumns<Row>({ read, lastUsedId: "last_used" }).map((c) => c.id);
    expect(ids).toEqual(["runs", "last_used", "success_rate", "failures", "cost"]);
  });

  it("puts Warnings after Failures, sortable and filterable by the RPC key", () => {
    const cols = usageColumns<Row>({
      read,
      lastUsedId: "last_run",
      warnings: { read: (row) => row.warnings },
    });
    expect(cols.map((c) => c.id)).toEqual([
      "runs",
      "last_run",
      "success_rate",
      "failures",
      "warnings",
      "cost",
    ]);
    const w = cols.find((c) => c.id === "warnings")!;
    expect(w.facet).toBe("warnings");
    expect(w.column.filter).toBe("select");
    expect(w.column.filterOptions).toBe(USAGE_WARNINGS_FILTER_OPTIONS);
    expect(w.defaultHidden).toBeFalsy();
    expect(w.column.accessorFn?.({ runs: 3, warnings: 2 })).toBe(2);
  });

  it("names the buckets the SQL bucket matcher serves", () => {
    expect(USAGE_WARNINGS_FILTER_OPTIONS.map((o) => o.value)).toEqual(["0", "1-5", "6-20", "gt20"]);
    expect(formatWarningsFacet("0")).toBe("None");
  });
});
