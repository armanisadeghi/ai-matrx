/**
 * Manifest sync service.
 *
 * - Diffs the code-side `SurfaceManifest` registry against
 *   `public.ui_surface_value`.
 * - Scans `agx_agent_surface.value_mappings` and `tl_def_surface.arg_mappings`
 *   for `surface_value` mappings whose target no longer exists in any
 *   manifest. These are the "broken mappings" surfaced to admins.
 * - Applies the diff (upsert / delete) to bring DB in line with code.
 *
 * Code is the source of truth. The DB is a mirror — nothing in this service
 * ever modifies code or mutates the registry.
 *
 * All mutating calls require a super-admin server-side Supabase client.
 * Read calls work with any authenticated server client (RLS keeps things
 * honest, but this service is admin-gated at the API layer too).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import {
  ALL_MANIFESTS,
  getManifest,
  getRegisteredSurfaceNames,
} from "@/features/surfaces/manifests/registry";
import type {
  BrokenMapping,
  SurfaceDriftReport,
  SurfaceValue,
  SurfaceValueDrift,
  ValueMapping,
} from "@/features/surfaces/types";
import { isValueMapping } from "@/features/surfaces/types";

type Sb = SupabaseClient<Database>;
type UiSurfaceValueRow =
  Database["public"]["Tables"]["ui_surface_value"]["Row"];
type UiSurfaceValueInsert =
  Database["public"]["Tables"]["ui_surface_value"]["Insert"];

const VALUE_TYPES = ["string", "number", "boolean", "object", "array"] as const;
type DbValueType = (typeof VALUE_TYPES)[number];

function manifestRowFor(
  surfaceName: string,
  v: SurfaceValue,
): UiSurfaceValueInsert {
  return {
    surface_name: surfaceName,
    name: v.name,
    label: v.label,
    description: v.description,
    value_type: v.valueType,
    always_available: v.alwaysAvailable,
    typical_char_count: v.typicalCharCount,
    sort_order: v.sortOrder ?? 1000,
  };
}

function dbRowToSurfaceValue(row: UiSurfaceValueRow): SurfaceValue {
  return {
    name: row.name,
    label: row.label,
    description: row.description,
    valueType: (VALUE_TYPES.includes(row.value_type as DbValueType)
      ? (row.value_type as DbValueType)
      : "string") as SurfaceValue["valueType"],
    alwaysAvailable: row.always_available,
    typicalCharCount: row.typical_char_count,
    sortOrder: row.sort_order,
  };
}

function diffSurfaceValue(
  manifest: SurfaceValue,
  db: SurfaceValue,
): SurfaceValueDrift["diff"] {
  const diff: SurfaceValueDrift["diff"] = {};
  const keys: (keyof SurfaceValue)[] = [
    "label",
    "description",
    "valueType",
    "alwaysAvailable",
    "typicalCharCount",
    "sortOrder",
  ];
  for (const k of keys) {
    const m = manifest[k];
    const d = db[k];
    // sortOrder defaults to 1000 on the DB side, so treat undefined === 1000
    if (k === "sortOrder") {
      const mn = (m ?? 1000) as number;
      const dn = (d ?? 1000) as number;
      if (mn !== dn) diff[k] = { manifest: mn, db: dn };
      continue;
    }
    if (m !== d) diff[k] = { manifest: m, db: d };
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

// ---------------------------------------------------------------------------
// listSurfaceValues — DB read for one surface
// ---------------------------------------------------------------------------

export async function listSurfaceValues(
  sb: Sb,
  surfaceName: string,
): Promise<SurfaceValue[]> {
  const { data, error } = await sb
    .from("ui_surface_value")
    .select("*")
    .eq("surface_name", surfaceName)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(dbRowToSurfaceValue);
}

// ---------------------------------------------------------------------------
// computeDriftReport — full code-vs-DB + broken-mapping audit
// ---------------------------------------------------------------------------

export async function computeDriftReport(sb: Sb): Promise<SurfaceDriftReport> {
  // 1. Pull all DB rows we care about.
  const [allDbRowsRes, agentBindingsRes, toolBindingsRes] = await Promise.all([
    sb.from("ui_surface_value").select("*"),
    sb
      .from("agx_agent_surface")
      .select("id, surface_name, value_mappings")
      .neq("value_mappings", "{}"),
    sb
      .from("tl_def_surface")
      .select("tool_id, surface_name, arg_mappings")
      .neq("arg_mappings", "{}"),
  ]);

  if (allDbRowsRes.error) throw allDbRowsRes.error;
  if (agentBindingsRes.error) throw agentBindingsRes.error;
  if (toolBindingsRes.error) throw toolBindingsRes.error;

  const dbRows = allDbRowsRes.data ?? [];

  // 2. Index DB rows by surface for fast lookup.
  const dbBySurface = new Map<string, Map<string, UiSurfaceValueRow>>();
  for (const row of dbRows) {
    let inner = dbBySurface.get(row.surface_name);
    if (!inner) {
      inner = new Map();
      dbBySurface.set(row.surface_name, inner);
    }
    inner.set(row.name, row);
  }

  // 3. Index manifests.
  const manifestSurfaceNames = new Set(getRegisteredSurfaceNames());
  const manifestValuesBySurface = new Map<string, Map<string, SurfaceValue>>();
  for (const manifest of ALL_MANIFESTS) {
    const inner = new Map<string, SurfaceValue>();
    for (const v of manifest.values) inner.set(v.name, v);
    manifestValuesBySurface.set(manifest.surfaceName, inner);
  }

  // 4. manifest_only / diff: walk manifests, compare to DB.
  const manifestsMissingInDb: SurfaceValueDrift[] = [];
  const diffs: SurfaceValueDrift[] = [];
  for (const [surfaceName, mValues] of manifestValuesBySurface) {
    const dbValues = dbBySurface.get(surfaceName);
    for (const [valueName, manifestVal] of mValues) {
      const dbRow = dbValues?.get(valueName);
      if (!dbRow) {
        manifestsMissingInDb.push({
          surfaceName,
          valueName,
          kind: "manifest_only",
        });
        continue;
      }
      const dbVal = dbRowToSurfaceValue(dbRow);
      const fieldDiff = diffSurfaceValue(manifestVal, dbVal);
      if (fieldDiff) {
        diffs.push({
          surfaceName,
          valueName,
          kind: "diff",
          diff: fieldDiff,
        });
      }
    }
  }

  // 5. db_only: walk DB, anything not in a manifest is stale.
  const dbValuesNotInManifest: SurfaceValueDrift[] = [];
  for (const [surfaceName, dbValues] of dbBySurface) {
    const mValues = manifestValuesBySurface.get(surfaceName);
    for (const [valueName] of dbValues) {
      if (!mValues || !mValues.has(valueName)) {
        dbValuesNotInManifest.push({
          surfaceName,
          valueName,
          kind: "db_only",
        });
      }
    }
  }

  // 6. brokenAgentMappings: every `surface_value` mapping whose target
  //    doesn't exist in the (effective) manifest for that surface.
  const brokenAgentMappings = collectBrokenMappings(
    "agent",
    (agentBindingsRes.data ?? []).map((b) => ({
      id: b.id,
      surfaceName: b.surface_name,
      mappings: b.value_mappings,
    })),
    manifestValuesBySurface,
    manifestSurfaceNames,
  );

  const brokenToolMappings = collectBrokenMappings(
    "tool",
    (toolBindingsRes.data ?? []).map((b) => ({
      // composite id for display only; we cannot point at one PK row.
      id: `${b.tool_id}::${b.surface_name}`,
      surfaceName: b.surface_name,
      mappings: b.arg_mappings,
    })),
    manifestValuesBySurface,
    manifestSurfaceNames,
  );

  return {
    manifestsMissingInDb,
    dbValuesNotInManifest,
    diffs,
    brokenAgentMappings,
    brokenToolMappings,
  };
}

function collectBrokenMappings(
  bindingKind: BrokenMapping["bindingKind"],
  rows: { id: string; surfaceName: string; mappings: Json }[],
  manifestValuesBySurface: Map<string, Map<string, SurfaceValue>>,
  manifestSurfaceNames: Set<string>,
): BrokenMapping[] {
  const out: BrokenMapping[] = [];
  for (const row of rows) {
    if (typeof row.mappings !== "object" || row.mappings === null) continue;
    const mappingsObj = row.mappings as Record<string, unknown>;
    for (const [key, raw] of Object.entries(mappingsObj)) {
      if (!isValueMapping(raw)) continue;
      const mapping: ValueMapping = raw;
      if (mapping.mapType !== "surface_value") continue;

      // If the surface has no manifest at all, every mapping is broken.
      if (!manifestSurfaceNames.has(row.surfaceName)) {
        out.push({
          bindingKind,
          bindingId: row.id,
          surfaceName: row.surfaceName,
          mappingKey: key,
          badTarget: mapping.target,
          mapping,
        });
        continue;
      }
      const mValues = manifestValuesBySurface.get(row.surfaceName);
      if (!mValues || !mValues.has(mapping.target)) {
        out.push({
          bindingKind,
          bindingId: row.id,
          surfaceName: row.surfaceName,
          mappingKey: key,
          badTarget: mapping.target,
          mapping,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// applyManifestSync — make DB match the manifests
// ---------------------------------------------------------------------------

export interface ApplyManifestSyncOptions {
  /** When true, deletes `db_only` rows. Defaults to false — admins opt in. */
  deleteStale?: boolean;
  /** When false, skips registering manifests for surfaces not present in `ui_surface`. Defaults to false (no implicit surface creation). */
  createMissingSurfaces?: boolean;
}

