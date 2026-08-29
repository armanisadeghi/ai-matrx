/**
 * THE LAZY REGISTRY CONTRACT (Arman's ruling, 2026-08-29): nothing is
 * fetched until it is needed; if a list is fetched, it is NAMES ONLY, as a
 * quick cheap first look — the DB is always the only truth.
 *
 * Pins:
 * 1. `ensureWarm` performs the LIGHT catalog read and nothing else — the
 *    ~1.9 MB bulk schema sweep must never come back.
 * 2. `isKnownKind` = compiled ∪ catalog ∪ cold-fetched.
 * 3. The cold fetch carries the emitted contract + declared loading slug —
 *    per-kind, on demand, the only road they take to the client.
 */

const listKindCatalogFromTables = jest.fn(async () => [
  { slug: "db_only_kind", loadingComponent: "card" },
]);
const getKindSchemaAndMetaBySlugFromTables = jest.fn(async (_kind: string) => ({
  schema: null,
  loadingComponent: "card",
  emittedJsonSchema: { type: "object", properties: {} },
}));

jest.mock("../registry/schema-source-kind-tables", () => ({
  listKindCatalogFromTables: () => listKindCatalogFromTables(),
  getKindSchemaAndMetaBySlugFromTables: (kind: string) =>
    getKindSchemaAndMetaBySlugFromTables(kind),
}));

import { kindRegistry } from "../registry/kind-registry";

test("warm is the light catalog only, and isKnownKind spans compiled + catalog", async () => {
  await kindRegistry.ensureWarm();
  expect(listKindCatalogFromTables).toHaveBeenCalledTimes(1);
  // Nothing per-kind was fetched just for warming.
  expect(getKindSchemaAndMetaBySlugFromTables).not.toHaveBeenCalled();

  // Catalog membership.
  expect(kindRegistry.isKnownKind("db_only_kind")).toBe(true);
  // A compiled system kind.
  expect(kindRegistry.isKnownKind("flashcard_set")).toBe(true);
  // Not ours.
  expect(kindRegistry.isKnownKind("someone_elses_kind")).toBe(false);

  // The declared loading slug rode the catalog.
  expect(kindRegistry.getDeclaredLoadingComponent("db_only_kind")).toBe("card");
});

test("the cold fetch lands the emitted contract per kind", async () => {
  await kindRegistry.ensureWarm();
  const arrived = new Promise<void>((resolve) => {
    const off = kindRegistry.onSchemaArrived(() => {
      off();
      resolve();
    });
  });
  kindRegistry.requestSchema("db_only_kind");
  await arrived;

  expect(getKindSchemaAndMetaBySlugFromTables).toHaveBeenCalledWith(
    "db_only_kind",
  );
  expect(kindRegistry.getEmittedJsonSchema("db_only_kind")).toEqual({
    type: "object",
    properties: {},
  });
});
