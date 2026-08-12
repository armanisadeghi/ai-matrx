/**
 * Emit the SQL to mirror ALL_MANIFESTS into the `ui` schema — the complete
 * agent-shell twin of `manifest-sync.service.ts`'s upsert path.
 *
 * Prints, to stdout (all manifests by default, or only repeated
 * `--surface <name>` selections):
 *   1. A guard SELECT listing any manifest surfaces missing a ui_surface row
 *      (run it FIRST — seed missing rows before applying the upserts).
 *   2. An upsert for every SurfaceValue (incl. auto_context).
 *   3. An upsert for every SurfaceAgentRole.
 *   4. An upsert for every SurfaceWriteTarget.
 *   5. Per-surface ui_surface updates for url_pattern / intro /
 *      parent_surface_name — only for fields the manifest actually declares
 *      (code-first ownership never clears a DB-authored value the manifest
 *      doesn't claim).
 *
 * Used to sync the DB when the authenticated /api/admin/surfaces/sync-manifests
 * endpoint isn't reachable (e.g. from CI / an agent shell). The endpoint
 * remains the canonical path; this is a faithful SQL mirror of its upsert.
 * NOTE: it does not mirror the endpoint's DELETE/drift half — stale rows are
 * reported by the drift API, never silently purged here.
 */

import {
  getAllManifests,
  getRawManifest,
} from "@/features/surfaces/manifests/registry";
import { resolveSurfaceUrlPattern } from "@/features/surfaces/utils/surface-url-pattern";

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlStringOrNull(s: string | null | undefined): string {
  const trimmed = s?.trim();
  return trimmed ? sqlString(trimmed) : "NULL";
}

