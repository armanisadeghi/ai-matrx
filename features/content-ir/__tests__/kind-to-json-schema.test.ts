/**
 * kindSchemaToJsonSchema — the KindSchema → provider JSON Schema exporter.
 *
 * Covers: transitive $defs collection (math_problem family), multi-itemKind
 * arrays (flashcard_set), strict / injectKind option behavior, cycle safety
 * (self-reference + a mutually-referencing pair), unresolved-kind stubs, and
 * the ROUND-TRIP contract: exporter output fed back through
 * runSchemaConversion (openai-schema-converter.ts) reproduces the source
 * KindSchemas for the root and every array-item child.
 *
 * Documented round-trip asymmetries (see kind-to-json-schema.ts header):
 * `record` fields, multi-itemKind arrays, and nullable unions / object refs
 * degrade on the way back — none of which the math_problem family uses.
 */

import { kindRegistry } from "../registry/kind-registry";
import {
  collectReferencedKinds,
  collectSchemaReferencedKinds,
  kindSchemaToJsonSchema,
  type KindJsonSchemaExport,
} from "../convert/kind-to-json-schema";
import { runSchemaConversion } from "../convert/openai-schema-converter";
import type { KindSchema } from "../core/kind-schema.types";

const compiled = kindRegistry.snapshotSchemas();
const resolve = (kind: string): KindSchema | undefined => compiled[kind];

/** Narrowing unwrap — a null export result fails the test loudly. */
function unwrap(result: KindJsonSchemaExport | null): KindJsonSchemaExport {
  if (result === null) {
    throw new Error("Expected kindSchemaToJsonSchema to return a result");
  }
  return result;
}

/** Narrowing map read — a missing entry fails the test loudly. */
function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Expected map entry for ${String(key)}`);
  }
  return value;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Assert-and-narrow: the value must be a plain object. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecordValue(value)) {
    throw new Error(`Expected an object, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Walk `path` through nested records (arrays not supported — not needed). */
function at(root: unknown, ...path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    cursor = asRecord(cursor)[key];
  }
  return cursor;
}

/**
 * Dereference "#/$defs/<slug>" refs into inline objects so the FORWARD
 * converter (which rejects $ref) can consume the export. Depth-guarded —
 * only used on non-cyclic families.
 */
function inlineDefs(schema: Record<string, unknown>): Record<string, unknown> {
  const defs = isRecordValue(schema.$defs) ? schema.$defs : {};
  const visit = (node: unknown, depth: number): unknown => {
    if (depth > 64) throw new Error("inlineDefs: cycle detected");
    if (Array.isArray(node)) return node.map((item) => visit(item, depth + 1));
    if (!isRecordValue(node)) return node;
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
      const slug = node.$ref.slice("#/$defs/".length);
      return visit(defs[slug], depth + 1);
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$defs") continue;
      out[key] = visit(value, depth + 1);
    }
    return out;
  };
  return asRecord(visit(schema, 0));
}

