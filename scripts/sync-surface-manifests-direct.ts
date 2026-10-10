#!/usr/bin/env npx tsx
/**
 * Transactional, direct-Postgres admission/sync for the manifest mirror.
 *
 * `--check` is read-only and reports every missing or incomplete manifest key.
 * The mutating mode is deliberately bounded to explicitly selected manifests,
 * never creates ui_client rows, and never hard-deletes: a child row the code no
 * longer declares is ARCHIVED (deleted_at), and a re-declared archived row is
 * revived. `--check` reports both directions as drift. `--registration-only` is valid only with `--check`; it verifies
 * admission (every required key plus ownership) without judging metadata.
 */
import process from "node:process";
import type { QueryResult } from "pg";
import {
  getAllManifests,
  getRawManifest,
} from "@/features/surfaces/manifests/registry";
import {
  renderSurfaceSyncStatements,
  type SurfaceSyncPlan,
} from "@ai-matrx/alchemy/checks";
import {
  planManifestSync,
  toPackageResolved,
} from "@ai-matrx/chat/surfaces/declare/surface-declare";
import {
  emitSurfaceSyncSql,
  readSurfaceGuide,
  surfaceGuideSourceHash,
} from "./emit-surface-sync-sql";
import { surfaceGuideSkillId } from "@ai-matrx/chat/surfaces/utils/surface-guide";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import {
  CHILD_TABLES,
  canonical,
  childMetadataFailures,
  mirrorKey,
  planKey,
  planRows,
  lifecycleFailures,
  mirrorLifecycle,
  rowsByKey,
  type MirrorLifecycle,
  type Row,
} from "./lib/surface-sync-check";
import { isUuidShape } from "@ai-matrx/kit/uuid";

function usage(): never {
  throw new Error(
    "Usage: tsx scripts/sync-surface-manifests-direct.ts [--check] [--registration-only] [--self-test] [--surface <name>]…",
  );
}

function parseArgs() {
  const names: string[] = [];
  let check = false;
  let registrationOnly = false;
  let selfTest = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--registration-only") {
      registrationOnly = true;
      continue;
    }
    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }
    if (arg === "--surface") {
      const name = args[i + 1];
      if (!name || name.startsWith("--")) usage();
      names.push(name);
      i += 1;
      continue;
    }
    if (arg.startsWith("--surface=")) {
      names.push(arg.slice("--surface=".length));
      continue;
    }
    usage();
  }
  return { check, registrationOnly, selfTest, names: [...new Set(names)] };
}

/** The ONE sync plan (ALC-14) for these manifests; --check compares the DB to it. */
function syncPlan(
  manifests: ReturnType<typeof getAllManifests>,
  organizationId: string,
): SurfaceSyncPlan {
  return planManifestSync(toPackageResolved(manifests, getRawManifest), {
    organizationId,
    syncedFrom: "check",
  });
}

function expectedMetadata(
  surface: SurfaceSyncPlan["surfaces"][number],
  row: Row,
): string[] {
  return Object.entries(surface.update).flatMap(([key, expected]) =>
    canonical(row[key]) === canonical(expected)
      ? []
      : [`surface ${surface.name}: ${key} differs`],
  );
}

/**
 * Archive (deleted_at = now()) every live row the code no longer declares and
 * revive every declared row sitting archived. Soft only — this tool never hard
 * deletes. Returns one line per row for the run's output.
 */
