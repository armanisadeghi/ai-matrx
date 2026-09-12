#!/usr/bin/env npx tsx
/**
 * Keyword placement tenancy — does a site still read only its OWN organization's
 * ruling about what a keyword means?
 *
 * WHAT IT PROTECTS: THE ONE LADDER. `seo.keyword_placement_resolve` walks
 * site > brand > organization > system, nearest wins, primary rows only, and
 * `seo.gsc_keyword_topics_for` — the workbench's Offering column — is a
 * presentation layer over it. Both are installed by
 * migrations/seo_keyword_placement_one_resolver.sql.
 *
 * WHY IT EXISTS: until 2026-09-12 `gsc_keyword_topics_for` took a site id,
 * asserted access with it, and then never used it again — it selected EVERY
 * `is_primary` row of `seo.keyword_topic` for the keyword ids it was handed,
 * with no scope ladder and no organization filter. Measured on production that
 * day: every site of one real organization was being shown 935 placements ruled
 * by a different company, every site of that other organization was shown 382 of
 * the first one's, and a site whose organization had ruled nothing at all was
 * shown 1,317 foreign placements as if they were its own. The second half of the
 * same defect lived in the resolver: its candidate set never filtered
 * `is_primary`, so a site placement "removed" by `gsc_set_keyword_topic` — which
 * demotes rather than deletes — kept governing from the nearest rung, and the
 * removal was a no-op.
 *
 * WHY A LIVE PULL AND NOT A SOURCE SCAN: the answer is in the deployed function
 * bodies and in the rows. A `.sql` file on disk looks identical whether or not
 * anyone applied it, and a later migration can replace either function without
 * touching this repo at all (db-rules FEATURE.md §1).
 *
 * HOW IT MEASURES: `public.__keyword_placement_tenancy_conformance()` PLANTS a
 * multi-organization case on a throwaway keyword — organization A's ruling,
 * organization B's ruling, a system default, and a demoted (removed) site
 * placement — reads it back through both functions as a platform admin, and
 * rolls the whole plant back by raising a private error it catches. It is not
 * client-callable: EXECUTE is granted to service_role and postgres only.
 *
 * PROVEN FAILING: run against the pre-fix function bodies in a rolled-back
 * transaction on production (2026-09-12), `one_row_per_site`,
 * `site_sees_own_organization_placement`,
 * `unplaced_organization_falls_back_to_system`, `demoted_row_never_wins` and
 * `topics_for_scope_matches_resolver` all FAILED (each site got three rows —
 * its own, the other tenant's, the platform default); against the new bodies
 * all nine checks passed and the plant left zero residue.
 *
 *   pnpm check:keyword-placement-tenancy            # loud, exit 0
 *   pnpm check:keyword-placement-tenancy:strict     # exit 1 on ANY finding
 *
 * 🚨 UNMEASURED IS NOT PASSED — same three degenerate outcomes as
 * check-soft-delete-cascade.ts, and the same `LIVE PULL FAILED` banner that
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
const RPC = "__keyword_placement_tenancy_conformance";
const TIMEOUT_MS = 20_000;
const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. An absent key is a
 * finding in its own right — see the header.
 */
const EXPECTED_CHECKS = [
  // The probe needs a platform admin (the reads assert site access, and a
  // service-role session has no auth.uid()), a live site in each of two real
  // organizations, a live site in a third, and four live topics. Missing
  // fixtures mean nothing was measured, which is not a pass.
  "probe_fixtures_available",
  // The plant-read-rollback block ended on its own private error and nothing
  // else. Any other error means the readings below are absent, not green.
  "probe_ran_clean",
  // FALSIFIABILITY: a probe that silently planted nothing would find no
  // cross-tenant leak and report clean. Three competing primary rulings must
  // exist on the probe keyword at the moment the reads happen.
  "probe_planted_primaries",
  // One keyword has ONE meaning for a given site. Before the fix each site got
  // three rows back for this keyword: its own, the other tenant's, and the
  // platform default.
  "one_row_per_site",
  // A site reads its OWN organization's ruling, never the other tenant's. This
  // is the defect itself.
  "site_sees_own_organization_placement",
  // An organization that has ruled nothing inherits the PLATFORM default, not a
  // stranger's opinion — the 1,317 organization-tier primaries with no system
  // row underneath them are exactly what unruled sites were being shown.
  "unplaced_organization_falls_back_to_system",
  // `gsc_set_keyword_topic` removes a site placement by demoting it to
  // is_primary = false. A demoted row sits on the nearest rung, so an
  // unfiltered resolver lets the removed topic keep governing forever.
  "demoted_row_never_wins",
  // THERE IS ONE LADDER. The moment the tier and organization
  // `gsc_keyword_topics_for` reports disagree with the resolver's, a second
  // ladder has grown back.
  "topics_for_scope_matches_resolver",
  // The probe writes into production tables and undoes every row before it
  // returns. Residue would make this gate a writer.
  "probe_left_no_residue",
] as const;

type ExpectedCheck = (typeof EXPECTED_CHECKS)[number];

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
 * Same resolution order as check-soft-delete-cascade.ts, and for the same
 * reason: the secret key WINS over the publishable one regardless of file order,
 * because EXECUTE on this RPC is granted to service_role and postgres and never
 * to anon or authenticated — any other key answers 401/403 and the gate would
 * report itself UNMEASURED against a perfectly healthy database.
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
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — keyword placement tenancy is UNMEASURED${C.reset}`,
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
    `${C.bold}Keyword placement tenancy${C.reset} ${C.dim}(public.${RPC})${C.reset}`,
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
    if (!EXPECTED_CHECKS.includes(r.check_key as ExpectedCheck)) {
      console.log(
        `  ${TAG.info}unlisted  ${r.check_key} ${C.dim}— add it to EXPECTED_CHECKS in scripts/check-keyword-placement-tenancy.ts${C.reset}`,
      );
    }
  }

  console.log("");
  if (failed.length === 0 && missing.length === 0) {
    console.log(
      `${TAG.ok}A site reads its own organization's ruling, inherits the platform default when it has none, and a removed placement stays removed.`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `${TAG.fail}${C.bold}${C.red}KEYWORD PLACEMENT IS CROSSING TENANTS — ${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}The Offering column can show a site what a DIFFERENT company decided its${C.reset}`,
  );
  console.log(
    `  ${C.dim}keywords mean, and a placement someone removed can keep governing. Measured${C.reset}`,
  );
  console.log(
    `  ${C.dim}on production 2026-09-12: 935 placements of one organization shown to another${C.reset}`,
  );
  console.log(
    `  ${C.dim}organization's sites, 382 the other way, and 1,317 shown to sites whose own${C.reset}`,
  );
  console.log(
    `  ${C.dim}organization had ruled nothing at all.${C.reset}`,
  );
  console.log(
    `  ${C.dim}Fix: re-apply migrations/seo_keyword_placement_one_resolver.sql (idempotent-safe), then re-run.${C.reset}`,
  );
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}check-keyword-placement-tenancy crashed:`, err);
    process.exit(2);
  },
);
