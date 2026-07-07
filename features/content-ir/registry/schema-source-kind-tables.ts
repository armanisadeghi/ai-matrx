/**
 * content_ir-backed schema source — the CANONICAL replacement for
 * schema-source-flexible-data. Reads `content_ir.kind_definition` (+ its
 * `content_ir.kind_edge` ref graph) and reconstructs the `KindSchema` the
 * parser/emitter consume, via the round-trip-proven `storageToKindSchema`.
 *
 * The only place content_ir schema reads may live (the lint-enforced chokepoint
 * that flexible-data was). Edges reference children by `child_definition_id`
 * (canonical FK), so reconstruction resolves those ids back to kind slugs.
 *
 * NOT yet wired into `kindRegistry` — the cutover (repointing the registry from
 * flexible-data to here) happens after the one-time data migration populates
 * the tables and parity is verified.
 */

import type { Database, Json } from "@/types/database.types";
import type { KindSchema } from "../core/kind-schema.types";
import {
  storageToKindSchema,
  type KindEdgeSpec,
  type StoredFieldElement,
} from "./kind-storage-transform";
import type { BlockSchemaEntry, BlockSchemaRegistry } from "./schema-source-flexible-data";

async function getSupabase() {
  const { supabase } = await import("@/utils/supabase/client");
  return supabase;
}

type KindDefinitionRow =
  Database["content_ir"]["Tables"]["kind_definition"]["Row"];
type KindEdgeRow = Database["content_ir"]["Tables"]["kind_edge"]["Row"];

export class KindTablesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindTablesError";
  }
}

/** Minimal projections the pure reconstruction needs (decoupled from full Row). */
export interface KindDefProjection {
  id: string;
  kind: string;
  label: string;
  data: Json;
}
export interface KindEdgeProjection {
  parent_definition_id: string;
  field_name: string;
  child_definition_id: string;
  position: number | null;
}

/**
 * Loud guard: `kind_definition.data` must be the ordered `StoredFieldElement[]`
 * our transform wrote. We validate the array-of-named-typed-objects shape and
 * let `storageToKindSchema` enforce the rest; a malformed row throws rather
 * than silently yielding an empty kind.
 */
function asStoredData(value: Json, kind: string): StoredFieldElement[] {
  if (!Array.isArray(value)) {
    throw new KindTablesError(`kind "${kind}": data must be a JSON array.`);
  }
  for (const el of value) {
    if (
      !el ||
      typeof el !== "object" ||
      Array.isArray(el) ||
      typeof (el as { name?: unknown }).name !== "string" ||
      typeof (el as { type?: unknown }).type !== "string"
    ) {
      throw new KindTablesError(
        `kind "${kind}": each data element needs string "name" and "type".`,
      );
    }
  }
  return value as unknown as StoredFieldElement[];
}

/**
 * PURE reconstruction: rows (+ edges) → the registry's `{ schemas, entries }`.
 * Resolves each edge's `child_definition_id` to the child's kind slug via the
 * id→slug map, so the single source of truth for refs (the edge table) rebuilds
 * `object.kind` / `array.itemKinds` exactly. Unit-tested without a DB.
 */
