/**
 * Load the live-DB truth snapshot the checks diff against — OFFLINE.
 *
 * Priority (first that resolves wins; provenance is reported so the user knows
 * how authoritative the run was):
 *   1. scripts/schema-check/current-schema.json  — this repo's own pull of
 *      public.schema_truth_snapshot() (refresh with `pnpm check:schema:refresh`).
 *   2. ../aidream/db/schema_analysis/current_schemas.json — the SHARED backend
 *      snapshot (same DB, same query). Reused per the cross-repo doctrine: "one
 *      live snapshot, don't invent a second source."
 *   3. types/database.types.ts — DEGRADED last resort. The FE's generated types
 *      ARE a (FE-scoped) view of the live DB; better than nothing when no
 *      snapshot is on disk, but it can't see exposed-schemas and only covers the
 *      schemas the FE generates, so freshness/exposure checks self-disable.
 *
 * Never throws on a missing/unreachable snapshot — the guard must degrade, not
 * hard-fail, exactly like check:migrations on a network blip.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGeneratedTypes } from "./db-types-parse";
import type { Snapshot, SnapshotProvenance } from "./types";

export const FE_SNAPSHOT_REL = "scripts/schema-check/current-schema.json";
const AIDREAM_SNAPSHOT = "../aidream/db/schema_analysis/current_schemas.json";

function toMap(obj: Record<string, string[]> | undefined): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [k, v] of Object.entries(obj ?? {})) m.set(k, new Set(v));
  return m;
}

function buildRelationSchemas(
  tables: Map<string, Set<string>>,
  views: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const src of [tables, views])
    for (const [schema, rels] of src)
      for (const rel of rels)
        (idx.get(rel) ?? idx.set(rel, new Set()).get(rel)!).add(schema);
  return idx;
}

function finalize(
  generatedAt: string,
  source: string,
  provenance: SnapshotProvenance,
  tables: Map<string, Set<string>>,
  views: Map<string, Set<string>>,
  exposedSchemas: Set<string>,
): Snapshot {
  return {
    generatedAt,
    source,
    provenance,
    tables,
    views,
    exposedSchemas,
    relationSchemas: buildRelationSchemas(tables, views),
  };
}

/** Our own snapshot format (see current-schema.json). */
function fromFeFormat(raw: any): Snapshot {
  return finalize(
    raw.generated_at ?? "unknown",
    "schema_truth_snapshot() RPC (live)",
    "rpc",
    toMap(raw.schemas),
    toMap(raw.views),
    new Set<string>(raw.exposed_schemas ?? []),
  );
}

/** aidream's wrapped format: [{ result: { schemas, excluded_schemas } }]. */
function fromAidreamFormat(raw: any): Snapshot | null {
  const result = Array.isArray(raw) ? raw[0]?.result : raw?.result;
  if (!result?.schemas) return null;
  return finalize(
    "(aidream snapshot)",
    "aidream current_schemas.json (shared backend pull)",
    "aidream",
    toMap(result.schemas),
    toMap(result.views), // present in newer aidream pulls; absent → empty
    new Set<string>(), // aidream tracks excluded, not exposed — exposure check self-disables
  );
}

function fromDatabaseTypes(content: string): Snapshot {
  const { tables, views } = parseGeneratedTypes(content);
  return finalize(
    "(derived from types/database.types.ts)",
    "types/database.types.ts (DEGRADED — generated types, not a live pull)",
    "db-types",
    tables,
    views,
    new Set<string>(),
  );
}

export function loadSnapshot(root: string): Snapshot {
  const fePath = join(root, FE_SNAPSHOT_REL);
  if (existsSync(fePath)) {
    try {
      const raw = JSON.parse(readFileSync(fePath, "utf8"));
      // Tolerate either our format or a raw aidream-style blob committed here.
      if (raw?.schemas) return fromFeFormat(raw);
      const a = fromAidreamFormat(raw);
      if (a) return a;
    } catch {
      /* fall through */
    }
  }

  const aidreamPath = join(root, AIDREAM_SNAPSHOT);
  if (existsSync(aidreamPath)) {
    try {
      const a = fromAidreamFormat(JSON.parse(readFileSync(aidreamPath, "utf8")));
      if (a) return a;
    } catch {
      /* fall through */
    }
  }

  const dbTypesPath = join(root, "types/database.types.ts");
  if (existsSync(dbTypesPath)) {
    try {
      return fromDatabaseTypes(readFileSync(dbTypesPath, "utf8"));
    } catch {
      /* fall through */
    }
  }

  return finalize(
    "(none)",
    "no snapshot found",
    "none",
    new Map(),
    new Map(),
    new Set(),
  );
}

/** True when this relation name lives somewhere live (table or view). */
export function relationExists(snap: Snapshot, schema: string, name: string): boolean {
  return !!snap.tables.get(schema)?.has(name) || !!snap.views.get(schema)?.has(name);
}