export interface ApplyManifestSyncResult {
  /** Surface values inserted / updated. */
  upserted: { surfaceName: string; valueName: string }[];
  /** Surface values deleted (only when `deleteStale: true`). */
  deleted: { surfaceName: string; valueName: string }[];
  /** Manifests skipped because their `surfaceName` isn't in `ui_surface`. */
  skippedMissingSurface: string[];
  /** Post-sync drift report (should be empty unless something raced). */
  driftAfter: SurfaceDriftReport;
}

/**
 * Remediation action for a single broken-mapping entry. Powers the drift
 * report's inline "Remap to / Remove / Keep & notify" buttons.
 */
export type BrokenMappingAction =
  | { action: "remap_to"; target: string }
  | { action: "remove" }
  | { action: "notify_only" };

export interface RemediateMappingArgs {
  bindingKind: "agent" | "tool";
  /** `agx_agent_surface.id` for agent bindings; `${tool_id}::${surface_name}` for tool bindings. */
  bindingId: string;
  /** The JSONB key to remediate. */
  mappingKey: string;
  remediation: BrokenMappingAction;
}

export interface RemediateMappingResult {
  ok: boolean;
  /** True when the JSONB column was actually modified. */
  applied: boolean;
  /** The mapping JSONB after remediation (or the unchanged one for `notify_only`). */
  newMappings: Record<string, unknown>;
}