async function applyMirrorLifecycle(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  lifecycle: readonly MirrorLifecycle[],
  plan: SurfaceSyncPlan,
): Promise<string[]> {
  const lines: string[] = [];
  for (const { table, label, archive, revive } of lifecycle) {
    const key = planKey(plan, table);
    if (archive.length) {
      // Only the rows the statement really changed are reported: `declared_by = 'code'` skips database-owned rows.
      const done = await client.query(
        `update ui.${table} set deleted_at = now() where id = any($1::uuid[]) and deleted_at is null and declared_by = 'code' returning id`,
        [archive.map((row) => row.id)],
      );
      const changedIds = new Set(done.rows.map((row) => String(row.id)));
      for (const row of archive) {
        if (changedIds.has(String(row.id))) lines.push(`ARCHIVED ${label} ${mirrorKey(row, key)} (no longer declared in code)`);
        else lines.push(`SKIPPED ${label} ${mirrorKey(row, key)} (not archived: it is not code-owned, or already archived)`);
      }
    }
    if (revive.length) {
      const done = await client.query(
        `update ui.${table} set deleted_at = null where id = any($1::uuid[]) and deleted_at is not null and declared_by = 'code' returning id`,
        [revive.map((row) => row.id)],
      );
      const changedIds = new Set(done.rows.map((row) => String(row.id)));
      for (const row of revive) {
        if (changedIds.has(String(row.id))) lines.push(`REVIVED ${label} ${mirrorKey(row, key)} (declared in code again)`);
        else lines.push(`SKIPPED ${label} ${mirrorKey(row, key)} (not revived: it is not code-owned, or not archived)`);
      }
    }
  }
  return lines;
}

/** The four tables `applyMirrorLifecycle` archives with per-row reporting; the emitter archives every other keyed table. */
const LIFECYCLE_TABLES = CHILD_TABLES.map(([table]) => `ui.${table}`);

