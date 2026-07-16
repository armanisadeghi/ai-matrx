/**
 * Kind ↔ content_ir storage shape — the pure, DB-free reshaping between the
 * consumed `KindSchema` and the `content_ir.kind_definition.data` array +
 * `content_ir.kind_edge` rows.
 *
 * Two exact inverses:
 *   - `kindSchemaToStorage`  — the MIGRATION / write direction: a parsed
 *     `KindSchema` (fields Record, targets inline) → an ORDERED `data` array
 *     (targets stripped) + externalized `kind_edge` specs (targets, keyed by
 *     field PATH). This is what pours `flexible_data` (and future authored
 *     kinds) into the canonical tables.
 *   - `storageToKindSchema`  — the ADAPTER / read direction: `data` array +
 *     edges → the same `KindSchema` the parser/emitter consume, re-attaching
 *     `object.kind` / `array.itemKinds` from the edges by path.
 *
 * Design invariants (KIND_REGISTRY_STORAGE.md §4):
 *   - The `data` element is `FieldSchema` + `name`, MINUS ref targets. Order is
 *     intrinsic to the array (fixes the jsonb key-reorder bug).
 *   - `kind_edge` is the SINGLE source of truth for kind→kind refs: `object`
 *     → one edge (position null); `array` → N edges (union) ordered by
 *     `position`. `field_name` is a dot-PATH so a ref nested inside an
 *     `inline_object` still gets a distinct, collision-free edge.
 *   - `inline_object` is structural: its `fields` is an ordered array, it never
 *     becomes a registry row and never carries `__kind`. Its nested refs DO get
 *     edges (path-prefixed) so cascade/pinning see every dependency. Its
 *     `open` flag persists on the element (losing it is the open-empty-object
 *     defect).
 *   - `union.kinds` refs externalize to edges exactly like `array.itemKinds`;
 *     the stored element keeps `hasKinds: true` so lost edges scream on read.
 *   - A NON-OBJECT ROOT (`KindSchema.root`) stores as ONE reserved element
 *     named `ROOT_STORAGE_NAME` ("__root") — the only element allowed in that
 *     kind's `data`. Real fields may never use the reserved name.
 *
 * NO imports of supabase / the DB — this is pure and unit-tested by round-trip
 * (`__tests__/kind-storage-transform.test.ts`).
 */

import type {
  FieldSchema,
  KindSchema,
  RecordValueType,
} from "../core/kind-schema.types";

/**
 * Reserved `data[]` element name for a NON-OBJECT ROOT form (`KindSchema.root`).
 * A root-form kind stores exactly one element under this name; the read
 * direction reconstructs `{ root }` instead of a field map. The write
 * direction rejects any REAL field with this name — the name is the marker.
 */
export const ROOT_STORAGE_NAME = "__root";

// ---------------------------------------------------------------------------
// Stored shapes (mirror content_ir.kind_definition.data + content_ir.kind_edge)
// ---------------------------------------------------------------------------

type StoredFieldBase = {
  name: string;
  required?: boolean;
  nullable?: boolean;
};

/** One element of `kind_definition.data` — FieldSchema + name, ref targets removed. */
export type StoredFieldElement =
  | (StoredFieldBase & { type: ScalarFieldType })
  | (StoredFieldBase & { type: "string[]" | "number[]" | "boolean[]" })
  | (StoredFieldBase & { type: "json" })
  | (StoredFieldBase & { type: "json[]" })
  | (StoredFieldBase & { type: "array" }) // ref array — targets live in edges
  | (StoredFieldBase & { type: "object" }) // single ref — target lives in edges
  | (StoredFieldBase & {
      type: "inline_object";
      fields: StoredFieldElement[];
      open?: boolean;
    })
  | (StoredFieldBase & { type: "record"; values: RecordValueType })
  | (StoredFieldBase & { type: "enum"; values: string[] })
  | (StoredFieldBase & {
      type: "union";
      scalars: Array<"string" | "number" | "boolean">;
      /** Marker that this union's kind refs live in edges (positions ordered). */
      hasKinds?: boolean;
    });

/** One `content_ir.kind_edge` row (child resolved to an id at insert time). */
export type KindEdgeSpec = {
  /** Field PATH in the parent's `data` (dot-notation into inline_objects). */
  fieldPath: string;
  /** Child kind slug — insert resolves this to `child_definition_id`. */
  childKind: string;
  /** Union (anyOf) ordering for array refs; null for a single object ref. */
  position: number | null;
};

