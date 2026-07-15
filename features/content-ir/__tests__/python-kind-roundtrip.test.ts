/**
 * Cross-language round-trip proof for the 2026-07-15 KindSchema expressivity
 * extension (project A2): every Python-owned kind whose pydantic-emitted
 * JSON Schema was previously UNREPRESENTABLE (non-object roots, json-any
 * fields, `items: {}` arrays, `additionalProperties: true` records/open
 * objects) now survives
 *
 *   emitted JSON Schema
 *     → runSchemaConversion            (openai-schema-converter.ts)
 *     → kindSchemaToStorage / storageToKindSchema   (exact-inverse proof)
 *     → kindSchemaToJsonSchema         (kind-to-json-schema.ts, strict,
 *                                       no __kind injection)
 *
 * with SEMANTIC EQUIVALENCE proven by ajv: every fixture instance gets the
 * same verdict from the original schema and the re-emitted schema.
 *
 * Accepted narrowing (documented in the fixture): JSON Schema `integer` →
 * KindSchema `number` (the map_result/wf_012 precedent) — fixtures avoid the
 * fractional-integer edge, everything the original accepts stays accepted.
 *
 * Fixture: __tests__/fixtures/python-blocked-kinds.json — schemas captured
 * VERBATIM from live content_ir.kind_definition. Twinned to aidream.
 */

import Ajv from "ajv";
import fixture from "./fixtures/python-blocked-kinds.json";
import {
  runSchemaConversion,
  type BlockSchemaDraft,
} from "../convert/openai-schema-converter";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import type { KindSchema } from "../core/kind-schema.types";

type FixtureKind = {
  kind: string;
  emitted_json_schema: Record<string, unknown>;
  instances: { valid: unknown[]; invalid: unknown[] };
};

const kinds = (fixture as { kinds: FixtureKind[] }).kinds;

// Authoring-strictness OFF (tolerate provider keywords), data strictness from
// the schema itself — the exact config the dual gate uses.
const ajv = new Ajv({ allErrors: true, strict: false });

function draftToKindSchema(draft: BlockSchemaDraft): KindSchema {
  return draft.root
    ? { kind: draft.slug, fields: {}, root: draft.root }
    : { kind: draft.slug, fields: draft.fields };
}

/** Convert one fixture schema into its KindSchema drafts, loudly. */
function convert(entry: FixtureKind): {
  root: KindSchema;
  bySlug: Record<string, KindSchema>;
} {
  const result = runSchemaConversion(
    { name: entry.kind, schema: entry.emitted_json_schema, strict: false },
    {},
  );
  expect(result.parseErrors).toEqual([]);
  const errors = result.problems.filter((p) => p.severity === "error");
  expect(errors).toEqual([]);

  const bySlug: Record<string, KindSchema> = {};
  for (const draft of result.blockSchemas) {
    bySlug[draft.slug] = draftToKindSchema(draft);
  }
  const root = bySlug[entry.kind];
  if (!root) throw new Error(`no root draft for "${entry.kind}"`);
  return { root, bySlug };
}

describe("python blocked kinds — emitted schema → KindSchema → storage → re-emitted schema", () => {
  for (const entry of kinds) {
    describe(entry.kind, () => {
      it("converts without errors and round-trips through storage exactly", () => {
        const { bySlug } = convert(entry);
        for (const schema of Object.values(bySlug)) {
          const restored = storageToKindSchema(
            schema.kind,
            kindSchemaToStorage(schema),
          );
          expect(restored).toEqual(schema);
        }
      });

      it("re-emits a semantically equivalent JSON Schema (ajv verdict parity)", () => {
        const { bySlug } = convert(entry);
        const exported = kindSchemaToJsonSchema(
          entry.kind,
          (slug) => bySlug[slug],
          { strict: true, injectKind: false },
        );
        expect(exported).not.toBeNull();
        if (!exported) return;
        expect(exported.unresolved).toEqual([]);

        const original = ajv.compile(entry.emitted_json_schema);
        const reEmitted = ajv.compile(exported.schema as object);

        for (const instance of entry.instances.valid) {
          expect({
            instance,
            original: original(instance),
            reEmitted: reEmitted(instance),
          }).toEqual({ instance, original: true, reEmitted: true });
        }
        for (const instance of entry.instances.invalid) {
          expect({
            instance,
            original: original(instance),
            reEmitted: reEmitted(instance),
          }).toEqual({ instance, original: false, reEmitted: false });
        }
      });
    });
  }

  it("covers every kind the Studio spec's data[] NULL gap names", () => {
    const covered = new Set(kinds.map((k) => k.kind));
    for (const required of [
      "boolean",
      "number",
      "text",
      "json",
      "string_list",
      "branch_result",
      "http_response",
      "regex_extract_result",
      "gather_result",
      "workflow_run_result",
      "map_result",
    ]) {
      expect(covered.has(required)).toBe(true);
    }
  });
});