describe("collectReferencedKinds", () => {
  it("collects object refs, array itemKinds, and refs nested in inline_objects", () => {
    expect(
      collectReferencedKinds({
        root: { type: "object", kind: "a" },
        items: { type: "array", itemKinds: ["b", "c"] },
        meta: {
          type: "inline_object",
          fields: {
            inner: { type: "object", kind: "d" },
            plain: { type: "string" },
          },
        },
        title: { type: "string" },
      }),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("deduplicates in first-sighting order", () => {
    expect(
      collectReferencedKinds({
        one: { type: "array", itemKinds: ["x"] },
        two: { type: "object", kind: "x" },
      }),
    ).toEqual(["x"]);
  });
});

describe("kindSchemaToJsonSchema — transitive $defs", () => {
  it("returns null for an unknown root kind", () => {
    expect(kindSchemaToJsonSchema("no_such_kind", resolve)).toBeNull();
  });

  it("math_problem pulls math_solution + math_solution_step into $defs", () => {
    const { name, schema, strict, unresolved } = unwrap(
      kindSchemaToJsonSchema("math_problem", resolve),
    );

    expect(name).toBe("math_problem");
    expect(strict).toBe(false);
    expect(unresolved).toEqual([]);

    // Root renders INLINE.
    expect(schema.type).toBe("object");
    expect(Object.keys(asRecord(schema.$defs)).sort()).toEqual([
      "math_solution",
      "math_solution_step",
    ]);

    // Single-itemKind arrays are direct $refs, chained through the family.
    expect(at(schema, "properties", "solutions", "items")).toEqual({
      $ref: "#/$defs/math_solution",
    });
    expect(
      at(schema, "$defs", "math_solution", "properties", "steps", "items"),
    ).toEqual({ $ref: "#/$defs/math_solution_step" });

    // Non-strict discriminators are enum-based and required-first.
    expect(at(schema, "properties", "__kind")).toMatchObject({
      type: "string",
      enum: ["math_problem"],
    });
    expect((schema.required as string[])[0]).toBe("__kind");
    expect(
      at(schema, "$defs", "math_solution_step", "properties", "__kind"),
    ).toMatchObject({ enum: ["math_solution_step"] });

    // required mirrors FieldSchema.required.
    expect(schema.required).toContain("solutions");
    expect(schema.required).not.toContain("hint");

    // nullable → type array with "null".
    expect(at(schema, "properties", "description")).toEqual({
      type: ["string", "null"],
    });
    expect(at(schema, "properties", "resources")).toEqual({
      type: ["array", "null"],
      items: { type: "string" },
    });

    // inline_object → nested object with its own properties/required.
    expect(at(schema, "properties", "problem_statement", "type")).toBe(
      "object",
    );
    expect(at(schema, "properties", "problem_statement", "required")).toEqual([
      "text",
      "equation",
      "instruction",
    ]);

    // No strict pinning outside strict mode.
    expect(schema.additionalProperties).toBeUndefined();
  });

  it("math_solution alone exports just itself + math_solution_step", () => {
    const { name, schema } = unwrap(
      kindSchemaToJsonSchema("math_solution", resolve),
    );
    expect(name).toBe("math_solution");
    expect(Object.keys(asRecord(schema.$defs))).toEqual([
      "math_solution_step",
    ]);
  });

  it("a leaf kind with no references has no $defs at all", () => {
    const { schema } = unwrap(
      kindSchemaToJsonSchema("math_solution_step", resolve),
    );
    expect(schema.$defs).toBeUndefined();
  });

  it("flashcard_set: multi-itemKind array → items anyOf; closure includes basic_card via tiered_flashcard", () => {
    const { schema } = unwrap(kindSchemaToJsonSchema("flashcard_set", resolve));

    expect(at(schema, "properties", "cards", "items")).toEqual({
      anyOf: [
        { $ref: "#/$defs/flashcard" },
        { $ref: "#/$defs/enhanced_flashcard" },
        { $ref: "#/$defs/tiered_flashcard" },
      ],
    });
    expect(Object.keys(asRecord(schema.$defs)).sort()).toEqual([
      "basic_card",
      "enhanced_flashcard",
      "flashcard",
      "tiered_flashcard",
    ]);

    // flashcard.back is required + nullable.
    expect(at(schema, "$defs", "flashcard", "properties", "back")).toEqual({
      type: ["string", "null"],
    });
    expect(at(schema, "$defs", "flashcard", "required")).toContain("back");
  });
});

describe("kindSchemaToJsonSchema — options", () => {
  it("strict: const discriminators + additionalProperties:false on every object", () => {
    const { schema, strict } = unwrap(
      kindSchemaToJsonSchema("math_problem", resolve, { strict: true }),
    );

    expect(strict).toBe(true);
    expect(at(schema, "properties", "__kind")).toMatchObject({
      const: "math_problem",
    });
    expect(
      asRecord(at(schema, "properties", "__kind")).enum,
    ).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(at(schema, "$defs", "math_solution", "additionalProperties")).toBe(
      false,
    );
    // Inline objects are pinned too.
    expect(
      at(schema, "properties", "problem_statement", "additionalProperties"),
    ).toBe(false);
  });

  it("injectKind:false leaves every object free of __kind", () => {
    const { schema } = unwrap(
      kindSchemaToJsonSchema("math_problem", resolve, { injectKind: false }),
    );
    expect(at(schema, "properties")).not.toHaveProperty("__kind");
    expect(schema.required).not.toContain("__kind");
    expect(
      at(schema, "$defs", "math_solution", "properties"),
    ).not.toHaveProperty("__kind");
  });
});

describe("kindSchemaToJsonSchema — cycle safety", () => {
  const cyclic: Record<string, KindSchema> = {
    ping: {
      kind: "ping",
      fields: {
        label: { type: "string", required: true },
        partner: { type: "object", kind: "pong" },
      },
    },
    pong: {
      kind: "pong",
      fields: {
        partner: { type: "object", kind: "ping" },
      },
    },
  };
  const resolveCyclic = (kind: string): KindSchema | undefined => cyclic[kind];

  it("a mutually-referencing pair terminates; back-refs to the root use '#'", () => {
    const { schema, unresolved } = unwrap(
      kindSchemaToJsonSchema("ping", resolveCyclic),
    );

    expect(unresolved).toEqual([]);
    expect(Object.keys(asRecord(schema.$defs))).toEqual(["pong"]);
    expect(at(schema, "properties", "partner")).toEqual({
      $ref: "#/$defs/pong",
    });
    // pong's reference BACK to the root kind is the recursive-root ref.
    expect(at(schema, "$defs", "pong", "properties", "partner")).toEqual({
      $ref: "#",
    });
  });

  it("a self-referencing root (decision_node) refs itself via '#'", () => {
    const { schema } = unwrap(kindSchemaToJsonSchema("decision_node", resolve));
    expect(schema.$defs).toBeUndefined();
    expect(at(schema, "properties", "yes")).toEqual({ $ref: "#" });
  });

  it("a self-referencing $defs entry (decision_node under decision_tree) refs its own $defs slot", () => {
    const { schema } = unwrap(kindSchemaToJsonSchema("decision_tree", resolve));
    expect(Object.keys(asRecord(schema.$defs))).toEqual(["decision_node"]);
    expect(at(schema, "$defs", "decision_node", "properties", "yes")).toEqual({
      $ref: "#/$defs/decision_node",
    });
  });
});

describe("kindSchemaToJsonSchema — unresolved references", () => {
  const partial: Record<string, KindSchema> = {
    parent: {
      kind: "parent",
      fields: {
        child: { type: "object", kind: "missing_child", required: true },
      },
    },
  };
  const resolvePartial = (kind: string): KindSchema | undefined =>
    partial[kind];

  it("stubs the missing kind, reports it, and never pins the stub strict", () => {
    const { schema, unresolved } = unwrap(
      kindSchemaToJsonSchema("parent", resolvePartial, { strict: true }),
    );

    expect(unresolved).toEqual(["missing_child"]);
    const stub = asRecord(at(schema, "$defs", "missing_child"));
    expect(stub.type).toBe("object");
    // The stub still carries the discriminator but is NEVER strict-pinned —
    // a __kind-only strict object would reject every real payload.
    expect(at(stub, "properties", "__kind")).toMatchObject({
      enum: ["missing_child"],
    });
    expect(stub.additionalProperties).toBeUndefined();
  });
});

describe("round-trip: exporter output → runSchemaConversion → KindSchemas", () => {
  it("math_problem reproduces the root AND both children field-for-field", () => {
    const exported = unwrap(
      kindSchemaToJsonSchema("math_problem", resolve, {
        strict: false,
        injectKind: true,
      }),
    );

    // The forward converter rejects $ref — dereference first (documented
    // asymmetry; injected __kind consts are what carry kind identity across).
    const inlined = inlineDefs(asRecord(exported.schema));
    const conversion = runSchemaConversion(
      { name: exported.name, schema: inlined, strict: exported.strict },
      compiled,
    );

    expect(conversion.parseErrors).toEqual([]);
    expect(conversion.problems.filter((p) => p.severity === "error")).toEqual(
      [],
    );

    const bySlug = new Map(
      conversion.blockSchemas.map((draft) => [draft.slug, draft]),
    );
    expect([...bySlug.keys()].sort()).toEqual([
      "math_problem",
      "math_solution",
      "math_solution_step",
    ]);

    // Field-level equality with the source KindSchemas. jest toEqual treats
    // explicit-undefined props (required/nullable) as absent — that IS the
    // normalization.
    for (const slug of [
      "math_problem",
      "math_solution",
      "math_solution_step",
    ] as const) {
      expect(mustGet(bySlug, slug).fields).toEqual(compiled[slug].fields);
    }

    // And the root comparison against the live registry is a full match.
    expect(conversion.comparisons.length).toBeGreaterThan(0);
    expect(conversion.comparisons.filter((c) => c.status !== "match")).toEqual(
      [],
    );
  });

  it("strict export round-trips identically (const discriminators read the same as enum)", () => {
    const exported = unwrap(
      kindSchemaToJsonSchema("math_solution", resolve, {
        strict: true,
        injectKind: true,
      }),
    );

    const inlined = inlineDefs(asRecord(exported.schema));
    const conversion = runSchemaConversion(
      { name: exported.name, schema: inlined, strict: exported.strict },
      compiled,
    );

    expect(conversion.parseErrors).toEqual([]);
    const bySlug = new Map(
      conversion.blockSchemas.map((draft) => [draft.slug, draft]),
    );
    expect(mustGet(bySlug, "math_solution").fields).toEqual(
      compiled.math_solution.fields,
    );
    expect(mustGet(bySlug, "math_solution_step").fields).toEqual(
      compiled.math_solution_step.fields,
    );
  });
});

describe("kindSchemaToJsonSchema — 2026-07-15 expressivity constructs", () => {
  it("emits json as the empty schema and json[] as items:{}", () => {
    const schemas: Record<string, KindSchema> = {
      carrier: {
        kind: "carrier",
        fields: {
          body: { type: "json" },
          matches: { type: "json[]", required: true },
        },
      },
    };
    const exported = kindSchemaToJsonSchema("carrier", (k) => schemas[k], {
      injectKind: false,
    });
    expect(exported?.schema).toEqual({
      type: "object",
      properties: {
        body: {},
        matches: { type: "array", items: {} },
      },
      required: ["matches"],
    });
  });

  it("emits record-of-json as additionalProperties:true", () => {
    const schemas: Record<string, KindSchema> = {
      carrier: {
        kind: "carrier",
        fields: { outputs: { type: "record", values: "json" } },
      },
    };
    const exported = kindSchemaToJsonSchema("carrier", (k) => schemas[k], {
      injectKind: false,
    });
    expect(exported?.schema).toMatchObject({
      properties: { outputs: { type: "object", additionalProperties: true } },
    });
  });

  it("keeps an OPEN inline_object open even in strict mode (open-empty-object fix)", () => {
    const schemas: Record<string, KindSchema> = {
      proposal: {
        kind: "proposal",
        fields: {
          draft: { type: "inline_object", open: true, fields: {} },
          closed: { type: "inline_object", fields: {} },
        },
      },
    };
    const exported = kindSchemaToJsonSchema("proposal", (k) => schemas[k], {
      strict: true,
      injectKind: false,
    });
    const properties = (exported?.schema as { properties: Record<string, unknown> })
      .properties;
    expect(properties.draft).toMatchObject({ additionalProperties: true });
    expect(properties.closed).toMatchObject({ additionalProperties: false });
  });

  it("emits union kind members as $refs in anyOf, collected into $defs", () => {
    const schemas: Record<string, KindSchema> = {
      carrier: {
        kind: "carrier",
        fields: {
          payload: {
            type: "union",
            scalars: ["string"],
            kinds: ["alpha"],
            nullable: true,
          },
        },
      },
      alpha: {
        kind: "alpha",
        fields: { name: { type: "string", required: true } },
      },
    };
    const exported = kindSchemaToJsonSchema("carrier", (k) => schemas[k], {
      injectKind: false,
    });
    expect(exported?.unresolved).toEqual([]);
    expect(exported?.schema).toMatchObject({
      properties: {
        payload: {
          anyOf: [
            { type: "string" },
            { $ref: "#/$defs/alpha" },
            { type: "null" },
          ],
        },
      },
    });
    expect((exported?.schema as { $defs: Record<string, unknown> }).$defs.alpha).toBeDefined();
  });

  it("emits a ROOT-FORM kind as its root shape with no __kind injection", () => {
    const cases: Array<[KindSchema, unknown]> = [
      [
        { kind: "text", fields: {}, root: { type: "string" } },
        { type: "string" },
      ],
      [{ kind: "json", fields: {}, root: { type: "json" } }, {}],
      [
        { kind: "string_list", fields: {}, root: { type: "string[]" } },
        { type: "array", items: { type: "string" } },
      ],
      [
        {
          kind: "branch_result",
          fields: {},
          root: {
            type: "inline_object",
            open: true,
            fields: {
              value: { type: "json" },
              direction: { type: "string", required: true },
            },
          },
        },
        {
          type: "object",
          properties: { value: {}, direction: { type: "string" } },
          required: ["direction"],
          additionalProperties: true,
        },
      ],
    ];
    for (const [schema, expected] of cases) {
      const exported = kindSchemaToJsonSchema(
        schema.kind,
        (k) => (k === schema.kind ? schema : undefined),
        { strict: true }, // injectKind defaults true — root forms must ignore it
      );
      expect(exported?.schema).toEqual(expected);
    }
  });

  it("collects refs carried by a root form (collectSchemaReferencedKinds)", () => {
    const schemas: Record<string, KindSchema> = {
      wrapper: {
        kind: "wrapper",
        fields: {},
        root: { type: "array", itemKinds: ["alpha"] },
      },
      alpha: { kind: "alpha", fields: { name: { type: "string" } } },
    };
    expect(collectSchemaReferencedKinds(schemas.wrapper as KindSchema)).toEqual([
      "alpha",
    ]);
    const exported = kindSchemaToJsonSchema("wrapper", (k) => schemas[k], {
      injectKind: false,
    });
    expect(exported?.unresolved).toEqual([]);
    expect(
      (exported?.schema as { $defs?: Record<string, unknown> }).$defs?.alpha,
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Input-semantics constructs (W3-A agent-input bridge) — emission + round-trip
// ---------------------------------------------------------------------------

describe("input-semantics constructs — emit and round-trip", () => {
  const schema: KindSchema = {
    kind: "input_semantics_demo",
    fields: {
      audience: {
        type: "enum",
        values: ["kids", "adults"],
        open: true,
        description: "Who reads this",
        default: "adults",
        required: true,
      },
      tone: { type: "enum", values: ["formal", "casual"] },
      count: { type: "number", min: 1, max: 100, step: 1, default: 10 },
      topics: { type: "string[]", values: ["a", "b"], open: true },
      tags: { type: "string[]", values: ["x", "y"] },
      note: { type: "string", description: "Free text" },
    },
  };
  const soleResolve = (k: string): KindSchema | undefined =>
    k === schema.kind ? schema : undefined;

  it("emits open enums as anyOf [enum, string], bounds, items enums, description/default", () => {
    const exported = unwrap(
      kindSchemaToJsonSchema(schema.kind, soleResolve, { injectKind: false }),
    );
    const props = asRecord(at(exported.schema, "properties"));
    expect(props.audience).toEqual({
      anyOf: [
        { type: "string", enum: ["kids", "adults"] },
        { type: "string" },
      ],
      description: "Who reads this",
      default: "adults",
    });
    expect(props.tone).toEqual({ type: "string", enum: ["formal", "casual"] });
    expect(props.count).toEqual({
      type: "number",
      minimum: 1,
      maximum: 100,
      multipleOf: 1,
      default: 10,
    });
    expect(props.topics).toEqual({
      type: "array",
      items: {
        anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "string" }],
      },
    });
    expect(props.tags).toEqual({
      type: "array",
      items: { type: "string", enum: ["x", "y"] },
    });
    expect(props.note).toEqual({ type: "string", description: "Free text" });
    expect(asRecord(exported.schema).required).toEqual(["audience"]);
  });

  it("round-trips through runSchemaConversion with zero information loss", () => {
    const exported = unwrap(
      kindSchemaToJsonSchema(schema.kind, soleResolve, { injectKind: true }),
    );
    const conversion = runSchemaConversion(
      { name: schema.kind, schema: exported.schema },
      {},
    );
    expect(conversion.parseErrors).toEqual([]);
    expect(
      conversion.problems.filter((p) => p.severity === "error"),
    ).toEqual([]);
    const root = conversion.blockSchemas.find((d) => d.slug === schema.kind);
    expect(root?.fields).toEqual(schema.fields);
    // Nothing representable may land in droppedMetadata anymore.
    const droppedKeys = conversion.droppedMetadata.flatMap((d) =>
      Object.keys(d.dropped),
    );
    expect(droppedKeys).not.toContain("description");
    expect(droppedKeys).not.toContain("default");
    expect(droppedKeys).not.toContain("minimum");
    expect(droppedKeys).not.toContain("maximum");
    expect(droppedKeys).not.toContain("multipleOf");
  });

  it("nullable open enum keeps the null variant and reads back nullable+open", () => {
    const nullableSchema: KindSchema = {
      kind: "nullable_open_demo",
      fields: {
        pick: { type: "enum", values: ["a"], open: true, nullable: true },
      },
    };
    const exported = unwrap(
      kindSchemaToJsonSchema(
        nullableSchema.kind,
        (k) => (k === nullableSchema.kind ? nullableSchema : undefined),
        { injectKind: false },
      ),
    );
    expect(at(exported.schema, "properties", "pick")).toEqual({
      anyOf: [
        { type: "string", enum: ["a"] },
        { type: "string" },
        { type: "null" },
      ],
    });
    const conversion = runSchemaConversion(
      { name: nullableSchema.kind, schema: exported.schema },
      {},
    );
    const root = conversion.blockSchemas.find(
      (d) => d.slug === nullableSchema.kind,
    );
    expect(root?.fields).toEqual(nullableSchema.fields);
  });
});