/** The full write payload for one kind: the ordered data array + its edges. */
export type KindStorageShape = {
  data: StoredFieldElement[];
  edges: KindEdgeSpec[];
};

export class KindStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindStorageError";
  }
}

// ---------------------------------------------------------------------------
// WRITE direction: KindSchema → { data[], edges[] }
// ---------------------------------------------------------------------------

const PATH_SEP = ".";

function base(field: FieldSchema): StoredFieldBase & { name: string } {
  // name is filled by the caller; required/nullable copied only when true so
  // the stored element stays minimal (matches the emitter's optional reads).
  const out: { name: string; required?: boolean; nullable?: boolean } = {
    name: "",
  };
  if (field.required) out.required = true;
  if (field.nullable) out.nullable = true;
  return out;
}

/**
 * Reshape a field into its stored element, pushing any ref targets into `edges`
 * keyed by the field's full path. `path` is the dot-path of THIS field.
 */
function storeField(
  name: string,
  field: FieldSchema,
  path: string,
  edges: KindEdgeSpec[],
): StoredFieldElement {
  const b = { ...base(field), name };

  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "string[]":
    case "number[]":
    case "boolean[]":
    case "json":
    case "json[]":
      return { ...b, type: field.type };

    case "record":
      return { ...b, type: "record", values: field.values };

    case "enum":
      return { ...b, type: "enum", values: [...field.values] };

    case "union": {
      // Object-union members are refs → edges (positions ordered), exactly
      // like array itemKinds. `hasKinds` marks the element so the read
      // direction can scream about lost edges instead of silently narrowing.
      if (field.kinds && field.kinds.length > 0) {
        field.kinds.forEach((childKind, position) => {
          edges.push({ fieldPath: path, childKind, position });
        });
        return { ...b, type: "union", scalars: [...field.scalars], hasKinds: true };
      }
      return { ...b, type: "union", scalars: [...field.scalars] };
    }

    case "object":
      // Single ref → exactly one edge, no position.
      edges.push({ fieldPath: path, childKind: field.kind, position: null });
      return { ...b, type: "object" };

    case "array":
      // Ref array (union) → one edge per itemKind, ordered by position.
      field.itemKinds.forEach((childKind, position) => {
        edges.push({ fieldPath: path, childKind, position });
      });
      return { ...b, type: "array" };

    case "inline_object": {
      // Structural: recurse, prefixing nested paths so nested refs get their
      // own collision-free edges. Field order preserved (Object.entries).
      const fields: StoredFieldElement[] = [];
      for (const [childName, childField] of Object.entries(field.fields)) {
        fields.push(
          storeField(
            childName,
            childField,
            `${path}${PATH_SEP}${childName}`,
            edges,
          ),
        );
      }
      // `open` persists on the element — losing it is the open-empty-object
      // defect (an open {} materializing as CLOSED).
      return field.open
        ? { ...b, type: "inline_object", fields, open: true }
        : { ...b, type: "inline_object", fields };
    }
  }
}

/**
 * MIGRATION / write direction. Order of `data` follows `Object.entries(fields)`
 * — the caller supplies the KindSchema whose field order is authoritative
 * (prefer the compiled `system-kinds.ts` order for system kinds during the
 * one-time flexible_data migration; jsonb order is the fallback for user kinds).
 */
export function kindSchemaToStorage(schema: KindSchema): KindStorageShape {
  const data: StoredFieldElement[] = [];
  const edges: KindEdgeSpec[] = [];

  if (schema.root) {
    // Non-object root form: exactly one reserved element carries the root
    // field; a field map alongside it would be two contradictory shapes.
    if (Object.keys(schema.fields).length > 0) {
      throw new KindStorageError(
        `kind "${schema.kind}": root form and a non-empty fields map are mutually exclusive.`,
      );
    }
    data.push(storeField(ROOT_STORAGE_NAME, schema.root, ROOT_STORAGE_NAME, edges));
    return { data, edges };
  }

  for (const [name, field] of Object.entries(schema.fields)) {
    if (name === ROOT_STORAGE_NAME) {
      throw new KindStorageError(
        `kind "${schema.kind}": field name "${ROOT_STORAGE_NAME}" is reserved for the non-object root form.`,
      );
    }
    data.push(storeField(name, field, name, edges));
  }
  return { data, edges };
}

