#!/usr/bin/env npx tsx
/**
 * Migration slot-guard liveness — the assertion the slot guard shipped without.
 *
 * WHAT IT PROTECTS: `schema_migrations_slot_guard`, the BEFORE INSERT ROW trigger
 * on `public._schema_migrations` installed by migrations/migration_slot_guard.sql
 * after FOUR migration-number collisions in two days (2026-08-27 → 2026-08-28).
 * The ledger is keyed on (source, FILENAME), so two files claiming the same
 * NUMBER both insert cleanly and nothing else in the system notices — which is
 * how twelve function bodies ended up stamped with an unrelated migration's
 * number. All four apply paths (aidream/db/apply_migrations.py, detect_applied.py,
 * the Supabase-MCP agent path, scripts/hr/apply_esign_migration.py) converge on
 * that one INSERT, so the trigger is the only real choke point there is.
 *
 * WHY THIS FILE EXISTS: the guard shipped with NO LIVENESS ASSERTION. Dropped,
 * disabled, moved to AFTER, or its function replaced with `return new`, and the
 * collisions resume in silence while the next agent reads the guard's .sql file
 * and believes it is protected. A guard's source on disk proves nothing; only the
 * catalog does (db-rules FEATURE.md §1). This is the reader for
 * `public.__migration_slot_guard_conformance()`, which supplies that proof.
 *
 * WHY NOT `check:db-guards`: that checker queries `pg_catalog.pg_event_trigger`
 * filtered to `nspname = 'platform'` (scripts/check-db-guards.ts:167-176). A ROW
 * trigger never appears in pg_event_trigger at all, and this guard's function
 * lives in `public` — so adding `schema_migrations_slot_guard` to that file's
 * EXPECTED list would report it permanently MISSING. A gate that can never go
 * green is a gate somebody mutes.
 *
 * WHY NOT `check:migrations`: that check exits 1 in --strict today over a real
 * backlog (an unapplied migration plus 88 drifted files). A liveness assertion
 * bolted onto it inherits that red and could never be wired into CI. This one has
 * ZERO backlog by construction — the guard is either bound or it is not — so it is
 * strict in CI from day one.
 *
 *   pnpm check:migration-slot-guard            # loud, exit 0
 *   pnpm check:migration-slot-guard:strict     # exit 1 on ANY finding (CI)
 *
 * WHERE THE STRICT LANE RUNS: .github/workflows/ci.yml, job `migration-slot-guard`,
 * on every PR/push. `check-doc-claims.ts`'s `per-pr-ci` claim lists the command, so
 * deleting the job turns the marker-law job red rather than silently un-gating this.
 *
 * 🚨 UNMEASURED IS NOT PASSED. Three degenerate outcomes are failures, never a
 * green light:
 *   1. The live pull failed (no creds, DB unreachable, RPC missing or revoked) —
 *      prints the `LIVE PULL FAILED` banner, which run-release-gates.sh's
 *      advisory-marker regex already knows, so a degraded run there shows as
 *      [WARN] with the banner instead of a silent green [OK].
 *   2. The RPC answered with an empty array.
 *   3. The RPC answered but omitted an EXPECTED_CHECKS key — a check that stops
 *      being returned is a silent hole. Adding a check to the SQL function means
 *      adding its key here in the same change.
 *
 * Exit codes:
 *   0  every check ok, OR findings/unmeasured in default (advisory) mode
 *   1  findings, missing checks, or an unmeasured run AND --strict
 *   2  the script itself crashed
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__migration_slot_guard_conformance";
const TIMEOUT_MS = 15_000;
const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. An absent key is a
 * finding in its own right — see the header.
 */
const EXPECTED_CHECKS = [
  // public.migration_slot(text) — the ONE definition of a numeric slot, called by
  // the trigger body and mirrored by scripts/check-migrations.ts.
  "slot_rule_function_present",
  // public._schema_migration_slot_grandfather — the 31 historical shared slots.
  // Dropped, re-recording any historical migration is refused and the guard gets
  // disabled in anger rather than repaired.
  "slot_guard_baseline_present",
  // The guard itself: bound, enabled, BEFORE, INSERT, FOR EACH ROW. The shape is
  // pinned because an AFTER trigger cannot refuse the row it was handed and a
  // statement-level trigger has no NEW to inspect — both still appear in
  // pg_trigger while protecting nothing.
  "slot_guard_trigger_installed",
] as const;

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
  ok: `${C.green}[ OK ]${C.reset} `,
};

