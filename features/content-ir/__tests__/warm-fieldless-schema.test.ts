/**
 * REGRESSION GUARD: a `content_ir.kind_definition` row with NO fields must not
 * erase a compiled schema.
 *
 * A python-owned kind leaves `kind_definition.data` NULL whenever its schema is
 * too nested for aidream's all-or-nothing `fields_from_json_schema` (133 of 140
 * active kinds — D156), and the warm sweep reconstructs that as a schema with
 * zero fields. Because DB rows override compiled schemas once warm, such a row
 * silently un-taught the parser the kind's entire shape: every field of a live
 * payload landed in `residue.extra`, `root.value` collapsed to `{__kind}`, the
 * legacy bridge found nothing, and the kind component rendered an EMPTY card.
 *
 * Measured on the keyword classifier (2026-08-17): a 5,097-character result
 * rendered as "Keyword intent classification 0 — Waiting for the first
 * classification…". Found while fixing D209.
 *
 * A row that carries real fields (or a root form) still wins — that is the
 * documented contract, and it is pinned here too.
 */

import type { KindSchema } from "../core/kind-schema.types";

const FIELDLESS: KindSchema = { kind: "kind_under_test", fields: {} };
const RICH: KindSchema = {
  kind: "kind_under_test",
  fields: {
    results: { type: "array", itemKinds: ["row_kind"], required: true },
  },
};

async function warmWith(schema: KindSchema) {
  jest.resetModules();
  jest.doMock("../registry/schema-source-kind-tables", () => ({
    listKindSchemasFromTables: jest.fn(async () => ({
      schemas: { kind_under_test: schema },
      entries: [],
    })),
    getKindSchemaAndMetaBySlugFromTables: jest.fn(async () => null),
  }));
  jest.doMock("../registry/system-kinds", () => ({
    SYSTEM_KIND_DEFINITIONS: [
      {
        kind: "kind_under_test",
        schemaSource: "system",
        tier: "eager",
        legacyBlockType: "kind_under_test_block",
        schema: RICH,
      },
    ],
  }));
  const { kindRegistry } = await import("../registry/kind-registry");
  await kindRegistry.ensureWarm();
  return kindRegistry;
}

afterEach(() => {
  jest.dontMock("../registry/schema-source-kind-tables");
  jest.dontMock("../registry/system-kinds");
  jest.resetModules();
});

test("a fieldless DB row keeps the compiled schema (and screams)", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const registry = await warmWith(FIELDLESS);

  expect(Object.keys(registry.getSchema("kind_under_test")?.fields ?? {})).toEqual(
    ["results"],
  );
  // Loud recovery — the row is a real data defect, never silently absorbed.
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("reconstructed to ZERO fields"),
  );
  error.mockRestore();
});

test("a DB row WITH fields still overrides the compiled schema", async () => {
  const registry = await warmWith({
    kind: "kind_under_test",
    fields: { headline: { type: "string", required: true } },
  });

  expect(Object.keys(registry.getSchema("kind_under_test")?.fields ?? {})).toEqual(
    ["headline"],
  );
});
