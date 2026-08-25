import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import {
  processOfferingTreeRows,
  type OfferingTableRow,
} from "./OfferingTreeTable";

const columns: MatrxColumnDef<OfferingTableRow>[] = [
  { accessorKey: "name", header: "Offering", filter: "text" },
  { accessorKey: "keywordsBranch", header: "In branch", filter: "number" },
];

function row(
  id: string,
  parentId: string | null,
  name: string,
  keywordsBranch: number,
): OfferingTableRow {
  return {
    id,
    parentId,
    depth: parentId ? 1 : 0,
    name,
    description: "",
    type: "service",
    typeLabel: "A service you sell",
    branch: "offering",
    branchLabel: "Offering",
    rootName: parentId ?? name,
    worth: 50,
    worthSource: "Default 50",
    offeringMatch: null,
    offeringMatchLabel: "Not set",
    leadQuality: null,
    leadQualityLabel: "Not set",
    keywordsHere: 0,
    keywordsBranch,
    clicks: 0,
    impressions: 0,
    bands: {},
  };
}

const rows = [
  row("root-b", null, "Beta", 12),
  row("child-b", "root-b", "Needle", 3),
  row("root-a", null, "Alpha", 20),
  row("child-a", "root-a", "Other", 8),
];

function state(
  patch: Partial<MatrxDataTableQueryState> = {},
): MatrxDataTableQueryState {
  return {
    page: 1,
    pageSize: 25,
    search: "",
    searchMatchMode: "contains",
    anyOf: "",
    layeredFilters: [],
    columnFilters: {},
    sort: null,
    ...patch,
  };
}

describe("Offering tree table processing", () => {
  it("sorts sibling groups without separating children from their parent", () => {
    const result = processOfferingTreeRows(
      rows,
      state({ sort: { id: "keywordsBranch", direction: "asc" } }),
      columns,
      new Set(),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      "root-b",
      "child-b",
      "root-a",
      "child-a",
    ]);
  });

  it("keeps a matching child's lineage and reveals it through collapsed parents", () => {
    const result = processOfferingTreeRows(
      rows,
      state({ search: "needle" }),
      columns,
      new Set(["root-b"]),
    );

    expect(result.map((entry) => entry.id)).toEqual(["root-b", "child-b"]);
  });

  it("hides descendants of a collapsed parent when no filter is active", () => {
    const result = processOfferingTreeRows(
      rows,
      state(),
      columns,
      new Set(["root-b"]),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      "root-b",
      "root-a",
      "child-a",
    ]);
  });
});
