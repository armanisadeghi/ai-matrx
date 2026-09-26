/**
 * Emit the SQL that mirrors the manifests into the `ui` schema.
 *
 * ALC-14 — ONE SYNC PATH: the rows come from `@ai-matrx/alchemy/checks`
 * `planSurfaceSync` (via `features/surfaces/declare/surface-declare.ts`
 * `planManifestSync`) and the SQL from `renderSurfaceSyncSql`. This file builds
 * no rows of its own. Governance columns (`organization_id`, `visibility`) are
 * INSERT-ONLY: a conflict never rewrites them (chair ruling N5).
 *
 * Prints, to stdout (all manifests by default, or only repeated
 * `--surface <name>` selections), one transaction body:
 *   1. INSERT … ON CONFLICT (name) DO NOTHING for every ui_surface row;
 *   2. per-surface UPDATE of the code-owned columns (label, value_groups,
 *      readiness, readiness_note, description, execution_mode, client_name,
 *      plus overlay_id / url_pattern / intro / parent only when declared);
 *   3. one upsert per mirror table (values, write targets, agent roles,
 *      client tools).
 * It does not mirror the admin endpoint's DELETE/drift half — stale rows are
 * reported by the drift API, never silently purged here.
 */

import { execFileSync } from "node:child_process";
import { renderSurfaceSyncSql } from "@ai-matrx/alchemy/checks";
import {
  getAllManifests,
  getRawManifest,
} from "@/features/surfaces/manifests/registry";
import {
  planManifestSync,
  toPackageResolved,
} from "@/features/surfaces/declare/surface-declare";
import { sqlSyncedFrom } from "@/features/surfaces/services/sync-provenance";

/**
 * The checkout's commit, or null when git cannot answer (a tarball, a detached
 * export, no git binary). Null is a first-class answer — `sqlSyncedFrom` then
 * stamps `sha-unknown` rather than inventing a build identity.
 */
function currentGitSha(): string | null {
  try {
    return (
      execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EmitSurfaceSyncSqlOptions {
  surfaceNames?: readonly string[];
  organizationId: string;
}

function selectedManifests(surfaceNames: readonly string[]) {
  const allManifests = getAllManifests();
  const manifests =
    surfaceNames.length === 0
      ? allManifests
      : allManifests.filter((manifest) =>
          surfaceNames.includes(manifest.surfaceName),
        );
  const unresolvedNames = surfaceNames.filter(
    (name) => !manifests.some((manifest) => manifest.surfaceName === name),
  );
  if (unresolvedNames.length > 0) {
    throw new Error(
      `Unknown surface manifest${unresolvedNames.length === 1 ? "" : "s"}: ${unresolvedNames.join(", ")}`,
    );
  }
  return manifests;
}

export function emitSurfaceSyncSql({
  surfaceNames = [],
  organizationId,
}: EmitSurfaceSyncSqlOptions): string {
  if (!UUID_RE.test(organizationId)) {
    throw new Error("--organization-id must be a UUID");
  }
  const manifests = selectedManifests([...new Set(surfaceNames)]);
  // PROVENANCE: every row stamps synced_by / synced_from. synced_by is NULL by
  // contract — this channel has no session, and the applier is whoever runs the SQL.
  const plan = planManifestSync(toPackageResolved(manifests, getRawManifest), {
    organizationId,
    syncedFrom: sqlSyncedFrom(currentGitSha()),
    syncedBy: null,
  });
  return renderSurfaceSyncSql(plan);
}

function main() {
  const surfaceNames: string[] = [];
  let organizationId: string | undefined;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--surface" || arg === "--organization-id") {
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      if (arg === "--surface") surfaceNames.push(value);
      else organizationId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--surface=")) {
      surfaceNames.push(arg.slice(10));
      continue;
    }
    if (arg.startsWith("--organization-id=")) {
      organizationId = arg.slice(18);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!organizationId) throw new Error("--organization-id is required");
  console.log(emitSurfaceSyncSql({ surfaceNames, organizationId }));
}

if (process.argv[1]?.endsWith("emit-surface-sync-sql.ts")) main();