export function reconstructKindRegistry(
  defs: KindDefProjection[],
  edges: KindEdgeProjection[],
): BlockSchemaRegistry {
  const slugById = new Map<string, string>();
  for (const d of defs) slugById.set(d.id, d.kind);

  // Group edges by parent, resolving child ids → slugs (dropping any dangling
  // child — an FK-restricted table shouldn't have them, but be defensive).
  const edgesByParent = new Map<string, KindEdgeSpec[]>();
  for (const e of edges) {
    const childKind = slugById.get(e.child_definition_id);
    if (!childKind) continue;
    const spec: KindEdgeSpec = {
      fieldPath: e.field_name,
      childKind,
      position: e.position,
    };
    const list = edgesByParent.get(e.parent_definition_id);
    if (list) list.push(spec);
    else edgesByParent.set(e.parent_definition_id, [spec]);
  }

  const schemas: Record<string, KindSchema> = {};
  const entries: BlockSchemaEntry[] = [];
  for (const d of defs) {
    if (schemas[d.kind]) {
      throw new KindTablesError(`duplicate kind slug "${d.kind}".`);
    }
    // Per-kind resilience (loud recovery): a single malformed kind — e.g. a
    // ref field whose edge is missing (a dangling child), or corrupt `data` —
    // must NOT take down the whole warm load. Skip it + scream; the compiled
    // floor covers anything genuinely needed, and a broken kind was unusable
    // anyway. This is a recovery path firing → a real data defect upstream.
    try {
      const schema = storageToKindSchema(d.kind, {
        data: asStoredData(d.data, d.kind),
        edges: edgesByParent.get(d.id) ?? [],
      });
      schemas[d.kind] = schema;
      entries.push({ id: d.id, label: d.label, slug: d.kind, fields: schema.fields });
    } catch (err) {
      console.warn(
        `[content_ir] skipped malformed kind "${d.kind}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { schemas, entries };
}

const DEF_COLUMNS = "id, kind, label, data" as const;

/**
 * Warm tier: every non-deleted kind's SCHEMA in one pair of reads.
 *
 * NOT filtered on `is_active`. `is_active` is the dual-gate verdict that gates
 * whether a kind is trusted to RENDER (Arman's law) + the flag that drives the
 * fix — it does NOT gate schema availability. Parsing/speculation needs every
 * kind's schema regardless of whether its SAMPLE has been validated (filtering
 * here would silently drop kinds that lack a sample and regress the parser).
 */
export async function listKindSchemasFromTables(): Promise<BlockSchemaRegistry> {
  const supabase = await getSupabase();

  const { data: defRows, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select(DEF_COLUMNS)
    .is("deleted_at", null);
  if (defErr) {
    throw new KindTablesError(`Failed to list kind_definition: ${defErr.message}`);
  }

  const { data: edgeRows, error: edgeErr } = await supabase
    .schema("content_ir")
    .from("kind_edge")
    .select("parent_definition_id, field_name, child_definition_id, position")
    .is("deleted_at", null);
  if (edgeErr) {
    throw new KindTablesError(`Failed to list kind_edge: ${edgeErr.message}`);
  }

  return reconstructKindRegistry(
    (defRows ?? []) as KindDefProjection[],
    (edgeRows ?? []) as KindEdgeProjection[],
  );
}

/** Cold tier: one kind by slug (+ its edges, child ids resolved), null when absent. */
export async function getKindSchemaBySlugFromTables(
  kind: string,
): Promise<KindSchema | null> {
  const supabase = await getSupabase();

  const { data: def, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind, label, data")
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle();
  if (defErr) {
    throw new KindTablesError(`Failed to fetch kind "${kind}": ${defErr.message}`);
  }
  if (!def) return null;

  const { data: edgeRows, error: edgeErr } = await supabase
    .schema("content_ir")
    .from("kind_edge")
    .select("child_definition_id, field_name, position")
    .eq("parent_definition_id", def.id)
    .is("deleted_at", null);
  if (edgeErr) {
    throw new KindTablesError(`Failed to fetch edges for "${kind}": ${edgeErr.message}`);
  }

  // Resolve the child ids for THIS kind's edges to slugs (a small `in` read).
  const childIds = [...new Set((edgeRows ?? []).map((e) => e.child_definition_id))];
  const slugById = new Map<string, string>();
  if (childIds.length > 0) {
    const { data: children, error: childErr } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id, kind")
      .is("deleted_at", null)
      .in("id", childIds);
    if (childErr) {
      throw new KindTablesError(
        `Failed to resolve child kinds for "${kind}": ${childErr.message}`,
      );
    }
    for (const c of children ?? []) slugById.set(c.id, c.kind);
  }

  const specs: KindEdgeSpec[] = [];
  for (const e of edgeRows ?? []) {
    const childKind = slugById.get(e.child_definition_id);
    if (childKind) {
      specs.push({ fieldPath: e.field_name, childKind, position: e.position });
    }
  }

  try {
    return storageToKindSchema(def.kind, {
      data: asStoredData(def.data, def.kind),
      edges: specs,
    });
  } catch (err) {
    // A malformed kind reads as absent (→ compiled-floor fallback), never a throw.
    console.warn(
      `[content_ir] cold-fetch skipped malformed kind "${kind}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
