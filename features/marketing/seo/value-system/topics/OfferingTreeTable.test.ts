import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import {
  destinationSiblingOrder,
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
  treeOrder: number | null = null,
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
    treeOrder,
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
      "root-a",
      "child-a",
      "root-b",
    ]);
  });

  it("uses persisted sibling order when no table sort is active", () => {
    const manuallyOrdered = [
      row("root-b", null, "Beta", 12, 2),
      row("root-a", null, "Alpha", 20, 1),
    ];

    const result = processOfferingTreeRows(
      manuallyOrdered,
      state(),
      columns,
      new Set(),
    );

    expect(result.map((entry) => entry.id)).toEqual(["root-a", "root-b"]);
  });

  it("builds a complete top-level order with the moved branch first", () => {
    expect(
      destinationSiblingOrder(rows, "child-b", {
        parentId: null,
        beforeId: null,
        position: "root",
        targetId: null,
      }),
    ).toEqual(["child-b", "root-a", "root-b"]);
  });

  it("inserts a sibling immediately above the shadow target", () => {
    expect(
      destinationSiblingOrder(rows, "child-a", {
        parentId: "root-b",
        beforeId: "child-b",
        position: "before",
        targetId: "child-b",
      }),
    ).toEqual(["child-a", "child-b"]);
  });

  it("inserts before the resolved successor for an after drop", () => {
    expect(
      destinationSiblingOrder(rows, "child-b", {
        parentId: null,
        beforeId: "root-b",
        position: "after",
        targetId: "root-a",
      }),
    ).toEqual(["root-a", "child-b", "root-b"]);
  });

  it("appends at the end for an after drop on the last sibling", () => {
    expect(
      destinationSiblingOrder(rows, "child-a", {
        parentId: null,
        beforeId: null,
        position: "after",
        targetId: "root-b",
      }),
    ).toEqual(["root-a", "root-b", "child-a"]);
  });
});