// ---------------------------------------------------------------------------
// READ direction: { data[], edges[] } → KindSchema  (the adapter's core)
// ---------------------------------------------------------------------------

/** Index edges by field path for O(1) re-attachment. */
function indexEdges(edges: KindEdgeSpec[]): Map<string, KindEdgeSpec[]> {
  const byPath = new Map<string, KindEdgeSpec[]>();
  for (const edge of edges) {
    const list = byPath.get(edge.fieldPath);
    if (list) list.push(edge);
    else byPath.set(edge.fieldPath, [edge]);
  }
  return byPath;
}

function restoreField(
  element: StoredFieldElement,
  path: string,
  byPath: Map<string, KindEdgeSpec[]>,
): FieldSchema {
  const b: { required?: boolean; nullable?: boolean } = {};
  if (element.required) b.required = true;
  if (element.nullable) b.nullable = true;

  switch (element.type) {
    case "string":
    case "number":
    case "boolean":
    case "string[]":
    case "number[]":
    case "boolean[]":
    case "json":
    case "json[]":
      return { ...b, type: element.type };

    case "record":
      return { ...b, type: "record", values: element.values };

    case "enum":
      return { ...b, type: "enum", values: [...element.values] };

    case "union": {
      const list = byPath.get(path) ?? [];
      if (element.hasKinds) {
        if (list.length === 0) {
          throw new KindStorageError(
            `union field "${path}" declares kind members (hasKinds) but has no edges.`,
          );
        }
        const kinds = [...list]
          .sort((a, z) => (a.position ?? 0) - (z.position ?? 0))
          .map((e) => e.childKind);
        return { ...b, type: "union", scalars: [...element.scalars], kinds };
      }
      if (list.length > 0) {
        throw new KindStorageError(
          `union field "${path}" has ${list.length} edge(s) but does not declare hasKinds.`,
        );
      }
      return { ...b, type: "union", scalars: [...element.scalars] };
    }

    case "object": {
      const list = byPath.get(path) ?? [];
      if (list.length !== 1) {
        throw new KindStorageError(
          `object field "${path}" must have exactly one edge, found ${list.length}.`,
        );
      }
      const [edge] = list;
      if (!edge) {
        throw new KindStorageError(
          `object field "${path}" must have exactly one edge, found 0.`,
        );
      }
      return { ...b, type: "object", kind: edge.childKind };
    }

    case "array": {
      const list = byPath.get(path) ?? [];
      if (list.length === 0) {
        throw new KindStorageError(
          `array field "${path}" must have at least one edge.`,
        );
      }
      const itemKinds = [...list]
        .sort((a, z) => (a.position ?? 0) - (z.position ?? 0))
        .map((e) => e.childKind);
      return { ...b, type: "array", itemKinds };
    }

    case "inline_object": {
      const fields: Record<string, FieldSchema> = {};
      for (const child of element.fields) {
        fields[child.name] = restoreField(
          child,
          `${path}${PATH_SEP}${child.name}`,
          byPath,
        );
      }
      return element.open
        ? { ...b, type: "inline_object", fields, open: true }
        : { ...b, type: "inline_object", fields };
    }
  }
}

/** ADAPTER / read direction — the exact inverse of `kindSchemaToStorage`. */
export function storageToKindSchema(
  kind: string,
  shape: KindStorageShape,
): KindSchema {
  const byPath = indexEdges(shape.edges);

  // Non-object root form: the single reserved element IS the root field.
  const [first] = shape.data;
  if (first && first.name === ROOT_STORAGE_NAME) {
    if (shape.data.length !== 1) {
      throw new KindStorageError(
        `kind "${kind}": a "${ROOT_STORAGE_NAME}" element must be the only data element (found ${shape.data.length}).`,
      );
    }
    return {
      kind,
      fields: {},
      root: restoreField(first, ROOT_STORAGE_NAME, byPath),
    };
  }

  const fields: Record<string, FieldSchema> = {};
  for (const element of shape.data) {
    if (element.name === ROOT_STORAGE_NAME) {
      throw new KindStorageError(
        `kind "${kind}": "${ROOT_STORAGE_NAME}" must be the first and only data element.`,
      );
    }
    fields[element.name] = restoreField(element, element.name, byPath);
  }
  return { kind, fields };
}
