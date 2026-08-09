/**
 * lib/entity-list/doors — THE DOOR LAW resolution.
 *
 * Unit-tested rather than browser-checked because the interesting rows are the
 * ones a test account never sees: a heterogeneous list whose rows have no door,
 * a config that names no token, a surface whose title column is called
 * something else. Each of those silently produces a dead end in a browser pass
 * that happens to load only well-formed rows.
 */

import {
  entityListDoorColumnId,
  entityListRowHref,
} from "@/lib/entity-list/doors";
import type { EntityListConfig } from "@/lib/entity-list/config";

interface Row {
  id: string;
  kind?: string;
}

/** Minimal config — only the fields the door resolver reads. */
function makeConfig(
  door: EntityListConfig<Row>["door"],
  columnIds: string[] = ["favorite", "name", "updated"],
): EntityListConfig<Row> {
  return {
    surfaceKey: "test",
    entityLabel: { singular: "row", plural: "rows" },
    scopes: ["mine"],
    service: {
      fetchPage: async () => ({ rows: [], total: 0 }),
      fetchCounts: async () => ({ byKind: {}, narrow: {} }),
      fetchFacets: async () => ({ byKind: {} }),
    },
    columns: columnIds.map((id) => ({
      id,
      label: id,
      column: { id, header: id },
    })),
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => row.id,
    door,
    useRowActions: () => ({
      actions: { menuFor: () => () => ({ sections: [] }), onOpenRow: () => {} },
    }),
    facetSections: [],
    emptyState: { title: "", description: "" },
  };
}

const ID = "11111111-2222-3333-4444-555555555555";

describe("entityListDoorColumnId", () => {
  it("is null when the surface declares no door — never anchors a random cell", () => {
    expect(entityListDoorColumnId(makeConfig(undefined))).toBeNull();
  });

  it("defaults to the declared name column", () => {
    expect(entityListDoorColumnId(makeConfig({ token: "agent" }))).toBe("name");
  });

  it("falls back to a title column when there is no name column", () => {
    expect(
      entityListDoorColumnId(
        makeConfig({ token: "agent" }, ["title", "updated"]),
      ),
    ).toBe("title");
  });

  it("honours an explicit column over the heuristic", () => {
    expect(
      entityListDoorColumnId(makeConfig({ token: "agent", column: "updated" })),
    ).toBe("updated");
  });

  it("is null when a door is declared but no column can carry it", () => {
    expect(
      entityListDoorColumnId(makeConfig({ token: "agent" }, ["updated"])),
    ).toBeNull();
  });
});

describe("entityListRowHref", () => {
  it("resolves the route from the entity registry", () => {
    expect(entityListRowHref(makeConfig({ token: "agent" }), { id: ID })).toBe(
      `/agents/${ID}`,
    );
  });

  it("resolves the token per row for heterogeneous lists", () => {
    const config = makeConfig({ token: (row) => row.kind ?? null });
    expect(entityListRowHref(config, { id: ID, kind: "note" })).toBe(
      `/notes?active=${ID}`,
    );
    expect(entityListRowHref(config, { id: ID })).toBeUndefined();
  });

  it("returns undefined for a token with no route rather than a broken link", () => {
    // `workflow` is registered WITHOUT an hrefFor — `/workflows/[id]` does not
    // exist. A door here would be a 404 factory.
    expect(
      entityListRowHref(makeConfig({ token: "workflow" }), { id: ID }),
    ).toBeUndefined();
  });

  it("honours hrefFor EXACTLY — undefined never falls through to the registry", () => {
    const config = makeConfig({
      token: "agent",
      hrefFor: (row) => (row.kind === "linked" ? `/custom/${row.id}` : undefined),
    });
    expect(entityListRowHref(config, { id: ID, kind: "linked" })).toBe(
      `/custom/${ID}`,
    );
    expect(entityListRowHref(config, { id: ID })).toBeUndefined();
  });

  it("is undefined when no door is declared at all", () => {
    expect(entityListRowHref(makeConfig(undefined), { id: ID })).toBeUndefined();
  });
});
