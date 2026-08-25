/**
 * content_ir-backed component-resolver source (Shape System ruling R1).
 * Reads `content_ir.kind_component` — the (kind, platform, role) →
 * `component_key` registry — resolving each row's `kind_definition_id` back
 * to its kind slug, following the schema-source-kind-tables.ts conventions
 * (browser supabase client, `.schema("content_ir")`, per-row resilient,
 * deleted_at aware).
 *
 * NOT filtered on `is_active`. The resolver seam (ruling R6) needs inactive
 * rows too: a DB-only kind whose component row is inactive must be
 * KNOWN-inactive (→ do not route, today's un-routed rendering) rather than
 * unknown. Filtering here would silently promote "held" kinds to "unknown"
 * and lose the gate.
 */

import type { Json } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";

async function getSupabase() {
  const { supabase } = await import("@/utils/supabase/client");
  return supabase;
}

export class KindComponentTablesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindComponentTablesError";
  }
}

/** One resolver row, kind_definition_id already resolved to the kind slug. */
export interface KindComponentProjection {
  kind: string;
  platform: string;
  role: string;
  componentKey: string;
  source: string;
  isActive: boolean;
  config: JsonObject;
  /**
   * `source='db'` rows: the user-authored component body — TSX/JSX compiled
   * in-page via the shared allowlist compiler, or (config.flavor='html') a
   * full HTML document rendered in a sandboxed iframe. Null for bundled rows.
   */
  componentSource: string | null;
  /**
   * Optional transform applied to the kind instance value BEFORE it reaches
   * the compiled component (same semantics as tool_ui's transform code): a
   * compiled `(data) => data` function body. Null = pass the value through.
   */
  propsTransform: string | null;
  /** Pin the component to a specific kind version (null = current). */
  pinnedKindVersion: number | null;
  /**
   * Row freshness — folded into the db-component compile-cache key so a
   * re-warm (refreshKindComponents) naturally recompiles edited components.
   */
  updatedAt: string;
  /** Deterministic-tiebreaker inputs (see sortKindComponentRows). */
  createdAt: string;
  id: string;
  /**
   * The row's author — drives the in-render ownership affordance (the
   * "fix this component" badge shows only to the creator or a super admin).
   */
  createdBy: string | null;
}

/**
 * THE generic fallback's component key — the platform-wide ONE spelling.
 * `@ai-matrx/content-ir-react` owns and exports this name (re-exported by
 * react/kind-route.ts); every non-react module that cannot reach the react
 * layer mirrors THE SAME NAME here, never a second one. This literal MUST
 * equal the package's export and `content_ir.evaluate_kind_activation`'s
 * render leg; it is mirrored rather than imported for the same reason
 * system-components.ts mirrors it — importing it pulls this registry module
 * into the react layer and closes an import cycle. Equality is pinned by
 * `__tests__/db-kind-component.test.tsx`.
 */
export const GENERIC_STRUCTURED_COMPONENT_KEY = "generic_structured";

/**
 * THE deterministic row order — the ingest contract (first row per (kind,
 * platform, role) wins): `fallback LAST, is_default DESC, sort_order ASC,
 * created_at ASC, id ASC`. `is_default` is a PREFERENCE among db rows, not a
 * trust gate; without the created_at/id tiebreakers two equal-priority rows
 * would resolve by DB physical order. Applied in SQL AND re-applied here
 * (defense in depth; also the unit-test seam).
 *
 * A FALLBACK MUST NEVER OUTRANK A REAL COMPONENT (Arman, 2026-08-23). The
 * `generic_structured` key is the platform's can-never-fail viewer, not a
 * component, so it sorts BELOW every real row regardless of its flags — the
 * first comparison, ahead of `is_default`. 382 live rows carried
 * `is_default = true` and beat purpose-built components that did not also set
 * the flag (`seo_keyword_relationship_research_result` and
 * `research_setup_suggestion` both rendered as the generic key/value dump).
 * The database now coerces those rows too (trigger
 * `zzz_demote_generic_fallback` + constraint
 * `kind_component_fallback_is_never_default`); this is the second wall, and
 * the one that holds for rows the warm tier projects without the flags.
 */
export function sortKindComponentRows<
  T extends {
    isActive?: boolean;
    component_key?: string;
    componentKey?: string;
    is_default?: boolean;
    isDefault?: boolean;
    sort_order?: number;
    sortOrder?: number;
    created_at?: string;
    createdAt?: string;
    id: string;
  },
