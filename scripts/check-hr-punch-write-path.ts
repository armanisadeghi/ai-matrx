#!/usr/bin/env npx tsx
/**
 * HR punch write path conformance — the gate that stands where RLS cannot.
 *
 * WHAT IT PROTECTS: the write path into `hr.punch`. A punch row is the raw,
 * legally-relevant record of when a human started and stopped working. RAW IS
 * RAW: it is written by exactly one sanctioned function (`hr.punch_record`),
 * never UPDATEd except through the void lane, and never DELETEd — a correction
 * is a void plus a new punch.
 *
 * WHY RLS IS NOT ENOUGH: `hr.punch` is a `component` table, and the canonical
 * component write policy permits ANYONE HOLDING EDITOR ON THE PARENT to insert.
 * That is correct for components in general and catastrophic here: with the
 * schema exposed, a browser holding an editor grant could `insert into hr.punch`
 * directly and manufacture a time record that never passed a single invariant —
 * no open-punch check, no rounding rules, no device attestation, no audit trail.
 * RLS says "yes, you are an editor" and lets it through. The only things
 * actually holding the door are structural: hr is NOT in PostgREST's exposed
 * schema list, anon holds no table grants on hr.punch, and the sanctioned
 * writers are a short, enumerated set of SECURITY DEFINER functions with pinned
 * search_paths. Those are facts about the LIVE database, invisible to tsc and
 * invisible to a code review. This gate is what checks them.
 *
 * SPEC-TIME §15 named wiring this query into CI — rather than leaving it as a
 * line on a review checklist — as THE ONLY THING standing between us and a
 * client-direct insert path into hr.punch. A checklist item is a hope; a gate
 * is a mechanism. This file is that mechanism.
 *
 * It calls `public.__hr_punch_write_path_conformance()` (SPEC-DATA-MODEL §18.5 /
 * L3-80), which returns one row per structural check with `ok`, a severity, and
 * a `detail` jsonb carrying `why` plus the violating objects it found.
 *
 *   pnpm check:hr-punch-write-path            # loud, exit 0
 *   pnpm check:hr-punch-write-path:strict     # exit 1 on ANY finding (CI/release)
 *
 * 🚨 UNMEASURED IS NOT PASSED. Two degenerate outcomes are treated as FAILURES,
 * never as a green light:
 *   1. The live pull failed (no creds, DB unreachable, RPC missing/revoked) —
 *      prints the `LIVE PULL FAILED` banner, which run-release-gates.sh's
 *      advisory-marker regex knows, so a degraded run shows as [WARN] with the
 *      banner instead of a silent green [OK].
 *   2. The RPC answered but returned an empty array, or an array missing any of
 *      any expected check_key. A gate that silently measures nothing is
 *      EXACTLY the failure mode this file exists to prevent: it would report a
 *      clean write path while checking zero of it. So the returned check_keys
 *      are compared against EXPECTED_CHECKS and any absentee is reported as a
 *      finding in its own right. Adding a check to the SQL function means adding
 *      its key here in the same change, or the new check can vanish unnoticed.
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
const RPC = "__hr_punch_write_path_conformance";
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

/**
 * The checks the deployed function is contracted to return. A row that
 * stops being returned is a silent hole in the write path's coverage, so the
 * absence of a key is itself a finding — see the header.
 */
const EXPECTED_CHECKS = [
  "pgrst_hr_not_exposed",
  "punch_triggers_present",
  "anon_no_table_grants_on_punch",
  "only_sanctioned_inserters",
  "only_sanctioned_updaters",
  "no_punch_deleters",
  "wrappers_authenticated_only",
  "kiosk_doors_anon_reachable",
  "punch_record_hardened",
  // The COMPUTED lane (hr_l3_14). hr.work_interval is fenced the way hr.punch is: one sanctioned
  // persist door plus the premium writer, and nothing may ever DELETE a superseded row.
  "only_sanctioned_interval_writers",
  "no_interval_deleters",
  // The client door surface (hr_l3_15). `hr` is not PostgREST-exposed, so every client-called HR
  // RPC is a public.hr_* wrapper; this check fences their shape and publishes the live inventory.
  "client_doors_well_formed",
] as const;

interface ConformanceRow {
  readonly check_key: string;
  readonly ok: boolean;
  readonly severity: string;
  readonly detail: Record<string, unknown> | null;
}

