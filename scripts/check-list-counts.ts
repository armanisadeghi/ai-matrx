#!/usr/bin/env npx tsx
/**
 * LIST COUNTS ARE THE LIST, AND MY TEAM IS HONEST — the live guard (list-shell fix D, 2026-09-28).
 *
 * Reader for `public.__list_counts_conformance()`, which checks, IN THE CATALOG:
 *   counts_delegate_to_list        every *_list_counts / *_list_scope_counts whose *_list_scoped twin
 *                                  exists CALLS it — a tab count is its list query, so the two cannot
 *                                  drift (the flashcards/quizzes counts re-implemented the match and
 *                                  skipped "Shown to": 37 counted vs 36 listed).
 *   education_counts_equal_list    each flashcards/quizzes lane count equals its list total, for a
 *                                  sample of real people.
 *   team_reach_empty_without_team  iam.my_team_reach is EMPTY where the person is on no live team (it
 *                                  used to hold the person alone, so My team was a copy of Mine:
 *                                  quizzes 27 = 27, flashcards 186 = 186), and holds them where they are.
 *
 * RED on the old definitions (run in a rolled-back transaction, 2026-09-28): counts_delegate_to_list
 * 2 offenders, team_reach_empty_without_team 18 offenders. GREEN after.
 *
 *   pnpm check:list-counts            # loud, exit 0
 *   pnpm check:list-counts:strict     # exit 1 on ANY finding or an UNMEASURED run
 *
 * UNMEASURED IS NOT PASSED — no credentials, an unreachable DB, an empty answer or a missing check
 * key prints LIVE PULL FAILED and fails --strict.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__list_counts_conformance";
const TIMEOUT_MS = 15_000;
const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. An absent key is a
 * finding in its own right — see the header.
 */
const EXPECTED_CHECKS = [
  "counts_delegate_to_list",
  "education_counts_equal_list",
  "team_reach_empty_without_team",
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
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — list counts and My team are UNMEASURED${C.reset}`,
  );
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(
    `  ${C.dim}Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. Nothing was checked — that is NOT a pass.${C.reset}`,
  );
  console.log("");
  exitAfterDrain(STRICT ? 1 : 0);
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
    `${C.bold}List counts are the list · My team is honest${C.reset} ${C.dim}(public.${RPC})${C.reset}`,
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
        `  ${TAG.info}unlisted  ${r.check_key} ${C.dim}— add it to EXPECTED_CHECKS in scripts/check-list-counts.ts${C.reset}`,
      );
    }
  }

  console.log("");
  if (failed.length === 0 && missing.length === 0) {
    console.log(
      `${TAG.ok}Every list count is its list query, and My team is empty for people on no team.`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `${TAG.fail}${C.bold}${C.red}LIST COUNTS / MY TEAM NOT CONFORMANT — ${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}Fix the named function: a count calls its *_list_scoped twin; iam.my_team_reach skips organizations where the person is on no team.${C.reset}`,
  );
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => exitAfterDrain(code),
  (err) => {
    console.error(`${TAG.fail}check-list-counts crashed:`, err);
    exitAfterDrain(2);
  },
);