/** Rewrite, remove, or audit a single broken `surface_value` mapping. */
export async function remediateBrokenMapping(
  sb: Sb,
  args: RemediateMappingArgs,
): Promise<RemediateMappingResult> {
  const { bindingKind, bindingId, mappingKey, remediation } = args;

  if (bindingKind === "agent") {
    const { data: row, error: readErr } = await sb
      .from("agx_agent_surface")
      .select("id, value_mappings")
      .eq("id", bindingId)
      .single();
    if (readErr) throw readErr;
    const current = (row?.value_mappings ?? {}) as Record<string, unknown>;
    const next = { ...current };

    if (remediation.action === "notify_only") {
      return { ok: true, applied: false, newMappings: current };
    }
    if (remediation.action === "remove") {
      delete next[mappingKey];
    } else {
      next[mappingKey] = rewriteToSurfaceValue(
        next[mappingKey],
        remediation.target,
      );
    }
    const { error: writeErr } = await sb
      .from("agx_agent_surface")
      .update({ value_mappings: next as unknown as Json })
      .eq("id", bindingId);
    if (writeErr) throw writeErr;
    return { ok: true, applied: true, newMappings: next };
  }

  const [toolId, surfaceName] = bindingId.split("::");
  if (!toolId || !surfaceName) {
    throw new Error(
      `Invalid tool binding id "${bindingId}". Expected "<tool_id>::<surface_name>".`,
    );
  }
  const { data: row, error: readErr } = await sb
    .from("tl_def_surface")
    .select("tool_id, surface_name, arg_mappings")
    .eq("tool_id", toolId)
    .eq("surface_name", surfaceName)
    .single();
  if (readErr) throw readErr;
  const current = (row?.arg_mappings ?? {}) as Record<string, unknown>;
  const next = { ...current };

  if (remediation.action === "notify_only") {
    return { ok: true, applied: false, newMappings: current };
  }
  if (remediation.action === "remove") {
    delete next[mappingKey];
  } else {
    next[mappingKey] = rewriteToSurfaceValue(
      next[mappingKey],
      remediation.target,
    );
  }
  const { error: writeErr } = await sb
    .from("tl_def_surface")
    .update({ arg_mappings: next as unknown as Json })
    .eq("tool_id", toolId)
    .eq("surface_name", surfaceName);
  if (writeErr) throw writeErr;
  return { ok: true, applied: true, newMappings: next };
}

