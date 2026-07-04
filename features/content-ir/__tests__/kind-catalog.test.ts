/**
 * buildKindCatalog — the pure merge behind listAllKinds (admin kind browser).
 * Source classification, DB-overrides-compiled precedence, facet summary,
 * and the uses / used-by reference graph.
 */

import { buildKindCatalog, type KindCatalogEntry } from "../registry/kind-catalog";
import type { BlockSchemaEntry } from "../registry/schema-source-flexible-data";
import type { KindDefinition } from "../registry/kind-registry.types";

/** Narrowing map read — a missing entry fails the test loudly. */
function mustGet(
  map: Map<string, KindCatalogEntry>,
  kind: string,
): KindCatalogEntry {
  const value = map.get(kind);
  if (value === undefined) {
    throw new Error(`Expected catalog entry for ${kind}`);
  }
  return value;
}

const compiledDefs: KindDefinition[] = [
  {
    kind: "alpha_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "alpha",
    artifact: { canvasType: "alpha-canvas" },
    toMarkdown: () => "md",
    persistence: { persistStructured: true },
    schema: {
      kind: "alpha_set",
      fields: {
        title: { type: "string", required: true },
        items: { type: "array", itemKinds: ["alpha_item"], required: true },
      },
    },
  },
  {
    kind: "alpha_item",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "alpha_item",
      fields: {
        front: { type: "string", required: true },
        parent: { type: "object", kind: "alpha_set" },
      },
    },
  },
];

const dbEntries: BlockSchemaEntry[] = [
  {
    id: "row-alpha-set",
    label: "Alpha Set (DB)",
    slug: "alpha_set",
    fields: {
      title: { type: "string", required: true },
      subtitle: { type: "string" },
      items: { type: "array", itemKinds: ["alpha_item"], required: true },
    },
  },
  {
    id: "row-user-kind",
    label: "User Kind",
    slug: "user_kind",
    fields: {
      note: { type: "string" },
      set: { type: "object", kind: "alpha_set" },
    },
  },
];

const compiledSlugs = new Set(compiledDefs.map((def) => def.kind));

describe("buildKindCatalog", () => {
  const catalog = buildKindCatalog(compiledDefs, dbEntries, compiledSlugs);
  const byKind = new Map(catalog.map((entry) => [entry.kind, entry]));

  it("classifies sources: both / system / flexible_data", () => {
    expect(mustGet(byKind, "alpha_set").source).toBe("both");
    expect(mustGet(byKind, "alpha_item").source).toBe("system");
    expect(mustGet(byKind, "user_kind").source).toBe("flexible_data");
  });

  it("DB rows override compiled fields + label; compiled facets survive", () => {
    const alphaSet = mustGet(byKind, "alpha_set");
    expect(alphaSet.label).toBe("Alpha Set (DB)");
    expect(alphaSet.flexibleDataId).toBe("row-alpha-set");
    expect(Object.keys(alphaSet.fields)).toContain("subtitle");
    expect(alphaSet.facets).toEqual({
      legacyBlockType: "alpha",
      artifactCanvasType: "alpha-canvas",
      hasToMarkdown: true,
      hasToLegacyServerData: false,
      hasComponent: false,
      persistStructured: true,
    });
    expect(alphaSet.tier).toBe("eager");
  });

  it("DB-only kinds get a null tier and empty facets", () => {
    const userKind = mustGet(byKind, "user_kind");
    expect(userKind.tier).toBeNull();
    expect(userKind.facets.legacyBlockType).toBeNull();
    expect(userKind.facets.persistStructured).toBe(false);
  });

  it("computes the uses / used-by reference graph across the whole catalog", () => {
    expect(mustGet(byKind, "alpha_set").referencedKinds).toEqual([
      "alpha_item",
    ]);
    expect(mustGet(byKind, "alpha_item").referencedKinds).toEqual([
      "alpha_set",
    ]);
    expect(mustGet(byKind, "user_kind").referencedKinds).toEqual(["alpha_set"]);
    expect(mustGet(byKind, "alpha_set").referencedBy.sort()).toEqual([
      "alpha_item",
      "user_kind",
    ]);
    expect(mustGet(byKind, "alpha_item").referencedBy).toEqual(["alpha_set"]);
    expect(mustGet(byKind, "user_kind").referencedBy).toEqual([]);
  });

  it("sorts entries by kind slug", () => {
    expect(catalog.map((entry) => entry.kind)).toEqual([
      "alpha_item",
      "alpha_set",
      "user_kind",
    ]);
  });
});
