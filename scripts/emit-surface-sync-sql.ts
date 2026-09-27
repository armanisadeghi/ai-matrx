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
 *   4. for every selected manifest with a `guide`, an upsert of that markdown
 *      as the platform skill `surface-guide-<slug>` (`skill.definition`; see
 *      `renderSurfaceGuideSkillSql`). The intro pointer to it is part of the
 *      plan (`withAgentHints`).
 * It does not mirror the admin endpoint's DELETE/drift half — stale rows are
 * reported by the drift API, never silently purged here.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderSurfaceSyncSql, sqlLiteral } from "@ai-matrx/alchemy/checks";
import {
  getAllManifests,
  getRawManifest,
} from "@/features/surfaces/manifests/registry";
import {
  planManifestSync,
  toPackageResolved,
} from "@/features/surfaces/declare/surface-declare";
import { sqlSyncedFrom } from "@/features/surfaces/services/sync-provenance";
import {
  surfaceGuideSkillId,
  surfaceGuideSkillText,
  surfaceGuideSlug,
} from "@/features/surfaces/utils/surface-guide";
import type { SurfaceManifest } from "@/features/surfaces/types";

const REPO_ROOT = resolve(__dirname, "..");

/** sha256 of the trimmed guide body — stored as the skill's `config.source_hash`. */
export function surfaceGuideSourceHash(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex");
}

/** The guide markdown for a manifest, read from the repo. */
export function readSurfaceGuide(repoPath: string): string {
  return readFileSync(resolve(REPO_ROOT, repoPath), "utf8");
}

/**
 * Upsert a surface's guide markdown as a normal platform skill — the same row
 * shape as the other system reference skills (`skill_type` reference,
 * `is_system`, the system org, `public` so the in-app `skill` tool can `get`
 * and `search` it). `skill.definition` has no unique key on `skill_id`, so it
 * is an UPDATE of the live row plus an INSERT … WHERE NOT EXISTS. Governance
 * columns (`organization_id`, `visibility`) are insert-only, as for the mirror.
 */
export function renderSurfaceGuideSkillSql(
  manifest: Pick<SurfaceManifest, "surfaceName" | "label" | "urlPattern" | "guide">,
  organizationId: string,
  readGuide: (repoPath: string) => string = readSurfaceGuide,
): string {
  if (!manifest.guide) return "";
  const body = readGuide(manifest.guide).trim();
  if (!body) throw new Error(`Surface guide ${manifest.guide} is empty`);
  const skillId = surfaceGuideSkillId(manifest.surfaceName);
  const { label, description } = surfaceGuideSkillText(manifest);
  const sourceHash = surfaceGuideSourceHash(body);
  const triggers = [
    surfaceGuideSlug(manifest.surfaceName),
    manifest.label,
    ...(manifest.urlPattern ? [manifest.urlPattern] : []),
    "apply_surface_write",
  ];
  const metadata = {
    authored_by: "surface-sync",
    audience: "runtime-agent",
    surface_name: manifest.surfaceName,
    source_of_truth: manifest.guide,
  };
  const config = {
    ingested_from: "surface-sync",
    source_repo: "matrx-frontend",
    source_path: manifest.guide,
    source_hash: sourceHash,
  };
  const L = (v: string) => sqlLiteral(v);
  const J = (v: unknown) =>
    `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  const live = `skill_id = ${L(skillId)} AND organization_id = ${L(organizationId)} AND deleted_at IS NULL`;
  return `-- Surface guide ${manifest.guide} → platform skill ${skillId}
UPDATE skill.definition SET label = ${L(label)}, description = ${L(description)}, skill_type = 'reference', body = ${L(body)}, icon_name = 'BookOpen', trigger_patterns = ${J(triggers)}, platform_targets = '["web"]'::jsonb, is_active = true, is_system = true, metadata = ${J(metadata)}, config = ${J(config)}, updated_at = now() WHERE ${live};

INSERT INTO skill.definition (skill_id, label, description, skill_type, body, icon_name, trigger_patterns, platform_targets, is_active, is_system, organization_id, visibility, metadata, config)
SELECT ${L(skillId)}, ${L(label)}, ${L(description)}, 'reference', ${L(body)}, 'BookOpen', ${J(triggers)}, '["web"]'::jsonb, true, true, ${L(organizationId)}, 'public', ${J(metadata)}, ${J(config)}
WHERE NOT EXISTS (SELECT 1 FROM skill.definition WHERE ${live});`;
}

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
  const guides = manifests
    .map((manifest) => renderSurfaceGuideSkillSql(manifest, organizationId))
    .filter(Boolean);
  return [renderSurfaceSyncSql(plan), ...guides].join("\n\n");
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