function rewriteToSurfaceValue(prev: unknown, newTarget: string): ValueMapping {
  const required =
    prev &&
    typeof prev === "object" &&
    "required" in (prev as Record<string, unknown>)
      ? Boolean((prev as { required?: unknown }).required)
      : undefined;
  return {
    mapType: "surface_value",
    target: newTarget,
    ...(required !== undefined ? { required } : {}),
  };
}

export async function applyManifestSync(
  sb: Sb,
  opts: ApplyManifestSyncOptions = {},
): Promise<ApplyManifestSyncResult> {
  const { deleteStale = false, createMissingSurfaces = false } = opts;

  // 1. Make sure surfaces referenced by manifests exist in ui_surface.
  const surfacesRes = await sb.from("ui_surface").select("name");
  if (surfacesRes.error) throw surfacesRes.error;
  const existingSurfaces = new Set((surfacesRes.data ?? []).map((r) => r.name));

  const skippedMissingSurface: string[] = [];
  const targetManifests = ALL_MANIFESTS.filter((m) => {
    if (existingSurfaces.has(m.surfaceName)) return true;
    if (createMissingSurfaces) return true;
    skippedMissingSurface.push(m.surfaceName);
    return false;
  });

  // 2. Optionally create missing surfaces (default OFF).
  if (createMissingSurfaces) {
    const missing = targetManifests
      .filter((m) => !existingSurfaces.has(m.surfaceName))
      .map((m) => {
        // surface name pattern is `<client>/<slug>` — the client must exist already.
        const [clientName] = m.surfaceName.split("/");
        return {
          name: m.surfaceName,
          client_name: clientName ?? "matrx-user",
          description: "",
        };
      });
    if (missing.length > 0) {
      const ins = await sb.from("ui_surface").insert(missing);
      if (ins.error) throw ins.error;
    }
  }

  // 3. Upsert all manifest values.
  const upsertRows: UiSurfaceValueInsert[] = [];
  for (const manifest of targetManifests) {
    for (const v of manifest.values) {
      upsertRows.push(manifestRowFor(manifest.surfaceName, v));
    }
  }
  const upserted: ApplyManifestSyncResult["upserted"] = [];
  if (upsertRows.length > 0) {
    const upsertRes = await sb
      .from("ui_surface_value")
      .upsert(upsertRows, { onConflict: "surface_name,name" })
      .select("surface_name, name");
    if (upsertRes.error) throw upsertRes.error;
    for (const row of upsertRes.data ?? []) {
      upserted.push({ surfaceName: row.surface_name, valueName: row.name });
    }
  }

  // 4. Delete stale rows (db_only) for surfaces we manage in manifests.
  const deleted: ApplyManifestSyncResult["deleted"] = [];
  if (deleteStale) {
    const allDb = await sb
      .from("ui_surface_value")
      .select("surface_name, name");
    if (allDb.error) throw allDb.error;

    const managedSurfaces = new Set(targetManifests.map((m) => m.surfaceName));
    const manifestKeys = new Set(
      targetManifests.flatMap((m) =>
        m.values.map((v) => `${m.surfaceName}::${v.name}`),
      ),
    );

    const toDelete = (allDb.data ?? []).filter(
      (r) =>
        managedSurfaces.has(r.surface_name) &&
        !manifestKeys.has(`${r.surface_name}::${r.name}`),
    );
    for (const row of toDelete) {
      const del = await sb
        .from("ui_surface_value")
        .delete()
        .eq("surface_name", row.surface_name)
        .eq("name", row.name);
      if (del.error) throw del.error;
      deleted.push({ surfaceName: row.surface_name, valueName: row.name });
    }
  }

  // 5. Re-run drift for the post-sync report.
  const driftAfter = await computeDriftReport(sb);

  return {
    upserted,
    deleted,
    skippedMissingSurface,
    driftAfter,
  };
}
