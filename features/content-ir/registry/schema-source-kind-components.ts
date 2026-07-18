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
 * role) is the one the registry keeps.
 */
export async function listKindComponentsFromTables(): Promise<
  KindComponentProjection[]
> {
  const supabase = await getSupabase();

  const { data: rows, error } = await supabase
    .schema("content_ir")
    .from("kind_component")
    .select(
      "kind_definition_id, platform, role, component_key, source, is_active, config, component_source, props_transform, pinned_kind_version",
    )
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) {
    throw new KindComponentTablesError(
      `Failed to list kind_component: ${error.message}`,
    );
  }
  if (!rows || rows.length === 0) return [];

  // Resolve kind_definition_id → kind slug (a small `in` read, mirroring the
  // edge-resolution pattern in schema-source-kind-tables.ts).
  const ids = [...new Set(rows.map((r) => r.kind_definition_id))];
  const { data: defs, error: defErr } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind")
    .in("id", ids)
    .is("deleted_at", null);
  if (defErr) {
    throw new KindComponentTablesError(
      `Failed to resolve kind slugs for kind_component: ${defErr.message}`,
    );
  }
  const slugById = new Map<string, string>();
  for (const d of defs ?? []) slugById.set(d.id, d.kind);

  const out: KindComponentProjection[] = [];
  for (const row of rows) {
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
    });
  }
  return out;
}
