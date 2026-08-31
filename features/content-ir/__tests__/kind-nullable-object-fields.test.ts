/**
 * NULLABLE IS A FIELD LAW — every mirror kind must survive its own nulls.
 *
 * @ai-matrx/content-ir <= 0.10.1 consulted `nullable` only for scalar-shaped
 * fields and `json[]`: `object` / `inline_object` / `record` / array branches
 * opened with a shape check that reads `null` as a type violation, so a
 * genuinely-null value on a field a kind DECLARES nullable failed validation
 * and degraded the WHOLE instance to `kindState: "raw"` — rendering through
 * `generic_structured` while a real registered component sat unused
 * (reproduced live on `/shapes/lulu_print_job`, FOUND_DEFECTS.md 2026-08-30).
 *
 * 23 sites across commerce / rag / rank / scraper-page / search-results /
 * table kinds already declared `nullable: true` on an object-shaped field and
 * only escaped because their sample values happened to be non-null. Rather
 * than pin those 23 by hand, this is the CLASS guard: for EVERY system kind
 * schema, plant `null` on every field the schema declares nullable and prove
 * the instance still resolves. It fails on any future kind that declares a
 * nullable it cannot actually take, and it fails wholesale if the package
 * regresses.
 */

import {
  createKindStreamParser,
  type FieldSchema,
  type KindSchema,
  type KindStreamEvent,
} from "@ai-matrx/content-ir";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

const SCHEMAS: Record<string, KindSchema> = {};
for (const definition of SYSTEM_KIND_DEFINITIONS) {
  if (definition.schema) SCHEMAS[definition.kind] = definition.schema;
}

/**
 * A value that satisfies `field` — EXCEPT that every nullable field becomes
 * `null`, which is the whole point of the guard. Optional non-nullable fields
 * are omitted by the caller (a missing optional is a notice, not an error).
 */
function sampleForField(field: FieldSchema, seen: string[]): unknown {
  if (field.nullable) return null;

  switch (field.type) {
    case "string":
      return "x";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "enum":
      return field.values[0] ?? "x";
    case "json":
      return null;
    case "json[]":
    case "array":
      return [];
    case "string[]":
      return field.values && !field.open ? [field.values[0] ?? "x"] : ["x"];
    case "number[]":
      return [1];
    case "boolean[]":
      return [true];
    case "record":
      return {};
    case "inline_object":
      return sampleForFields(field.fields, seen);
    case "object":
      return sampleForKind(field.kind, seen);
    case "union": {
      if (field.kinds && field.kinds.length > 0) {
        return sampleForKind(field.kinds[0] as string, seen);
      }
      if (field.scalars.includes("string")) return "x";
      if (field.scalars.includes("number")) return 1;
      return true;
    }
    default:
      return null;
  }
}

function sampleForFields(
  fields: Record<string, FieldSchema>,
  seen: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    // Optional, non-nullable fields are simply absent — only the required ones
    // and the nullable ones (the subject of this guard) are materialized.
    if (!field.required && !field.nullable) continue;
    out[name] = sampleForField(field, seen);
  }
  return out;
}

function sampleForKind(kind: string, seen: string[]): Record<string, unknown> {
  const schema = SCHEMAS[kind];
  // An unregistered nested kind is a different defect (the parser says so
  // loudly); a cycle stops at the marker so this generator always terminates.
  if (!schema || seen.includes(kind)) return { __kind: kind };
  return { __kind: kind, ...sampleForFields(schema.fields, [...seen, kind]) };
}

function parseInstance(value: Record<string, unknown>): KindStreamEvent[] {
  const events: KindStreamEvent[] = [];
  const parser = createKindStreamParser({
    schemas: SCHEMAS,
    onEvent: (event) => events.push(event),
  });
  parser.push(JSON.stringify(value));
  parser.end();
  return events;
}

const NULLABLE_KINDS = Object.values(SCHEMAS)
  .filter(
    (schema) =>
      !schema.root &&
      Object.values(schema.fields).some((field) => field.nullable === true),
  )
  .map((schema) => schema.kind)
  .sort();

describe("every system kind survives null on every field it declares nullable", () => {
  it("has kinds to check (a zero-length sweep would prove nothing)", () => {
    expect(NULLABLE_KINDS.length).toBeGreaterThan(20);
  });

  it.each(NULLABLE_KINDS)("%s", (kind) => {
    const events = parseInstance(sampleForKind(kind, []));

    const raw = events.filter((event) => event.type === "raw_object");
    expect(
      raw.map((event) => (event.type === "raw_object" ? event.reason : "")),
    ).toEqual([]);
    expect(events.find((event) => event.type === "complete")).toMatchObject({
      kind,
    });
  });
});

describe("the guard can fail", () => {
  it("still degrades an instance whose null lands on a NON-nullable field", () => {
    const schema = SCHEMAS["lulu_print_job"];
    expect(schema).toBeDefined();

    const events = parseInstance({
      ...sampleForKind("lulu_print_job", []),
      // `provider` declares neither nullable nor json — a null here is a real
      // violation and must still take the instance to raw.
      provider: null,
    });

    expect(events.find((event) => event.type === "raw_object")).toMatchObject({
      cause: "invalid",
    });
  });
});
