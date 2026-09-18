import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import type { CatalogOffering } from "./data";
import {
  buildCatalogTree,
  catalogRows,
  destinationSiblingOrder,
  forbiddenParents,
  processCatalogRows,
  resolveOfferingLink,
  tallyByOffering,
  type CatalogRow,
} from "./catalog-tree";

function offering(
  id: string,
  parentId: string | null,
  name: string,
  patch: Partial<CatalogOffering> = {},
): CatalogOffering {
  return {
    id,
    parentId,
    name,
    kind: "service",
    description: null,
    sort: 0,
    templateId: null,
    templateName: null,
    changedFromTemplate: false,
    available: true,
    availabilityReason: null,
    otherSiteCount: 0,
    worthPoints: null,
    leadQuality: null,
    offeringMatch: null,
    worthNotes: null,
    ...patch,
  };
}

const columns: MatrxColumnDef<CatalogRow>[] = [
  { accessorKey: "name", header: "Offering", filter: "text" },
  { accessorKey: "keywordsBranch", header: "In branch", filter: "number" },
];

function state(patch: Partial<MatrxDataTableQueryState> = {}): MatrxDataTableQueryState {
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

function rowsFor(offerings: CatalogOffering[], keywords: Record<string, number> = {}) {
  const stats = tallyByOffering(
    Object.entries(keywords).map(([offeringId, count]) => ({
      offeringId,
      valueBand: "high",
      keywords: count,
      clicks: count,
      impressions: count * 10,
    })),
  );
  return catalogRows(buildCatalogTree(offerings, stats));
}

describe("catalog tree — worth mirrors seo.keyword_value_map (D9)", () => {
  const tree = buildCatalogTree(
    [
      offering("root", null, "Data Destruction", { worthPoints: 40 }),
      offering("mid", "root", "Hard Drive Shredding"),
      offering("leaf", "mid", "On-site Shredding", { worthPoints: 90 }),
      offering("avoid", "root", "Household Drop-off", {
        worthPoints: 5,
        leadQuality: "negative_value",
      }),
      offering("under-avoid", "avoid", "TV Recycling"),
      offering("bare", null, "Consulting"),
    ],
    new Map(),
  );

  it("takes the offering's own ruling first", () => {
    expect(tree.byId.get("leaf")?.effectivePoints).toBe(90);
    expect(tree.byId.get("leaf")?.worthFrom?.id).toBe("leaf");
  });

  it("inherits from the NEAREST ruled ancestor, not the root", () => {
    const mid = tree.byId.get("mid");
    expect(mid?.effectivePoints).toBe(40);
    expect(mid?.worthFrom?.id).toBe("root");
  });

  it("a negative ruling forces its whole branch negative", () => {
    expect(tree.byId.get("avoid")?.negative).toBe(true);
    expect(tree.byId.get("under-avoid")?.negative).toBe(true);
    expect(tree.byId.get("mid")?.negative).toBe(false);
  });

  it("no ruling anywhere on the lineage adds nothing", () => {
    expect(tree.byId.get("bare")?.effectivePoints).toBeNull();
    expect(tree.byId.get("bare")?.worthFrom).toBeNull();
  });

  it("never offers an offering or its descendants as its own parent", () => {
    expect([...forbiddenParents(tree, "root")].sort()).toEqual(
      ["avoid", "leaf", "mid", "root", "under-avoid"].sort(),
    );
  });

  it("survives a parent cycle without looping", () => {
    const cyclic = buildCatalogTree(
      [offering("a", "b", "A"), offering("b", "a", "B")],
      new Map(),
    );
    expect(cyclic.byId.size).toBe(2);
  });
});

describe("catalog tree — durable links", () => {
  const offerings = [
    offering("bo-1", null, "Shredding", { templateId: "tpl-1" }),
    offering("bo-2", null, "Consulting"),
  ];

  it("opens a brand offering by its own id", () => {
    expect(resolveOfferingLink(offerings, "bo-2")?.id).toBe("bo-2");
  });

  it("opens a pre-cutover topic link on the brand's copy of that suggestion", () => {
    expect(resolveOfferingLink(offerings, "tpl-1")?.id).toBe("bo-1");
  });

  it("an unknown id resolves to nothing rather than a wrong offering", () => {
    expect(resolveOfferingLink(offerings, "nope")).toBeNull();
  });
});

describe("catalog tree — table processing", () => {
  const rows = rowsFor(
    [
      offering("root-b", null, "Beta"),
      offering("child-b", "root-b", "Needle"),
      offering("root-a", null, "Alpha"),
      offering("child-a", "root-a", "Other"),
    ],
    { "child-b": 3, "root-b": 9, "child-a": 8, "root-a": 12 },
  );

  it("rolls keywords up the branch", () => {
    expect(rows.find((row) => row.id === "root-b")?.keywordsBranch).toBe(12);
    expect(rows.find((row) => row.id === "root-a")?.keywordsBranch).toBe(20);
  });

  it("sorts sibling groups without separating children from their parent", () => {
    const result = processCatalogRows(
      rows,
      state({ sort: { id: "keywordsBranch", direction: "asc" } }),
      columns,
      new Set(),
    );
    expect(result.map((entry) => entry.id)).toEqual(["root-b", "child-b", "root-a", "child-a"]);
  });

  it("keeps a matching child's lineage and reveals it through collapsed parents", () => {
    const result = processCatalogRows(rows, state({ search: "needle" }), columns, new Set(["root-b"]));
    expect(result.map((entry) => entry.id)).toEqual(["root-b", "child-b"]);
  });

  it("hides descendants of a collapsed parent when no filter is active", () => {
    const result = processCatalogRows(rows, state(), columns, new Set(["root-b"]));
    expect(result.map((entry) => entry.id)).toEqual(["root-a", "child-a", "root-b"]);
  });

  it("uses the brand's saved sibling order when no table sort is active", () => {
    const ordered = rowsFor([
      offering("root-b", null, "Beta", { sort: 2 }),
      offering("root-a", null, "Alpha", { sort: 1 }),
    ]);
    const result = processCatalogRows(ordered, state(), columns, new Set());
    expect(result.map((entry) => entry.id)).toEqual(["root-a", "root-b"]);
  });

  it("builds a complete top-level order with the moved branch first", () => {
    expect(
      destinationSiblingOrder(rows, "child-b", { parentId: null, beforeId: null, position: "root", targetId: null }),
    ).toEqual(["child-b", "root-a", "root-b"]);
  });

  it("inserts a sibling immediately above the target", () => {
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
