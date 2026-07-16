/**
 * KindSchema → provider-ready JSON Schema — the REVERSE of the OpenAI
 * converter in openai-schema-converter.ts.
 *
 * The requested root kind renders INLINE as the top-level object; every
 * OTHER kind it transitively references (via `{type:"object", kind}` and
 * `{type:"array", itemKinds}` fields, including inside inline_objects)
 * becomes a `$defs` entry referenced with `$ref: "#/$defs/<slug>"`.
 * References back to the ROOT kind use `"#"` — the standard JSON Schema
 * recursive-root reference (OpenAI structured outputs support both forms).
 * Collection is cycle-safe: each kind enters the closure exactly once.
 *
 * Round-trip contract — output fed through `runSchemaConversion`
 * (openai-schema-converter.ts) reproduces the source KindSchemas for the
 * root and every array-item child (enforced by
 * __tests__/kind-to-json-schema.test.ts). The 2026-07-15 expressivity
 * extension closed the three historical asymmetries: `record` now has a
 * forward target (properties-less objects → record scalar/json), multi-
 * itemKind arrays read back through items-anyOf when each variant declares
 * its `__kind`, and nullable anyOf preserves the member list + nullable flag
 * instead of flattening to `string`. Remaining accepted narrowings:
 * - multi-kind array items emitted as $refs (not inline __kind objects)
 *   still cannot be read back — the forward converter rejects $ref.
 * - a nullable object-REF (`anyOf: [$ref, {type:"null"}]`) degrades for the
 *   same $ref reason.
 * - JSON Schema `integer` narrows to `number` (the map_result precedent).
 */

import {
  scalarArrayItemType,
  type FieldSchema,
  type KindSchema,
} from "../core/kind-schema.types";
import {
  injectKindIntoObjectSchema,
  type JsonSchemaNode,
} from "./openai-schema-converter";

export type KindJsonSchemaOptions = {
  /**
   * Provider strict mode: additionalProperties:false on every kind object
   * and inline object, and `const` (vs `enum`) __kind discriminators —
   * mirrors makeKindJsonSchemaProperty / injectKindIntoObjectSchema.
   */
  strict?: boolean;
  /**
   * Inject the `__kind` discriminator (+ required) into the root and every
   * $defs kind object. Default true — this is what makes the emitted
   * objects self-identifying for the render pipeline.
   */
  injectKind?: boolean;
};

export type KindJsonSchemaExport = {
  /** The root kind slug — doubles as the provider schema name. */
  name: string;
  schema: JsonSchemaNode;
  strict: boolean;
  /**
   * Referenced kinds the resolver could not supply. Each still gets a
   * permissive `$defs` object stub (never additionalProperties:false, even
   * in strict mode — a __kind-only strict object would reject every real
   * payload) so the export stays structurally valid. Surface these loudly.
   */
  unresolved: string[];
};

/**
 * Every kind referenced by a field map — `{type:"object", kind}` refs and
 * `{type:"array", itemKinds}` members, recursing through inline_objects.
 * First-sighting order, deduplicated. Shared read helper (the registry
 * catalog builds its uses / used-by graph from this).
 */
export function collectReferencedKinds(
  fields: Record<string, FieldSchema>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (kind: string): void => {
    if (!seen.has(kind)) {
      seen.add(kind);
      out.push(kind);
    }
  };
  const visit = (field: FieldSchema): void => {
    if (field.type === "object") {
      add(field.kind);
    } else if (field.type === "array") {
      field.itemKinds.forEach(add);
    } else if (field.type === "union") {
      (field.kinds ?? []).forEach(add);
    } else if (field.type === "inline_object") {
      Object.values(field.fields).forEach(visit);
    }
  };
  Object.values(fields).forEach(visit);
  return out;
}

/**
 * Schema-level referenced kinds — field-map refs PLUS the refs a non-object
 * root form carries. Use this (not `collectReferencedKinds(schema.fields)`)
 * whenever the schema in hand may be root-form.
 */
export function collectSchemaReferencedKinds(schema: KindSchema): string[] {
  if (!schema.root) return collectReferencedKinds(schema.fields);
  return collectReferencedKinds({ [ROOT_REF_FIELD]: schema.root });
}

/** Synthetic field key used only to reuse the field-walker for root forms. */
const ROOT_REF_FIELD = "__root";