function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    // The secret key WINS over the publishable one regardless of the order the
    // two appear in the file: EXECUTE on this RPC is granted to authenticated
    // and service_role and deliberately NOT to anon (that is one of the things
    // it checks), so the publishable key answers 401 and the gate would report
    // itself UNMEASURED on a perfectly healthy database.
    let secret = "";
    let publishable = "";
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secret && m[1] === "SUPABASE_SECRET_KEY") secret = v;
        if (!publishable && m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") publishable = v;
      }
      if (url && secret) break;
    }
    if (!key) key = secret || publishable;
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

/** Renders `detail` for a human: the `why` sentence, then every non-empty finding key. */
function renderDetail(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const lines: string[] = [];
  const why = detail.why;
  if (typeof why === "string" && why.trim()) lines.push(`${C.dim}${why.trim()}${C.reset}`);
  for (const [k, v] of Object.entries(detail)) {
    if (k === "why") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: ${v.map((item) => JSON.stringify(item)).join(", ")}`);
    } else if (v !== null && v !== undefined && v !== "") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines;
}

function unmeasured(reason: string, hint: string): never {
  console.log("");
  console.log(
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — HR punch write path is UNMEASURED${C.reset}`,
  );
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(`  ${C.dim}${hint}${C.reset}`);
  console.log(
    `  ${C.dim}This gate needs the live DB. Nothing here was checked — that is NOT a pass.${C.reset}`,
  );
  console.log("");
  process.exit(STRICT ? 1 : 0);
}

async function main(): Promise<void> {
  const { rows, failure } = await fetchConformance();

  if (failure) {
    unmeasured(
      failure,
      `public.${RPC}() is SECURITY DEFINER with EXECUTE granted to authenticated + service_role.`,
    );
  }

  const returned = rows ?? [];
  const seen = new Set(returned.map((r) => r.check_key));
  const missing = EXPECTED_CHECKS.filter((k) => !seen.has(k));

  // An empty result is the worst possible outcome: the call "succeeded" and
  // measured nothing. Never let it read as a pass.
  if (returned.length === 0) {
    unmeasured(
      `rpc/${RPC} returned ZERO rows — the conformance query measured nothing`,
      `Expected ${EXPECTED_CHECKS.length} checks. An empty result means the function was replaced, neutered, or is failing silently.`,
    );
  }

  const failed = returned.filter((r) => !r.ok);

  if (failed.length === 0 && missing.length === 0) {
    console.log(
      `${TAG.info}HR punch write path: ${C.green}${returned.length}/${EXPECTED_CHECKS.length} conformance checks passed${C.reset} ` +
        `${C.dim}(no client-direct insert path into hr.punch)${C.reset}`,
    );
    process.exit(0);
  }

  console.log("");
  console.log(
    `${TAG.fail}${C.bold}${C.red}HR PUNCH WRITE PATH CONFORMANCE FAILED — ` +
      `${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}public.${RPC}() · SPEC-DATA-MODEL §18.5 / L3-80 · BLOCKING in strict mode${C.reset}`,
  );
  console.log("");

  for (const r of failed) {
    console.log(`  ${C.bold}${r.check_key}${C.reset} ${C.dim}(${r.severity})${C.reset}`);
    for (const line of renderDetail(r.detail)) console.log(`      ${line}`);
    console.log("");
  }

  for (const k of missing) {
    console.log(`  ${C.bold}${k}${C.reset} ${C.dim}(not returned)${C.reset}`);
    console.log(
      `      ${C.dim}This check did not run at all. An unreturned check is an unmeasured check, not a passing one.${C.reset}`,
    );
    console.log("");
  }

  console.log(`  ${C.yellow}${C.bold}What this means${C.reset}`);
  console.log(
    `  ${C.dim}A client-direct insert path into hr.punch may now exist. hr.punch is a component${C.reset}`,
  );
  console.log(
    `  ${C.dim}table, so its RLS write policy admits anyone holding editor on the parent — RLS will${C.reset}`,
  );
  console.log(
    `  ${C.dim}NOT stop this. The structural facts above (schema not exposed to PostgREST, no anon${C.reset}`,
  );
  console.log(
    `  ${C.dim}grants, an enumerated set of sanctioned writers, pinned search_paths) are the only${C.reset}`,
  );
  console.log(
    `  ${C.dim}things that do. A failure here means a punch row can be manufactured without passing${C.reset}`,
  );
  console.log(
    `  ${C.dim}a single invariant hr.punch_record enforces. Fix the offending object before shipping.${C.reset}`,
  );
  console.log("");

  process.exit(STRICT ? 1 : 0);
}

main().catch((err) => {
  console.error(
    `${TAG.fail}check-hr-punch-write-path crashed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
});
