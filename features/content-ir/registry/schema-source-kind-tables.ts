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

/**
 * A kind slug resolved to more than one live row. The slug is a GLOBAL
 * identifier — `__kind` in a stream, a fence language, a `kind_surface` token —
 * so two rows sharing one is never a tenancy nuance, it is a data defect that
 * makes render routing ambiguous. Loud, never silent: the recovery keeps the
 * first row so the rest of the registry survives, and this scream is how the
 * offending row gets found and removed.
 */
function reportDuplicateKindSlug(kind: string, ignoredId: string): void {
  const message = `Duplicate kind slug "${kind}" — ignoring definition ${ignoredId}.`;
  void import("@/lib/diagnostics/errorCaptureStore")
    .then(({ captureError }) =>
      captureError({
        source: "data-shape",
        schema: "content_ir",
        relation: "kind_definition",
        message,
        hint:
          "Kind slugs are globally unique (kind_definition_global_slug_unique). " +
          "Soft-delete or rename the duplicate.",
        callSite: "reconstructKindRegistry",
      }),
    )
    .catch(() => {
      /* diagnostics must never break a registry load */
    });
  console.error(`[content_ir] ${message}`);
}

/** Minimal projections the pure reconstruction needs (decoupled from full Row). */
export interface KindDefProjection {
  id: string;
  kind: string;
  label: string;
  data: Json;
  /** Dual-gate render-trust flag; optional so schema-only callers stay valid. */
  is_active?: boolean | null;
  /** Raw `kind_definition.metadata` (family / data_only live here). */
  metadata?: Json | null;
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
 *
 * A scalar/passthrough kind (`text`, `number`, `boolean`, `json`,
 * `string_list`, the workflow node-result kinds, …) has NO named fields, so its
 * `data` is stored as SQL `null`. That is a valid empty field map — normalize
 * it to `[]`, never a malformed row.
 */
function asStoredData(value: Json, kind: string): StoredFieldElement[] {
  if (value === null || value === undefined) return [];
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
      // A duplicate slug is a DATA defect (the DB now blocks it — see
      // `migrations/kind_definition_global_slug_unique.sql`), never a reason to
      // take down the ENTIRE registry. This line used to throw, so one
      // colliding row — e.g. a user creating `flashcard_set` in their own org
      // while the platform row exists — killed the warm load for that user and
      // every kind stopped rendering. Keep the first row, scream, carry on.
      reportDuplicateKindSlug(d.kind, d.id);
      continue;
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
      entries.push({
        id: d.id,
        label: d.label,
        slug: d.kind,
        fields: schema.fields,
        ...(d.is_active !== undefined && d.is_active !== null
          ? { isActive: d.is_active }
          : {}),
        family: kindFamilyFromMetadata(d.metadata ?? null),
        loadingComponent: kindLoadingComponentFromMetadata(d.metadata ?? null),
      });
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

const DEF_COLUMNS = "id, kind, label, data, is_active, metadata" as const;

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

/** Cold-tier result: the schema plus the render-relevant definition metadata. */
export interface KindSchemaAndMeta {
  schema: KindSchema | null;
  /** `metadata.loading_component` — loading-library slug (null = default). */
  loadingComponent: string | null;
}

/** Cold tier: one kind by slug (+ its edges, child ids resolved), null when absent. */
export async function getKindSchemaBySlugFromTables(
  kind: string,
): Promise<KindSchema | null> {
  const result = await getKindSchemaAndMetaBySlugFromTables(kind);
  return result?.schema ?? null;
}

/**
 * Cold tier with render metadata: same single-kind read, but ALSO returns the
 * definition's `loading_component` slug so the streaming loading layer can
 * pick the right loader without a second round-trip. Null when the kind slug
 * does not exist.
 */
export async function getKindSchemaAndMetaBySlugFromTables(
  kind: string,
): Promise<KindSchemaAndMeta | null> {
  const supabase = await getSupabase();

  // `.limit(2)` + manual pick, NOT `.maybeSingle()`: a duplicated slug made
  // PostgREST return PGRST116 ("multiple rows"), which threw and broke this
  // kind for every user who could see both rows. The DB now prevents the
  // duplicate; this stays defensive-and-loud so a future one degrades to "the
  // first row renders" instead of an exception.
  const { data: defs, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind, label, data, metadata")
    .eq("kind", kind)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(2);
  if (defErr) {
    throw new KindTablesError(`Failed to fetch kind "${kind}": ${defErr.message}`);
  }
  const def = defs?.[0];
  if (!def) return null;
  if (defs && defs.length > 1) {
    reportDuplicateKindSlug(kind, defs[1].id);
  }

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

  const loadingComponent = kindLoadingComponentFromMetadata(def.metadata ?? null);
  try {
    return {
      schema: storageToKindSchema(def.kind, {
        data: asStoredData(def.data, def.kind),
        edges: specs,
      }),
      loadingComponent,
    };
  } catch (err) {
    // A malformed kind reads as schema-absent (→ compiled-floor fallback),
    // never a throw — the loading slug still surfaces.
    console.warn(
      `[content_ir] cold-fetch skipped malformed kind "${kind}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { schema: null, loadingComponent };
  }
}

/** The result of `getKindInputContractBySlug` — null when the kind is unknown. */
export interface KindInputContract {
  /** Reconstructed field schema — null for python-owned kinds whose `data` is empty. */
  schema: KindSchema | null;
  /** The materialized `kind_definition.emitted_json_schema` — the structural-leg authority. */
  emittedJsonSchema: Json | null;
  /**
   * True when the kind is a generated data-only machine contract
   * (`metadata.data_only` or a generated contract family) — machines fill
   * these, humans never do. The input routing law refuses them even if a
   * stray input-role component row exists (enforced invariant, not data
   * hygiene).
   */
  dataOnly: boolean;
}

/** The generated machine-contract families (mirrors aidream ContractFamily). */
export const GENERATED_CONTRACT_FAMILY_VALUES: ReadonlySet<string> = new Set([
  "action_io",
  "tool_io",
  "workflow_io",
  "agent_io",
]);

/**
 * `kind_definition.metadata.family` when present (generated machine contracts
 * stamp `agent_io` / `tool_io` / `action_io` / `workflow_io`; some display
 * groups stamp e.g. `render_block`). Null for plain display kinds.
 */
/**
 * `kind_definition.metadata.loading_component` — the loading-library slug the
 * render seam shows while an instance of this kind streams in (see
 * features/content-ir/react/loading/). Null = the generic default.
 */
export function kindLoadingComponentFromMetadata(
  metadata: Json | null,
): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const slug = (metadata as Record<string, Json | undefined>).loading_component;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

export function kindFamilyFromMetadata(metadata: Json | null): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const family = (metadata as Record<string, Json | undefined>).family;
  return typeof family === "string" && family.length > 0 ? family : null;
}

function isDataOnlyKindMetadata(metadata: Json | null): boolean {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const record = metadata as Record<string, Json | undefined>;
  if (record.data_only === true) return true;
  return (
    typeof record.family === "string" &&
    GENERATED_CONTRACT_FAMILY_VALUES.has(record.family)
  );
}

/**
 * Cold tier for the INPUT path (D1): one kind's field schema PLUS its
 * `emitted_json_schema` in the same read pattern. `KindInputForm` validates
 * assembled instances against `emittedJsonSchema` via `validateStructuralLeg`
 * (the activation gate's own ajv leg) — the field schema alone cannot play
 * that role, and a python-owned kind has no stored field list at all.
 * Returns null only when the kind slug does not exist (the caller screams).
 */
export async function getKindInputContractBySlug(
  kind: string,
): Promise<KindInputContract | null> {
  const supabase = await getSupabase();

  const { data: def, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, emitted_json_schema, metadata")
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle();
  if (defErr) {
    throw new KindTablesError(
      `Failed to fetch input contract for "${kind}": ${defErr.message}`,
    );
  }
  if (!def) return null;

  const schema = await getKindSchemaBySlugFromTables(kind);
  return {
    schema,
    emittedJsonSchema: def.emitted_json_schema,
    dataOnly: isDataOnlyKindMetadata(def.metadata),
  };
}
