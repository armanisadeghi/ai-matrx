#!/usr/bin/env npx tsx
/**
 * DDL guard log check — the READER the DDL sentinel never had.
 *
 * `platform.ddl_guard_log` has collected WARN/NOTICE firings since 2026-08-13:
 * public-schema tables, kill-list columns, junction shapes, `organization_id
 * NOT NULL` with no backstop, and entity-looking tables created outside
 * `platform.create_entity_table`. On 2026-08-21 it held 865 rows and EVERY ONE
 * was unacknowledged — because nothing on the platform read the table and
 * nothing could write `acknowledged_at`. A guard nobody reads is a log file.
 * (2026-08-15 architecture drift audit §1; adjudicated 2026-08-21.)
 *
 * This gate prints the per-rule count of UNACKNOWLEDGED firings. It is ADVISORY
 * by design and by doctrine — the guard's own lanes are advisory, and a release
 * that has nothing to do with the database must never be blocked because
 * somebody else's ALTER TABLE tripped a WARN last Tuesday.
 *
 *   pnpm check:ddl-guard-log            # loud, exit 0
 *   pnpm check:ddl-guard-log --strict   # exit 1 when anything is unacknowledged (CI)
 *
 * Triage lives with the docs-steward daily step (common-docs/skills/docs-steward),
 * which lists unacknowledged `hand_rolled_entity` rows and files the bad ones.
 *
 * ACKNOWLEDGING (the only supported write path — reason is CHECK-enforced):
 *   select platform.ddl_guard_ack(
 *     p_reason     => 'why this firing is accepted, >= 12 chars',
 *     p_by         => 'who reviewed it',
 *     p_rule       => 'hand_rolled_entity',      -- and/or
 *     p_object_ref => 'schema.table',            -- and/or
 *     p_ids        => '{123,124}');
 *
 * Exit codes:
 *   0  clean, OR findings in default (advisory) mode, OR creds absent
 *   1  findings AND --strict
 *   2  the live pull failed (loud; still exit 0 unless --strict)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__ddl_guard_unacked";
const TIMEOUT_MS = 15_000;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
};

const STRICT = process.argv.includes("--strict");

interface RuleRow {
  readonly rule: string;
  readonly severity: string;
  readonly unacked_rows: number;
  readonly unacked_objects: number;
  readonly first_seen: string;
  readonly last_seen: string;
  readonly sample_objects: readonly string[] | null;
}

function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (
          !key &&
          (m[1] === "SUPABASE_SECRET_KEY" || m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

async function fetchUnacked(): Promise<
  { rows: RuleRow[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no Supabase URL/key in env or .env* files" };

  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${RPC}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { rows: null, failure: `rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return { rows: null, failure: `rpc/${RPC} did not return an array` };
    return { rows: parsed as RuleRow[], failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function day(ts: string | null): string {
  return ts ? String(ts).slice(0, 10) : "?";
}

async function main(): Promise<void> {
  const { rows, failure } = await fetchUnacked();

  if (failure) {
    // "LIVE PULL FAILED" is in run-release-gates.sh's advisory-marker list, so a
    // degraded run prints as [WARN] with its banner instead of a silent green OK.
    console.log("");
    console.log(`${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — DDL guard log not read${C.reset}`);
    console.log(`  ${C.dim}${failure}${C.reset}`);
    console.log(
      `  ${C.dim}This gate needs the live DB; it cannot tell you the backlog from disk.${C.reset}`,
    );
    console.log("");
    process.exit(STRICT ? 1 : 0);
  }

  const findings = (rows ?? []).filter((r) => (r.unacked_rows ?? 0) > 0);
  if (findings.length === 0) {
    console.log(`${TAG.info}DDL guard log: ${C.green}every firing acknowledged with a reason${C.reset}.`);
    process.exit(0);
  }

  const totalRows = findings.reduce((n, r) => n + r.unacked_rows, 0);
  const totalObjects = findings.reduce((n, r) => n + r.unacked_objects, 0);

  console.log("");
  console.log(
    `${TAG.warn}${C.bold}${C.yellow}UNACKNOWLEDGED DDL GUARD FIRINGS — ${totalRows} row(s) across ${findings.length} rule(s), ${totalObjects} object(s)${C.reset}`,
  );
  console.log(`  ${C.dim}platform.ddl_guard_log · advisory · never blocks a release${C.reset}`);
  console.log("");
  for (const r of findings) {
    const samples = (r.sample_objects ?? []).join(", ");
    console.log(
      `  ${C.bold}${r.rule}${C.reset} ${C.dim}(${r.severity})${C.reset} — ` +
        `${r.unacked_rows} row(s), ${r.unacked_objects} object(s), ${day(r.first_seen)} → ${day(r.last_seen)}`,
    );
    if (samples) console.log(`      ${C.dim}${samples}${r.unacked_objects > 6 ? ", …" : ""}${C.reset}`);
  }
  console.log("");
  console.log(`  ${C.cyan}Triage${C.reset}   docs-steward daily step (common-docs/skills/docs-steward)`);
  console.log(`  ${C.cyan}Board${C.reset}    /administration/database/canonicalization`);
  console.log(
    `  ${C.cyan}Ack${C.reset}      select platform.ddl_guard_ack(p_reason => '…', p_by => '…', p_rule => '…');`,
  );
  console.log(`           ${C.dim}the reason is mandatory — CHECK ddl_guard_log_ack_needs_reason${C.reset}`);
  console.log("");

  process.exit(STRICT ? 1 : 0);
}

main().catch((err) => {
  console.error(`${TAG.fail}check-ddl-guard-log crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
