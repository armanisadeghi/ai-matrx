#!/usr/bin/env npx tsx
/**
 * Transactional, direct-Postgres admission/sync for the manifest mirror.
 *
 * `--check` is read-only and reports every missing or incomplete manifest key.
 * The mutating mode is deliberately bounded to explicitly selected manifests,
 * never creates ui_client rows, and deletes
 * nothing. `--registration-only` is valid only with `--check`; it verifies
 * admission (every required key plus ownership) without judging metadata.
 */
import process from "node:process";
import type { QueryResult } from "pg";
import {
  getAllManifests,
  getRawManifest,
} from "@/features/surfaces/manifests/registry";
import { resolveSurfaceUrlPattern } from "@/features/surfaces/utils/surface-url-pattern";
import { emitSurfaceSyncSql } from "./emit-surface-sync-sql";
import { connectDirect, loadDbEnv } from "./lib/direct-db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

function usage(): never {
  throw new Error(
    "Usage: tsx scripts/sync-surface-manifests-direct.ts [--check] [--registration-only] [--self-test] [--surface <name>]…",
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
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

function rowsByKey(rows: readonly Row[]): Map<string, Row> {
  return new Map(
    rows.map((row) => [`${row.surface_name ?? row.name}::${row.name}`, row]),
  );
}

function expectedKeys(manifests: ReturnType<typeof getAllManifests>) {
  return {
    values: manifests.flatMap((m) =>
      m.values.map((v) => `${m.surfaceName}::${v.name}`),
    ),
    roles: manifests.flatMap((m) =>
      (m.agentRoles ?? []).map((v) => `${m.surfaceName}::${v.name}`),
    ),
    targets: manifests.flatMap((m) =>
      (m.writeTargets ?? []).map((v) => `${m.surfaceName}::${v.name}`),
    ),
    tools: manifests.flatMap((m) =>
      (m.clientTools ?? []).map((v) => `${m.surfaceName}::${v.name}`),
    ),
  };
}

function childMetadataFailures(
  manifests: ReturnType<typeof getAllManifests>,
  rows: readonly Row[][],
): string[] {
  const failures: string[] = [];
  const actual = rows.map(rowsByKey);
  const compare = (
    table: number,
    key: string,
    expected: Record<string, unknown>,
  ) => {
    const row = actual[table].get(key);
    if (!row) return;
    for (const [column, value] of Object.entries(expected)) {
      if (canonical(row[column]) !== canonical(value))
        failures.push(`${key}: ${column} differs`);
    }
  };
  for (const m of manifests) {
    for (const v of m.values)
      compare(0, `${m.surfaceName}::${v.name}`, {
        label: v.label,
        description: v.description,
        value_type: v.valueType,
        always_available: v.alwaysAvailable,
        typical_char_count: v.typicalCharCount,
        sort_order: v.sortOrder ?? 1000,
        auto_context: v.autoContext ?? true,
        group_key: v.groupKey ?? v.group ?? "general",
      });
    for (const r of m.agentRoles ?? [])
      compare(1, `${m.surfaceName}::${r.name}`, {
        label: r.label,
        description: r.description,
        kind: r.kind,
        default_agent_id: r.defaultAgentId,
        mandate_key: r.mandateKey ?? null,
        max_agents: r.maxAgents ?? 1,
        allow_custom: r.allowCustom ?? true,
        auto_run: r.autoRun ?? "user-choice",
        sort_order: r.sortOrder ?? 1000,
      });
    for (const t of m.writeTargets ?? [])
      compare(2, `${m.surfaceName}::${t.name}`, {
        label: t.label,
        description: t.description,
        value_type: t.valueType,
        mode: t.mode,
        updates_value: t.updatesValue ?? null,
        group_key: t.group ?? "general",
        sort_order: t.sortOrder ?? 1000,
        apply_policy: t.applyPolicy ?? "manual",
        kind_key: t.valueKind ?? null,
      });
    for (const t of m.clientTools ?? [])
      compare(3, `${m.surfaceName}::${t.name}`, {
        label: t.label,
        description: t.description,
        input_schema: t.inputSchema,
        mode: t.mode ?? "ui",
      });
  }
  return failures;
}

function expectedMetadata(
  manifest: ReturnType<typeof getAllManifests>[number],
  row: Row,
): string[] {
  const [clientName] = manifest.surfaceName.split("/");
  const pairs: Array<[string, unknown]> = [
    ["client_name", clientName],
    ["label", manifest.label],
    ["value_groups", manifest.groups ?? []],
    ["readiness", manifest.readiness],
    ["readiness_note", manifest.readinessNote ?? null],
  ];
  if (manifest.overlayId) pairs.push(["overlay_id", manifest.overlayId]);
  const urlPattern = resolveSurfaceUrlPattern(manifest);
  if (urlPattern) pairs.push(["url_pattern", urlPattern]);
  if (manifest.intro?.trim()) pairs.push(["intro", manifest.intro.trim()]);
  const parent = getRawManifest(manifest.surfaceName)?.inheritsFrom;
  if (parent) pairs.push(["parent_surface_name", parent]);
  return pairs.flatMap(([key, expected]) =>
    canonical(row[key]) === canonical(expected)
      ? []
      : [`surface ${manifest.surfaceName}: ${key} differs`],
  );
}

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
      !UUID_RE.test(system.rows[0]?.organization_id ?? "")
    )
      throw new Error(
        "iam.system_orgs key system must resolve to exactly one UUID organization_id",
      );
    const organizationId = system.rows[0].organization_id;
    if (!check) {
      await client.query("BEGIN");
      await client.query(
        emitSurfaceSyncSql({ surfaceNames: names, organizationId }),
      );
    } else await client.query("BEGIN READ ONLY");

    const surfaceRows = await client.query<Row>(
      "select name, client_name, is_active, label, value_groups, readiness, readiness_note, overlay_id, url_pattern, intro, parent_surface_name from ui.ui_surface where name = any($1::text[])",
      [namesSql],
    );
    const childTables = [
      "ui_surface_value",
      "ui_surface_agent_role",
      "ui_surface_write_target",
      "ui_surface_client_tool",
    ] as const;
    const childRows: QueryResult<Row>[] = [];
    for (const table of childTables) {
      childRows.push(
        await client.query<Row>(
          `select * from ui.${table} where surface_name = any($1::text[])`,
          [namesSql],
        ),
      );
    }
    const failures: string[] = [];
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
        if (!registrationOnly)
          failures.push(...expectedMetadata(manifest, row));
      }
    }
    const expected = expectedKeys(manifests);
    const labels = [
      "value",
      "agent role",
      "write target",
      "client tool",
    ] as const;
    for (let i = 0; i < childRows.length; i += 1) {
      const rows = rowsByKey(childRows[i].rows);
      for (const key of expected[
        ["values", "roles", "targets", "tools"][i] as keyof ReturnType<
          typeof expectedKeys
        >
      ]) {
        const row = rows.get(key);
        if (!row) {
          failures.push(`${labels[i]} ${key}: missing`);
          continue;
        }
        if (row.organization_id !== organizationId)
          failures.push(`${labels[i]} ${key}: organization_id is not system`);
        if (row.visibility !== "public")
          failures.push(`${labels[i]} ${key}: visibility is not public`);
      }
    }
    if (!registrationOnly)
      failures.push(
        ...childMetadataFailures(
          manifests,
          childRows.map((result) => result.rows),
        ),
      );
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
      !UUID_RE.test(system.rows[0]?.organization_id ?? "")
    )
      throw new Error(
        "iam.system_orgs key system must resolve to exactly one UUID organization_id",
      );
    const organizationId = system.rows[0].organization_id;
    const fullSql = emitSurfaceSyncSql({
      surfaceNames: [source],
      organizationId,
    })
      .split(source)
      .join(fixture);
    const childStart = fullSql.indexOf("\n-- Upsert all manifest values");
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
    } catch {
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
    const keys = expectedKeys([manifest]);
    const surface = await client.query<Row>(
      "select name, is_active from ui.ui_surface where name = $1",
      [fixture],
    );
    if (surface.rows.length !== 1 || surface.rows[0]?.is_active !== true)
      throw new Error(
        "SELF-TEST failed: emitted surface was not registered as active",
      );
    const checks: Array<[string, readonly string[]]> = [
      ["ui_surface_value", keys.values],
      ["ui_surface_agent_role", keys.roles],
      ["ui_surface_write_target", keys.targets],
      ["ui_surface_client_tool", keys.tools],
    ];
    for (const [table, expected] of checks) {
      const rows = await client.query<Row>(
        `select surface_name, name, organization_id, visibility from ui.${table} where surface_name = $1`,
        [fixture],
      );
      const actual = rowsByKey(rows.rows);
      for (const key of expected.map((key) => key.replace(source, fixture))) {
        const row = actual.get(key);
        if (
          !row ||
          row.organization_id !== organizationId ||
          row.visibility !== "public"
        )
          throw new Error(
            `SELF-TEST failed: ${table} ${key} was not persisted with system/public ownership`,
          );
      }
    }
    await client.query("ROLLBACK");
    console.log(
      "SELF-TEST PASS: legacy child-only SQL failed; new emitted SQL registered the surface, persisted every mirror key system/public twice idempotently, preserved DB-authored optional metadata, created no ui_client rows, and rolled back.",
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