interface ConformanceRow {
  readonly check_key: string;
  readonly ok: boolean;
  readonly severity?: string;
  readonly detail: Record<string, unknown> | null;
}

/**
 * Same resolution order as check-hr-punch-write-path.ts, and for the same reason:
 * the secret key WINS over the publishable one regardless of file order, because
 * EXECUTE on this RPC is granted to authenticated and service_role and never to
 * anon — the publishable key answers 401 and the gate would report itself
 * UNMEASURED against a perfectly healthy database.
 */
function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    let secret = "";
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secret && m[1] === "SUPABASE_SECRET_KEY") secret = v;
      }
      if (url && secret) break;
    }
    if (!key) key = secret;
  }
  return url && key ? { url, key } : null;
}

function isRow(value: unknown): value is ConformanceRow {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.check_key === "string" && typeof r.ok === "boolean";
}

async function fetchConformance(): Promise<
  { rows: ConformanceRow[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no Supabase URL/secret key in env or .env* files" };

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
      return {
        rows: null,
        failure: `rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return { rows: null, failure: `rpc/${RPC} did not return an array` };
    const rows = parsed.filter(isRow);
    if (rows.length !== parsed.length) {
      return { rows: null, failure: `rpc/${RPC} returned rows that are not {check_key, ok, ...}` };
    }
    return { rows, failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function renderDetail(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const lines: string[] = [];
  const why = detail.why;
  if (typeof why === "string" && why.trim()) lines.push(`${C.dim}${why.trim()}${C.reset}`);
  for (const [k, v] of Object.entries(detail)) {
    if (k === "why") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: ${v.map((i) => JSON.stringify(i)).join(", ")}`);
    } else if (v !== null && v !== undefined && v !== "") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines;
}

function unmeasured(reason: string): never {
  console.log("");
  console.log(
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — the migration slot guard is UNMEASURED${C.reset}`,
  );
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(
    `  ${C.dim}Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. Nothing was checked — that is NOT a pass.${C.reset}`,
  );
  console.log("");
  process.exit(STRICT ? 1 : 0);
}

async function main(): Promise<number> {
  const result = await fetchConformance();
  if (result.rows === null) unmeasured(result.failure);

  const rows = result.rows;
  if (rows.length === 0) {
    unmeasured(`rpc/${RPC} returned zero rows — it measured nothing`);
  }

  const byKey = new Map(rows.map((r) => [r.check_key, r]));
  const missing = EXPECTED_CHECKS.filter((k) => !byKey.has(k));
  const failed = rows.filter((r) => !r.ok);

  console.log("");
  console.log(
    `${C.bold}Migration slot-guard liveness${C.reset} ${C.dim}(public.${RPC})${C.reset}`,
  );

  for (const key of EXPECTED_CHECKS) {
    const row = byKey.get(key);
    if (!row) {
      console.log(`  ${TAG.fail}${key} ${C.dim}— NOT RETURNED by the function${C.reset}`);
      continue;
    }
    if (row.ok) {
      console.log(`  ${TAG.ok}${key}`);
      continue;
    }
    console.log(`  ${TAG.fail}${key}`);
    for (const line of renderDetail(row.detail)) console.log(`        ${line}`);
  }

  // A key the function returns that this file does not know about is not a
  // failure — it is a new check whose key belongs in EXPECTED_CHECKS.
  for (const r of rows) {
    if (!EXPECTED_CHECKS.includes(r.check_key as (typeof EXPECTED_CHECKS)[number])) {
      console.log(
        `  ${TAG.info}unlisted  ${r.check_key} ${C.dim}— add it to EXPECTED_CHECKS in scripts/check-migration-slot-guard.ts${C.reset}`,
      );
    }
  }

  console.log("");
  if (failed.length === 0 && missing.length === 0) {
    console.log(
      `${TAG.ok}The migration numeric-slot guard is bound, enabled, and shaped correctly.`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `${TAG.fail}${C.bold}${C.red}MIGRATION SLOT GUARD IS NOT LIVE — ${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}Nothing is stopping two migrations from claiming the same number. That cost twelve${C.reset}`,
  );
  console.log(
    `  ${C.dim}mis-stamped function bodies and a duplicate contract set on 2026-08-28.${C.reset}`,
  );
  console.log(
    `  ${C.dim}Fix: re-apply migrations/migration_slot_guard.sql (idempotent), then re-run this.${C.reset}`,
  );
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}check-migration-slot-guard crashed:`, err);
    process.exit(2);
  },
);
