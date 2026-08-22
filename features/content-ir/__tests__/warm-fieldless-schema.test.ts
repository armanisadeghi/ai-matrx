/**
 * REGRESSION GUARD: a `content_ir.kind_definition` row with NO fields must not
 * erase a compiled schema.
 *
 * The canonical content_ir adapter omits Python-owned object contracts it
 * cannot faithfully flatten. The registry still defends against any source
 * violating that invariant: a fieldless override cannot erase a compiled
 * schema and emits one structured diagnostic, without mirroring itself through
 * `console.error` into a duplicate Error Inspector entry.
 *
 * Measured on the keyword classifier (2026-08-17): a 5,097-character result
 * rendered as "Keyword intent classification 0 — Waiting for the first
 * classification…". Found while fixing D209.
 *
 * A row that carries real fields (or a root form) still wins — that is the
 * documented contract, and it is pinned here too.
 */

import type { KindSchema } from "@ai-matrx/content-ir";

const FIELDLESS: KindSchema = { kind: "kind_under_test", fields: {} };
const RICH: KindSchema = {
  kind: "kind_under_test",
  fields: {
    results: { type: "array", itemKinds: ["row_kind"], required: true },
  },
};

async function warmWith(schemas: Record<string, KindSchema>) {
  jest.resetModules();
  const captureError = jest.fn();
  jest.doMock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError }));
  jest.doMock("../registry/schema-source-kind-tables", () => ({
    listKindSchemasFromTables: jest.fn(async () => ({
      schemas,
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
  return { kindRegistry, captureError };
}

afterEach(() => {
  jest.dontMock("../registry/schema-source-kind-tables");
  jest.dontMock("../registry/system-kinds");
  jest.dontMock("@/lib/diagnostics/errorCaptureStore");
  jest.resetModules();
});

test("an omitted unavailable schema quietly keeps the compiled floor", async () => {
  const { kindRegistry, captureError } = await warmWith({});

  expect(
    Object.keys(kindRegistry.getSchema("kind_under_test")?.fields ?? {}),
  ).toEqual(["results"]);
  expect(captureError).not.toHaveBeenCalled();
});

test("a fieldless adapter result keeps the floor and emits one structured diagnostic", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const { kindRegistry, captureError } = await warmWith({
    kind_under_test: FIELDLESS,
  });

  expect(
    Object.keys(kindRegistry.getSchema("kind_under_test")?.fields ?? {}),
  ).toEqual(["results"]);
  expect(captureError).toHaveBeenCalledTimes(1);
  expect(captureError).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "content-ir",
      operation: "select",
      relation: "kind_under_test",
      callSite: "KindRegistry.ensureWarm",
      raw: {
        kind: "kind_under_test",
        recovery: "compiled_schema_retained",
      },
    }),
  );
  // Structured capture is primary; console capture would persist the same
  // logical incident a second time under source `console-error`.
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("a DB row WITH fields still overrides the compiled schema", async () => {
  const { kindRegistry, captureError } = await warmWith({
    kind_under_test: {
      kind: "kind_under_test",
      fields: { headline: { type: "string", required: true } },
    },
  });

  expect(
    Object.keys(kindRegistry.getSchema("kind_under_test")?.fields ?? {}),
  ).toEqual(["headline"]);
  expect(captureError).not.toHaveBeenCalled();
});
