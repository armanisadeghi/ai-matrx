#!/usr/bin/env npx tsx
/**
 * Soft-delete cascade liveness — does removing a thing still remove its parts?
 *
 * WHAT IT PROTECTS: `platform.soft_delete_edge` and the two generic triggers that
 * read it (`platform._cascade_soft_delete` on the parent,
 * `platform._guard_soft_delete_parent` on the child), installed by
 * migrations/platform_soft_delete_cascade.sql.
 *
 * WHY IT EXISTS: soft-deleting a `mandate.definition` used to leave every row
 * hanging off it LIVE. Four lanes of the one-resolution campaign each obeyed the
 * fixture law exactly — removed their scratch job through the UI, re-read,
 * confirmed it gone — and each left live rows behind. A rule that can be
 * satisfied on the surface people look at and missed underneath it is a defect in
 * the door. Measured on production 2026-09-08, before the fix: one job removed
 * left 1 binding, 1 treatment, 1 exemplar and 1 note alive, and attaching a NEW
 * part to an ALREADY-removed job was accepted.
 *
 * WHY A LIVE PULL AND NOT A SOURCE SCAN: the answer is in the catalog and in the
 * rows. A trigger dropped, disabled, or recreated as AFTER/STATEMENT leaves the
 * .sql file on disk looking exactly the same. Reading the file would prove
 * nothing (db-rules FEATURE.md §1).
 *
 *   pnpm check:soft-delete-cascade            # loud, exit 0
 *   pnpm check:soft-delete-cascade:strict     # exit 1 on ANY finding (CI)
 *
 * PROVEN FAILING: with `_cascade_softdelete` and `_guard_soft_delete_parent`
 * disabled on production, this reported `cascade_trigger_installed` and
 * `child_guard_installed` FAIL naming `mandate.definition` and `mandate.binding`;
 * re-enabled, all five checks green (2026-09-08).
 *
 * 🚨 UNMEASURED IS NOT PASSED — same three degenerate outcomes as
 * check-migration-slot-guard.ts, and the same `LIVE PULL FAILED` banner that
 * run-release-gates.sh's advisory-marker regex already recognises.
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
const RPC = "__soft_delete_cascade_conformance";
const TIMEOUT_MS = 15_000;
const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. An absent key is a
 * finding in its own right — see the header.
 */
const EXPECTED_CHECKS = [
  // Every parent with a cascade edge carries a live AFTER-UPDATE-ROW
  // `_cascade_softdelete`. The shape is pinned: a BEFORE or STATEMENT twin still
  // appears in pg_trigger while cascading nothing.
  "cascade_trigger_installed",
  // Every cascade CHILD carries a live BEFORE-ROW `_guard_soft_delete_parent`.
  // Without it a part can be attached to a job that is already gone — which is
  // exactly how two of the rows in the original census got there, two days after
  // their job was removed.
  "child_guard_installed",
  // Both trigger functions stay SECURITY DEFINER. As INVOKER the cascade silently
  // stops reaching RLS-protected children for real users while every privileged
  // test stays green.
  "functions_security_definer",
  // A cascade edge whose child table has no `deleted_at` is a cascade that can
  // never fire: the parent is removed and every part stays live. Until
  // 2026-09-11 this was an unspoken assumption inside
  // platform.soft_delete_orphan_census(), which built `ch.deleted_at is null`
  // into its SQL — so the first legitimate non-soft-deletable child
  // (mandate.observation, migration 0607) did not produce a finding, it raised
  // 42703 and took ALL FIVE checks down with it. This gate then reported the
  // cascade UNMEASURED on every CI run for two days. The assumption is now a
  // check, and it is listed here so that dropping it is a failure, not silence.
  "cascade_child_is_soft_deletable",
  // Zero live rows under a removed parent on any declared cascade edge — the
  // original defect, measured rather than assumed.
  "no_live_orphans",
  // The six inbound foreign keys of `mandate.definition` and what each was ruled
  // to mean. A seventh FK, or a row flipped from cascade to keep, lands here as a
  // mismatch instead of as silence.
  "mandate_edges_declared",
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
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — the soft-delete cascade is UNMEASURED${C.reset}`,
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
    `${C.bold}Soft-delete cascade liveness${C.reset} ${C.dim}(public.${RPC})${C.reset}`,
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
      `${TAG.ok}Removing a thing still removes everything declared part of it.`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `${TAG.fail}${C.bold}${C.red}THE SOFT-DELETE CASCADE IS NOT LIVE — ${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}Removing a job can leave its bindings, treatments, exemplars and notes alive${C.reset}`,
  );
  console.log(
    `  ${C.dim}underneath it — invisible on every screen, and still real in the database. Four${C.reset}`,
  );
  console.log(
    `  ${C.dim}campaign lanes each removed a scratch job through the UI, re-read, saw it gone,${C.reset}`,
  );
  console.log(
    `  ${C.dim}and each left live rows behind (2026-09-08).${C.reset}`,
  );
  console.log(
    `  ${C.dim}Fix: re-apply migrations/platform_soft_delete_cascade.sql (idempotent), then re-run.${C.reset}`,
  );
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}check-soft-delete-cascade crashed:`, err);
    process.exit(2);
  },
);