async function main() {
  const { check, registrationOnly, selfTest, names } = parseArgs();
  if (selfTest) return runSelfTest();
  if (registrationOnly && !check)
    throw new Error(
      "--registration-only is only valid with --check; sync always verifies and writes the complete selected mirror",
    );
  if (!check && names.length === 0)
    throw new Error(
      "Sync requires at least one --surface; use --check --registration-only for the full registry admission audit",
    );
  const manifests = getAllManifests().filter(
    (m) => names.length === 0 || names.includes(m.surfaceName),
  );
  const unknown = names.filter(
    (name) => !manifests.some((m) => m.surfaceName === name),
  );
  if (unknown.length)
    throw new Error(
      `Unknown surface manifest${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    );
  const env = loadDbEnv();
  if ("missing" in env)
    throw new Error(
      `Database connection unavailable; missing ${env.missing.join(", ")}`,
    );
  const client = await connectDirect(env, "surface-manifest-direct-sync");
  const namesSql = manifests.map((m) => m.surfaceName);
  try {
    const system = await client.query<{ organization_id: string }>(
      "select organization_id from iam.system_orgs where key = 'system'",
    );
    if (
      system.rows.length !== 1 ||
      !isUuidShape(system.rows[0]?.organization_id ?? "")
    )
      throw new Error(
        "iam.system_orgs key system must resolve to exactly one UUID organization_id",
      );
    const organizationId = system.rows[0].organization_id;
    if (!check) {
      await client.query("BEGIN");
      await client.query(
        emitSurfaceSyncSql({ surfaceNames: names, organizationId, skipArchiveTables: LIFECYCLE_TABLES }),
      );
    } else await client.query("BEGIN READ ONLY");

    const plan = syncPlan(manifests, organizationId);
    const surfaceRows = await client.query<Row>(
      "select name, client_name, executor_name, execution_mode, description, is_active, label, value_groups, readiness, readiness_note, overlay_id, url_pattern, intro, parent_surface_name, content_hash, situation from ui.ui_surface where name = any($1::text[])",
      [namesSql],
    );
    const readChildRows = async () => {
      const result: QueryResult<Row>[] = [];
      for (const [table] of CHILD_TABLES) {
        result.push(
          await client.query<Row>(
            `select * from ui.${table} where surface_name = any($1::text[])`,
            [namesSql],
          ),
        );
      }
      return result;
    };
    let childRows = await readChildRows();
    if (!check) {
      // The upsert only adds and updates: archive what the code removed and
      // revive what it re-declared, in this same transaction (2026-10-01).
      const lifecycle = mirrorLifecycle(
        plan,
        childRows.map((result) => result.rows),
        namesSql,
      );
      for (const line of await applyMirrorLifecycle(client, lifecycle, plan))
        console.log(line);
      childRows = await readChildRows();
    }
    const failures: string[] = [];
    if (check) {
      // The ONE sync's SQL, planned against the live schema with no write:
      // EXPLAIN (never ANALYZE) inside this READ ONLY transaction proves every
      // statement parses, names real columns and has a matching ON CONFLICT
      // target — the emitter can never be ahead of the database.
      for (const statement of renderSurfaceSyncStatements(plan)) {
        try {
          await client.query("SAVEPOINT plan_statement");
          await client.query(`EXPLAIN ${statement}`);
          await client.query("RELEASE SAVEPOINT plan_statement");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT plan_statement");
          failures.push(
            `sync plan does not plan against the live schema: ${error instanceof Error ? error.message : String(error)} — in: ${statement.slice(0, 120)}…`,
          );
        }
      }
    }
    const surfaces = new Map(
      surfaceRows.rows.map((row) => [String(row.name), row]),
    );
    for (const manifest of manifests) {
      const row = surfaces.get(manifest.surfaceName);
      if (!row)
        failures.push(
          `surface ${manifest.surfaceName}: missing ui.ui_surface row`,
        );
      else {
        if (row.is_active !== true)
          failures.push(
            `surface ${manifest.surfaceName}: ui.ui_surface row is inactive (reported only; this tool never activates rows)`,
          );
        const planned = plan.surfaces.find((p) => p.name === manifest.surfaceName);
        if (!registrationOnly && planned)
          failures.push(...expectedMetadata(planned, row));
      }
    }
    CHILD_TABLES.forEach(([table, label], index) => {
      const tableKey = planKey(plan, table);
      const rows = rowsByKey(childRows[index]?.rows ?? [], tableKey);
      for (const expected of planRows(plan, table)) {
        const key = mirrorKey(expected, tableKey);
        const row = rows.get(key);
        if (!row) {
          failures.push(`${label} ${key}: missing`);
          continue;
        }
        if (row.organization_id !== organizationId)
          failures.push(`${label} ${key}: organization_id is not system`);
        if (row.published_to_web !== true)
          failures.push(`${label} ${key}: not published to the web`);
      }
    });
    // Surface guides: the platform skill must exist and carry this guide's text.
    for (const manifest of manifests) {
      if (!manifest.guide) continue;
      const skillId = surfaceGuideSkillId(manifest.surfaceName);
      const skill = await client.query<{ hash: string | null }>(
        "select config->>'source_hash' as hash from skill.definition where skill_id = $1 and organization_id = $2 and deleted_at is null and is_active",
        [skillId, organizationId],
      );
      if (skill.rows.length !== 1)
        failures.push(
          `surface ${manifest.surfaceName}: guide skill ${skillId} has ${skill.rows.length} live rows (expected 1)`,
        );
      else if (
        !registrationOnly &&
        skill.rows[0]?.hash !==
          surfaceGuideSourceHash(readSurfaceGuide(manifest.guide))
      )
        failures.push(
          `surface ${manifest.surfaceName}: guide skill ${skillId} body differs from ${manifest.guide}`,
        );
    }
    if (!registrationOnly) {
      failures.push(
        ...childMetadataFailures(
          plan,
          childRows.map((result) => result.rows),
        ),
      );
      // Both directions of value drift: a row the code removed that is still
      // live, and a row the code declares that sits archived.
      failures.push(
        ...lifecycleFailures(
          mirrorLifecycle(
            plan,
            childRows.map((result) => result.rows),
            namesSql,
          ),
          plan,
        ),
      );
    }
    if (failures.length) {
      for (const failure of failures) console.error(`FAIL ${failure}`);
      const affected = manifests
        .map((manifest) => manifest.surfaceName)
        .filter((name) => failures.some((failure) => failure.includes(name)));
      if (affected.length) {
        console.error("Repair only the affected manifest mirrors, then rerun this check:");
        for (const name of affected) {
          console.error(
            `  pnpm exec tsx scripts/sync-surface-manifests-direct.ts --surface ${name}`,
          );
        }
      }
      await client.query("ROLLBACK");
      process.exitCode = 1;
      return;
    }
    if (check) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    console.log(
      `${check ? "CHECK PASS" : "SYNC PASS"}: ${manifests.length} surface${manifests.length === 1 ? "" : "s"}; ${registrationOnly ? "registration admission" : "full mirror metadata"} verified.`,
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* transaction was not opened */
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function runSelfTest() {
  const source = "matrx-user/education-flashcard-set";
  const manifest = getAllManifests().find(
    (entry) => entry.surfaceName === source,
  );
  if (!manifest)
    throw new Error(`Self-test source manifest is missing: ${source}`);
  const env = loadDbEnv();
  if ("missing" in env)
    throw new Error(
      `Database connection unavailable; missing ${env.missing.join(", ")}`,
    );
  const client = await connectDirect(
    env,
    "surface-manifest-direct-sync-self-test",
  );
  const fixture = `matrx-user/surface-sync-probe-${Date.now().toString(36)}`;
  try {
    const system = await client.query<{ organization_id: string }>(
      "select organization_id from iam.system_orgs where key = 'system'",
    );
    if (
      system.rows.length !== 1 ||
      !isUuidShape(system.rows[0]?.organization_id ?? "")
    )
      throw new Error(
        "iam.system_orgs key system must resolve to exactly one UUID organization_id",
      );
    const organizationId = system.rows[0].organization_id;
    const fullSql = emitSurfaceSyncSql({
      surfaceNames: [source],
      organizationId,
      skipArchiveTables: LIFECYCLE_TABLES,
    })
      .split(source)
      .join(fixture);
    // The package renderer no longer prints a section comment; the child half
    // starts at the first value upsert.
    const childStart = fullSql.indexOf("\nINSERT INTO ui.ui_surface_value");
    if (childStart < 0)
      throw new Error("Self-test could not locate emitted child mirror SQL");
    const legacySql = fullSql.slice(childStart);
    await client.query("BEGIN");
    const clientsBefore = await client.query<{ count: string }>(
      "select count(*)::text as count from ui.ui_client",
    );
    await client.query("SAVEPOINT legacy_emitter");
    let legacyFailed = false;
    try {
      await client.query(legacySql);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "23503"
      ) {
        throw error;
      }
      legacyFailed = true;
    }
    await client.query("ROLLBACK TO SAVEPOINT legacy_emitter");
    if (!legacyFailed)
      throw new Error(
        "SELF-TEST RED failed: legacy child-only SQL unexpectedly admitted a missing surface",
      );
    await client.query(fullSql);
    await client.query(
      "update ui.ui_surface set overlay_id = 'surface-sync-self-test-authored', parent_surface_name = $2 where name = $1",
      [fixture, source],
    );
    await client.query(fullSql);
    const preserved = await client.query<{
      overlay_id: string | null;
      parent_surface_name: string | null;
    }>(
      "select overlay_id, parent_surface_name from ui.ui_surface where name = $1",
      [fixture],
    );
    if (
      preserved.rows[0]?.overlay_id !== "surface-sync-self-test-authored" ||
      preserved.rows[0]?.parent_surface_name !== source
    ) {
      throw new Error(
        "SELF-TEST failed: resync cleared DB-authored optional surface metadata",
      );
    }
    const clientsAfter = await client.query<{ count: string }>(
      "select count(*)::text as count from ui.ui_client",
    );
    if (clientsBefore.rows[0]?.count !== clientsAfter.rows[0]?.count)
      throw new Error("SELF-TEST failed: emitter created ui_client rows");
    const selfPlan = syncPlan([manifest], organizationId);
    // Lifecycle: a value the code removed is archived, a re-declared one revived.
    const fixturePlan = JSON.parse(
      JSON.stringify(selfPlan).split(source).join(fixture),
    ) as SurfaceSyncPlan;
    await client.query(
      "insert into ui.ui_surface_value (surface_name, item_type, name, label, description, value_type, organization_id, published_to_web) select surface_name, item_type, 'surface_sync_probe_removed', label, description, value_type, organization_id, published_to_web from ui.ui_surface_value where surface_name = $1 and deleted_at is null order by name limit 1",
      [fixture],
    );
    const redeclared = planRows(fixturePlan, "ui_surface_value")[0];
    if (!redeclared) throw new Error("Self-test source manifest declares no values");
    await client.query(
      "update ui.ui_surface_value set deleted_at = now() where surface_name = $1 and item_type = $2 and name = $3",
      [fixture, redeclared.item_type ?? "", redeclared.name],
    );
    const readFixtureChildren = async () => {
      const result: Row[][] = [];
      for (const [table] of CHILD_TABLES)
        result.push(
          (await client.query<Row>(`select * from ui.${table} where surface_name = $1`, [fixture])).rows,
        );
      return result;
    };
    const before = mirrorLifecycle(fixturePlan, await readFixtureChildren(), [fixture]);
    if (
      lifecycleFailures(before, fixturePlan).length !== 2
    )
      throw new Error(
        `SELF-TEST RED failed: --check should report exactly the removed and the archived value, got: ${lifecycleFailures(before, fixturePlan).join("; ") || "nothing"}`,
      );
    await applyMirrorLifecycle(client, before, fixturePlan);
    const lifecycleRows = await client.query<{ name: string; deleted_at: Date | null }>(
      "select name, deleted_at from ui.ui_surface_value where surface_name = $1 and name = any($2::text[])",
      [fixture, ["surface_sync_probe_removed", String(redeclared.name)]],
    );
    const stateOf = (name: string) => lifecycleRows.rows.find((row) => row.name === name);
    if (!stateOf("surface_sync_probe_removed")?.deleted_at)
      throw new Error("SELF-TEST failed: a value removed from code was not archived (or was hard-deleted)");
    if (stateOf(String(redeclared.name))?.deleted_at !== null)
      throw new Error("SELF-TEST failed: a re-declared archived value was not revived");
    if (lifecycleFailures(mirrorLifecycle(fixturePlan, await readFixtureChildren(), [fixture]), fixturePlan).length)
      throw new Error("SELF-TEST failed: --check still reports lifecycle drift after the sync");
    const keysOf = (table: string) =>
      planRows(selfPlan, table).map((row) => mirrorKey(row, planKey(selfPlan, table)));
    const surface = await client.query<Row>(
      "select name, is_active from ui.ui_surface where name = $1",
      [fixture],
    );
    if (surface.rows.length !== 1 || surface.rows[0]?.is_active !== true)
      throw new Error(
        "SELF-TEST failed: emitted surface was not registered as active",
      );
    const checks: Array<[string, readonly string[]]> = CHILD_TABLES.map(
      ([table]) => [table, keysOf(table)],
    );
    for (const [table, expected] of checks) {
      const rows = await client.query<Row>(
        `select * from ui.${table} where surface_name = $1`,
        [fixture],
      );
      const actual = rowsByKey(rows.rows, planKey(selfPlan, table));
      for (const key of expected.map((key) => key.replace(source, fixture))) {
        const row = actual.get(key);
        if (
          !row ||
          row.organization_id !== organizationId ||
          row.published_to_web !== true
        )
          throw new Error(
            `SELF-TEST failed: ${table} ${key} was not persisted as system-owned and published to the web`,
          );
      }
    }
    await client.query("ROLLBACK");
    console.log(
      "SELF-TEST PASS: legacy child-only SQL failed; new emitted SQL registered the surface, persisted every mirror key system-owned and published to the web twice idempotently, preserved DB-authored optional metadata, created no ui_client rows; --check saw a removed and an archived value, the sync archived the removed one (soft) and revived the re-declared one; rolled back.",
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* no open transaction */
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