export function kindSchemaToJsonSchema(
  kind: string,
  resolve: (kind: string) => KindSchema | undefined,
  options: KindJsonSchemaOptions = {},
): KindJsonSchemaExport | null {
  const strict = options.strict ?? false;
  const injectKind = options.injectKind ?? true;

  const rootSchema = resolve(kind);
  if (!rootSchema) return null;

  // Transitive closure — BFS from the root, cycle-safe via `visited`.
  const visited = new Set<string>([kind]);
  const defsOrder: string[] = [];
  const resolvedDefs = new Map<string, KindSchema>();
  const unresolved: string[] = [];
  const queue = collectSchemaReferencedKinds(rootSchema);
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (visited.has(next)) continue;
    visited.add(next);
    defsOrder.push(next);
    const schema = resolve(next);
    if (!schema) {
      unresolved.push(next);
      continue;
    }
    resolvedDefs.set(next, schema);
    queue.push(...collectSchemaReferencedKinds(schema));
  }

  const refFor = (slug: string): JsonSchemaNode =>
    slug === kind ? { $ref: "#" } : { $ref: `#/$defs/${slug}` };

  const withNull = (type: string, nullable: boolean | undefined) =>
    nullable ? [type, "null"] : type;

  /**
   * Annotation carry: description / default emit beside the structural
   * schema (input-semantics extension, W3-A). Applied to every field node —
   * including anyOf wrappers (open enums), where they belong on the OUTER
   * node so the forward converter reads them back symmetrically.
   */
  function fieldToJsonSchema(field: FieldSchema): JsonSchemaNode {
    const node = fieldToJsonSchemaCore(field);
    if (field.description !== undefined) node.description = field.description;
    if (field.default !== undefined) node.default = field.default;
    return node;
  }

  function fieldToJsonSchemaCore(field: FieldSchema): JsonSchemaNode {
    switch (field.type) {
      case "string":
      case "boolean":
        return { type: withNull(field.type, field.nullable) };

      case "number":
        return {
          type: withNull("number", field.nullable),
          ...(field.min !== undefined ? { minimum: field.min } : {}),
          ...(field.max !== undefined ? { maximum: field.max } : {}),
          ...(field.step !== undefined ? { multipleOf: field.step } : {}),
        };

      case "json":
        // Any JSON value — the empty schema. (Nullable is inherent: null IS
        // a JSON value.)
        return {};

      case "string[]": {
        // Items-enum (checkbox option sets): closed → items string enum;
        // open → items anyOf [enum, string] (the set survives as guidance).
        const items: JsonSchemaNode =
          field.values === undefined
            ? { type: "string" }
            : field.open
              ? {
                  anyOf: [
                    { type: "string", enum: [...field.values] },
                    { type: "string" },
                  ],
                }
              : { type: "string", enum: [...field.values] };
        return { type: withNull("array", field.nullable), items };
      }

      case "number[]":
      case "boolean[]":
        return {
          type: withNull("array", field.nullable),
          items: { type: scalarArrayItemType(field.type) },
        };

      case "json[]":
        return {
          type: withNull("array", field.nullable),
          items: {},
        };

      case "enum": {
        if (!field.open) {
          return {
            type: withNull("string", field.nullable),
            enum: [...field.values],
          };
        }
        // OPEN enum — "these options OR any string". anyOf keeps the option
        // set intact for providers instead of widening to a bare string.
        const variants: JsonSchemaNode[] = [
          { type: "string", enum: [...field.values] },
          { type: "string" },
        ];
        if (field.nullable) variants.push({ type: "null" });
        return { anyOf: variants };
      }

      case "union": {
        const variants: JsonSchemaNode[] = field.scalars.map((scalar) => ({
          type: scalar,
        }));
        for (const memberKind of field.kinds ?? []) {
          variants.push(refFor(memberKind));
        }
        if (field.nullable) variants.push({ type: "null" });
        return { anyOf: variants };
      }

      case "record":
        return {
          type: withNull("object", field.nullable),
          additionalProperties:
            field.values === "json" ? true : { type: field.values },
        };

      case "inline_object": {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [name, child] of Object.entries(field.fields)) {
          properties[name] = fieldToJsonSchema(child);
          if (child.required) required.push(name);
        }
        // `open` ALWAYS wins over strict: pinning an open object with
        // additionalProperties:false is the open-empty-object defect (an open
        // {} that rejects every real payload).
        return {
          type: withNull("object", field.nullable),
          properties,
          required,
          ...(field.open
            ? { additionalProperties: true }
            : strict
              ? { additionalProperties: false }
              : {}),
        };
      }

      case "object":
        return field.nullable
          ? { anyOf: [refFor(field.kind), { type: "null" }] }
          : refFor(field.kind);

      case "array": {
        const [soleItemKind] = field.itemKinds;
        const items =
          field.itemKinds.length === 1 && soleItemKind !== undefined
            ? refFor(soleItemKind)
            : { anyOf: field.itemKinds.map(refFor) };
        return { type: withNull("array", field.nullable), items };
      }
    }
  }

  function kindObjectSchema(schema: KindSchema): JsonSchemaNode {
    // Root-form kind: the value IS the root field's shape — no __kind
    // discriminator (a scalar/array/any root cannot carry one).
    if (schema.root) {
      return fieldToJsonSchema(schema.root);
    }
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [name, field] of Object.entries(schema.fields)) {
      properties[name] = fieldToJsonSchema(field);
      if (field.required) required.push(name);
    }
    const node: JsonSchemaNode = {
      type: "object",
      properties,
      required,
      ...(strict ? { additionalProperties: false } : {}),
    };
    return injectKind
      ? injectKindIntoObjectSchema(node, schema.kind, strict)
      : node;
  }

  function unresolvedStub(slug: string): JsonSchemaNode {
    const node: JsonSchemaNode = {
      type: "object",
      description: `Unresolved kind "${slug}" — schema not available at export time.`,
    };
    // Deliberately never strict: a __kind-only object pinned with
    // additionalProperties:false would reject every real payload.
    return injectKind ? injectKindIntoObjectSchema(node, slug, false) : node;
  }

  const rootNode = kindObjectSchema(rootSchema);

  if (defsOrder.length === 0) {
    return { name: kind, schema: rootNode, strict, unresolved };
  }

  const defs: Record<string, JsonSchemaNode> = {};
  for (const slug of defsOrder) {
    const schema = resolvedDefs.get(slug);
    defs[slug] = schema ? kindObjectSchema(schema) : unresolvedStub(slug);
  }

  return { name: kind, schema: { ...rootNode, $defs: defs }, strict, unresolved };
}