>(rows: T[]): T[] {
  const fallbackOf = (r: T) =>
    (r.component_key ?? r.componentKey) === GENERIC_STRUCTURED_COMPONENT_KEY;
  const defaultOf = (r: T) => Boolean(r.is_default ?? r.isDefault);
  const orderOf = (r: T) => r.sort_order ?? r.sortOrder ?? 0;
  const createdOf = (r: T) => r.created_at ?? r.createdAt ?? "";
  return [...rows].sort((a, b) => {
    if (fallbackOf(a) !== fallbackOf(b)) return fallbackOf(a) ? 1 : -1;
    if (defaultOf(a) !== defaultOf(b)) return defaultOf(a) ? -1 : 1;
    if (orderOf(a) !== orderOf(b)) return orderOf(a) - orderOf(b);
    const ca = createdOf(a);
    const cb = createdOf(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Loud-but-resilient config guard: `kind_component.config` should be a JSON
 * object; anything else reads as `{}` with a scream (a recovery firing means
 * a real data defect upstream), never a throw — one malformed row must not
 * take down the resolver warm load.
 */
function asConfigRecord(value: Json, kind: string): JsonObject {
  if (isJsonObject(value)) return value;
  if (value !== null) {
    console.warn(
      `[content_ir] kind_component config for "${kind}" is not a JSON object — ignored.`,
    );
  }
  return {};
}

/**
 * Warm tier: every non-deleted resolver row in one pair of reads, ordered
 * is_default-first then sort_order so the FIRST row per (kind, platform,
 * role) is the one the registry keeps. The fallback cannot win here either:
 * `content_ir.kind_component`'s `zzz_demote_generic_fallback` trigger pins
 * every `generic_structured` row to is_default=false / sort_order=1000, and
 * `sortKindComponentRows` demotes it again client-side.
 */
export async function listKindComponentsFromTables(): Promise<
  KindComponentProjection[]
> {
  const supabase = await getSupabase();

  // Slug resolution rides the SAME query as an embedded join. The previous
  // two-query pattern built an `.in("id", …)` URL from every distinct
  // definition id — ~15.4 kB of query string at current row counts, at the
  // edge of the gateway's 16 kB URI cap; one more growth spurt and the warm
  // load 414s, which takes down EVERY db kind component (2026-08-22).
  const { data: rows, error } = await supabase
    .schema("content_ir")
    .from("kind_component")
    .select(
      "id, kind_definition_id, platform, role, component_key, source, is_active, config, component_source, props_transform, pinned_kind_version, updated_at, created_at, created_by, kind_definition!inner(kind, deleted_at)",
    )
    .is("deleted_at", null)
    .is("kind_definition.deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    throw new KindComponentTablesError(
      `Failed to list kind_component: ${error.message}`,
    );
  }
  if (!rows || rows.length === 0) return [];

  const slugById = new Map<string, string>();
  for (const r of rows) {
    const embedded = (r as { kind_definition?: { kind?: string } | null })
      .kind_definition;
    if (embedded?.kind) slugById.set(r.kind_definition_id, embedded.kind);
  }
  return projectRows(rows, slugById);
}

/**
 * COLD tier — the eager lightweight single-kind fetch (streaming path).
 * The moment a cloud kind is identified mid-stream, this pulls ONLY that
 * kind's resolver rows with ONLY the render-essential columns (the same
 * columns the warm list reads — component body, transform, config, trust
 * flags, freshness; nothing else). Two small reads: slug → definition id,
 * then that definition's component rows. Returns [] for an unknown kind.
 */
export async function getKindComponentBySlug(
  kind: string,
  platform?: string,
): Promise<KindComponentProjection[]> {
  const supabase = await getSupabase();

  const { data: def, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind")
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle();
  if (defErr) {
    throw new KindComponentTablesError(
      `Failed to resolve kind "${kind}" for component fetch: ${defErr.message}`,
    );
  }
  if (!def) return [];

  let query = supabase
    .schema("content_ir")
    .from("kind_component")
    .select(
      "id, kind_definition_id, platform, role, component_key, source, is_active, config, component_source, props_transform, pinned_kind_version, updated_at, created_at, created_by, is_default, sort_order",
    )
    .eq("kind_definition_id", def.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (platform) {
    query = query.eq("platform", platform);
  }
  const { data: rows, error } = await query;
  if (error) {
    throw new KindComponentTablesError(
      `Failed to fetch kind_component for "${kind}": ${error.message}`,
    );
  }
  if (!rows || rows.length === 0) return [];

  return projectRows(rows, new Map([[def.id, def.kind]]));
}

type RawKindComponentRow = {
  id: string;
  kind_definition_id: string;
  platform: string;
  role: string;
  component_key: string;
  source: string;
  is_active: boolean;
  config: Json;
  component_source: string | null;
  props_transform: string | null;
  pinned_kind_version: number | null;
  updated_at: string;
  created_at: string;
  created_by: string | null;
  /**
   * Selected by the cold single-kind fetch so the client-side defense sort
   * (`sortKindComponentRows`) can actually act on them; the warm list omits
   * them (SQL order is authoritative there) — hence optional.
   */
  is_default?: boolean;
  sort_order?: number;
};

function projectRows(
  rows: RawKindComponentRow[],
  slugById: Map<string, string>,
): KindComponentProjection[] {
  const out: KindComponentProjection[] = [];
  // Re-apply the deterministic contract client-side (defense in depth — the
  // SQL order above should already match; sortKindComponentRows is the truth).
  for (const row of sortKindComponentRows(rows)) {
    const kind = slugById.get(row.kind_definition_id);
    if (!kind) {
      // Per-row resilience (loud recovery): a component row pointing at a
      // deleted/missing kind definition is a data defect — skip + scream,
      // never fail the whole warm load.
      console.warn(
        `[content_ir] skipped kind_component row with dangling kind_definition_id "${row.kind_definition_id}".`,
      );
      continue;
    }
    out.push({
      kind,
      platform: row.platform,
      role: row.role,
      componentKey: row.component_key,
      source: row.source,
      isActive: row.is_active,
      config: asConfigRecord(row.config, kind),
      componentSource: row.component_source,
      propsTransform: row.props_transform,
      pinnedKindVersion: row.pinned_kind_version,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      id: row.id,
      createdBy: row.created_by,
    });
  }
  return out;
}
