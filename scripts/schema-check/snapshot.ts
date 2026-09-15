/**
 * Load the live-DB truth snapshot the checks diff against — OFFLINE.
 *
 * ONE source: scripts/schema-check/current-schema.json, this repo's committed
 * pull of public.schema_truth_snapshot() (refresh: `pnpm check:schema:snapshot`).
 * A missing, unparsable, or malformed file THROWS with the file and the remedy.
 *
 * Until 2026-09-14 this silently fell through to the aidream snapshot, then
 * types/database.types.ts, then an empty snapshot — so a broken snapshot
 * degraded every check without saying so. Guard: snapshot-source.test.ts.
 * The snapshot's generated_at rides in `source`, which check-schema prints once
 * per run, so a stale snapshot is visible in every report.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot, SnapshotProvenance } from "./types";

export const FE_SNAPSHOT_REL = "scripts/schema-check/current-schema.json";
const REMEDY = "remedy: pnpm check:schema:snapshot (needs SUPABASE_SECRET_KEY in .env.local)";

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

export function loadSnapshot(root: string): Snapshot {
  const fePath = join(root, FE_SNAPSHOT_REL);
  if (!existsSync(fePath)) {
    throw new Error(`schema snapshot MISSING: ${FE_SNAPSHOT_REL} does not exist — ${REMEDY}`);
  }
  let raw: { generated_at?: unknown; schemas?: unknown; views?: unknown; exposed_schemas?: unknown };
  try {
    raw = JSON.parse(readFileSync(fePath, "utf8"));
  } catch (err) {
    throw new Error(`schema snapshot UNPARSABLE: ${FE_SNAPSHOT_REL} (${(err as Error).message}) — ${REMEDY}`);
  }
  const isRecord = (v: unknown): v is Record<string, string[]> => !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !raw ||
    typeof raw.generated_at !== "string" ||
    !isRecord(raw.schemas) ||
    !isRecord(raw.views) ||
    !Array.isArray(raw.exposed_schemas)
  ) {
    throw new Error(
      `schema snapshot MALFORMED: ${FE_SNAPSHOT_REL} lacks generated_at / schemas / views / exposed_schemas — ${REMEDY}`,
    );
  }
  return finalize(
    raw.generated_at,
    // The file is a cached pull, not a per-run query — say so, with its age.
    // (A rename applied after the last pull once flagged 11 phantom errors
    // while this label claimed "live".)
    `schema_truth_snapshot() RPC (cached ${raw.generated_at}; refresh: pnpm check:schema:snapshot)`,
    "rpc",
    toMap(raw.schemas),
    toMap(raw.views),
    new Set<string>(raw.exposed_schemas as string[]),
  );
}

/** True when this relation name lives somewhere live (table or view). */
export function relationExists(snap: Snapshot, schema: string, name: string): boolean {
  return !!snap.tables.get(schema)?.has(name) || !!snap.views.get(schema)?.has(name);
}