function main() {
  const allManifests = getAllManifests();
  const requestedSurfaceNames = new Set<string>();
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--surface") {
      const name = args[index + 1];
      if (!name || name.startsWith("--")) {
        throw new Error("--surface requires a surface name");
      }
      requestedSurfaceNames.add(name);
      index += 1;
      continue;
    }
    if (arg.startsWith("--surface=")) {
      const name = arg.slice("--surface=".length).trim();
      if (!name) throw new Error("--surface requires a surface name");
      requestedSurfaceNames.add(name);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const manifests =
    requestedSurfaceNames.size === 0
      ? allManifests
      : allManifests.filter((manifest) =>
          requestedSurfaceNames.has(manifest.surfaceName),
        );
  const unresolvedNames = [...requestedSurfaceNames].filter(
    (name) => !manifests.some((manifest) => manifest.surfaceName === name),
  );
  if (unresolvedNames.length > 0) {
    throw new Error(
      `Unknown surface manifest${unresolvedNames.length === 1 ? "" : "s"}: ${unresolvedNames.join(", ")}`,
    );
  }
  const surfaceNames = manifests.map((m) => m.surfaceName);

  const valueRows: string[] = [];
  const roleRows: string[] = [];
  const writeTargetRows: string[] = [];
  const surfaceUpdates: string[] = [];

  for (const m of manifests) {
    for (const v of m.values) {
      valueRows.push(
        `(${sqlString(m.surfaceName)}, ${sqlString(v.name)}, ${sqlString(
          v.label,
        )}, ${sqlString(v.description)}, ${sqlString(v.valueType)}, ${
          v.alwaysAvailable
        }, ${v.typicalCharCount}, ${v.sortOrder ?? 1000}, ${
          v.autoContext ?? true
        }, ${sqlString(v.groupKey ?? v.group ?? "general")})`,
      );
    }
    for (const r of m.agentRoles ?? []) {
      roleRows.push(
        `(${sqlString(m.surfaceName)}, ${sqlString(r.name)}, ${sqlString(
          r.label,
        )}, ${sqlString(r.description)}, ${sqlString(r.kind)}, ${
          r.defaultAgentId ? sqlString(r.defaultAgentId) : "NULL"
        }, ${r.maxAgents ?? 1}, ${r.allowCustom ?? true}, ${sqlString(
          r.autoRun ?? "user-choice",
        )}, ${r.sortOrder ?? 1000})`,
      );
    }
    for (const t of m.writeTargets ?? []) {
      writeTargetRows.push(
        `(${sqlString(m.surfaceName)}, ${sqlString(t.name)}, ${sqlString(
          t.label,
        )}, ${sqlString(t.description)}, ${sqlString(t.valueType)}, ${sqlString(
          t.mode,
        )}, ${sqlStringOrNull(t.updatesValue)}, ${sqlString(
          t.group ?? "general",
        )}, ${t.sortOrder ?? 1000}, ${sqlString(t.applyPolicy ?? "manual")})`,
      );
    }

    const urlPattern = resolveSurfaceUrlPattern(m);
    const intro = m.intro?.trim() || null;
    // inheritsFrom lives on the RAW manifest (inheritance resolution strips
    // nothing, but read raw for provenance parity with the service).
    const parent = getRawManifest(m.surfaceName)?.inheritsFrom ?? null;
    const sets: string[] = [];
    // Canonical label + value_groups are ALWAYS declared (THE NAMING LAW) and
    // therefore always mirrored — matching manifest-sync.service.ts step 3c.
    sets.push(`label = ${sqlString(m.label)}`);
    sets.push(
      `value_groups = ${sqlString(JSON.stringify(m.groups ?? []))}::jsonb`,
    );
    sets.push(`readiness = ${sqlString(m.readiness)}`);
    sets.push(`readiness_note = ${sqlStringOrNull(m.readinessNote)}`);
    if (m.overlayId) sets.push(`overlay_id = ${sqlString(m.overlayId)}`);
    if (urlPattern) sets.push(`url_pattern = ${sqlString(urlPattern)}`);
    if (intro) sets.push(`intro = ${sqlStringOrNull(intro)}`);
    if (parent) sets.push(`parent_surface_name = ${sqlString(parent)}`);
    if (sets.length > 0) {
      surfaceUpdates.push(
        `UPDATE ui.ui_surface SET ${sets.join(", ")}, updated_at = now() WHERE name = ${sqlString(m.surfaceName)};`,
      );
    }
  }

  console.log("-- Guard: manifest surfaces missing a ui_surface row");
  console.log(
    `SELECT s.name FROM (VALUES ${surfaceNames
      .map((n) => `(${sqlString(n)})`)
      .join(
        ", ",
      )}) AS s(name) LEFT JOIN ui.ui_surface u ON u.name = s.name WHERE u.name IS NULL;`,
  );
  console.log("");
  console.log("-- Upsert all manifest values");
  console.log(
    `INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, auto_context, group_key) VALUES`,
  );
  console.log(valueRows.join(",\n"));
  console.log(
    `ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, auto_context = EXCLUDED.auto_context, group_key = EXCLUDED.group_key, updated_at = now();`,
  );
  if (roleRows.length > 0) {
    console.log("");
    console.log("-- Upsert all manifest agent roles");
    console.log(
      `INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES`,
    );
    console.log(roleRows.join(",\n"));
    console.log(
      `ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, kind = EXCLUDED.kind, default_agent_id = EXCLUDED.default_agent_id, max_agents = EXCLUDED.max_agents, allow_custom = EXCLUDED.allow_custom, auto_run = EXCLUDED.auto_run, sort_order = EXCLUDED.sort_order, updated_at = now();`,
    );
  }
  if (writeTargetRows.length > 0) {
    console.log("");
    console.log("-- Upsert all manifest write targets");
    console.log(
      `INSERT INTO ui.ui_surface_write_target (surface_name, name, label, description, value_type, mode, updates_value, group_key, sort_order, apply_policy) VALUES`,
    );
    console.log(writeTargetRows.join(",\n"));
    console.log(
      `ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, mode = EXCLUDED.mode, updates_value = EXCLUDED.updates_value, group_key = EXCLUDED.group_key, sort_order = EXCLUDED.sort_order, apply_policy = EXCLUDED.apply_policy, updated_at = now();`,
    );
  }
  if (surfaceUpdates.length > 0) {
    console.log("");
    console.log(
      "-- Mirror url_pattern / intro / parent_surface_name (declared fields only)",
    );
    console.log(surfaceUpdates.join("\n"));
  }
}

main();
