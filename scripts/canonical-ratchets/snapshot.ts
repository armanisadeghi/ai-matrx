/**
 * Shared fetch + freshness contract for the two canonical ratchet gates.
 *
 * Both gates read ONE live snapshot: `public.canonical_ratchet_snapshot()`
 * (ledgered as `migrations/canonical_ratchet_snapshot.sql`). It reads the CACHED
 * audit store and never refreshes it — see FEATURE.md § "The refresh cost".
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

/** One live table that looks like an entity and is not in `platform.entity_types`. */
export interface UnregisteredCandidate {
  schema: string;
  table: string;
  /** audit.unregistered_candidates.base_col_score — 4+ ≈ a real entity. */
  score: number;
}

/** One `iam.verify_canonical` FAIL on a table born after the doctrine cutoff. */
export interface PostDoctrineFail {
  schema: string;
  table: string;
  token: string;
  check_name: string;
  detail: string;
  born_at: string;
}

export interface RatchetSnapshot {
  generated_at: string;
  /** max(audit.refresh_log.run_at) — null if the store has never been refreshed. */
  audit_refreshed_at: string | null;
  post_doctrine_cutoff: string;
  min_base_col_score: number;
  /** Is the `ddl_guard` event trigger live AND enabled? Birth records depend on it. */
  ddl_guard_attached: boolean;
  ddl_guard_log_earliest: string | null;
  births_after_cutoff: number;
  unregistered: UnregisteredCandidate[];
  post_doctrine_fails: PostDoctrineFail[];
}

/**
 * ONE name for the Supabase URL — no second candidate, no fallback chain.
 * See common-docs/policies/package-vs-implementation.md.
 */
export function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

export async function rpc(name: string, url: string, key: string): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
    },
    body: "{}",
  });
  if (!res.ok) throw new Error(`RPC ${name} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/**
 * Pull the snapshot. `refresh` opts into `audit.refresh()` FIRST (4.5-5.5s,
 * writes) — never the default; the gates are meant to be fast and read-only.
 *
 * Returns null (with a loud warning already printed) when credentials are absent
 * or the database is unreachable, matching every other DB-touching gate in this
 * repo: a gate may skip when it cannot measure, but it may never pretend it did.
 */
export async function pullSnapshot(opts: { refresh?: boolean } = {}): Promise<RatchetSnapshot | null> {
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.yellow}[WARN]${C.reset} NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY absent — canonical ratchet not measured.`,
    );
    return null;
  }
  try {
    if (opts.refresh) {
      const t0 = Date.now();
      const note = await rpc("canonical_ratchet_refresh", env.url, env.key);
      console.log(`${C.dim}  audit.refresh() ran in ${Date.now() - t0}ms — ${String(note)}${C.reset}`);
    }
    return (await rpc("canonical_ratchet_snapshot", env.url, env.key)) as RatchetSnapshot;
  } catch (err) {
    console.error(`${C.yellow}[WARN]${C.reset} could not reach Supabase: ${String(err)}`);
    return null;
  }
}

/** Freshness verdict on the cached audit store. */
export type Freshness = { hours: number | null; level: "fresh" | "stale" | "rotten" | "never" };

/**
 * THE FRESHNESS CONTRACT (the answer to "don't silently skip the refresh cost").
 *
 * The gate reads the cache, so the cache's age is part of the measurement and is
 * always printed. Thresholds: under 24h fresh; 24h-7d a loud WARN (the numbers
 * are probably still right, the release is not held hostage to a calendar); over
 * 7d ROTTEN — in --strict that FAILS, because at that age "no growth" is not a
 * measurement, it is an assumption. The remedy is in the message:
 * `--refresh`, or `SELECT audit.refresh();`.
 */
export function freshness(snapshot: RatchetSnapshot): Freshness {
  if (!snapshot.audit_refreshed_at) return { hours: null, level: "never" };
  const hours = (Date.parse(snapshot.generated_at) - Date.parse(snapshot.audit_refreshed_at)) / 3_600_000;
  if (hours > 24 * 7) return { hours, level: "rotten" };
  if (hours > 24) return { hours, level: "stale" };
  return { hours, level: "fresh" };
}

/** Print the freshness + birth-recorder header both gates share. Returns true if blocking. */
export function printPreamble(snapshot: RatchetSnapshot, strict: boolean): boolean {
  const f = freshness(snapshot);
  const age =
    f.hours === null ? "never refreshed" : `${f.hours.toFixed(1)}h old (${snapshot.audit_refreshed_at})`;
  let blocking = false;

  if (f.level === "fresh") {
    console.log(`  ${C.dim}audit store ${age}${C.reset}`);
  } else {
    const rotten = f.level === "rotten" || f.level === "never";
    const tag = rotten && strict ? `${C.red}[FAIL]` : `${C.yellow}[WARN]`;
    console.log(
      `  ${tag}${C.reset} audit store is ${f.level.toUpperCase()} — ${age}. ` +
        `The ratchet is measuring a CACHE, not the live database.`,
    );
    console.log(`  ${C.cyan}fix: pnpm check:canonical-ratchets --refresh${C.reset}  ${C.dim}(or SELECT audit.refresh();)${C.reset}`);
    if (rotten && strict) blocking = true;
  }

  if (!snapshot.ddl_guard_attached) {
    console.log(
      `  ${strict ? `${C.red}[FAIL]` : `${C.yellow}[WARN]`}${C.reset} the ${C.bold}ddl_guard${C.reset} event trigger is NOT attached/enabled. ` +
        `Table births stop being recorded, so the post-doctrine set can only look green.`,
    );
    console.log(
      `  ${C.cyan}fix: re-attach it (event triggers are silently dropped by a project restore — db-rules FEATURE.md, 2026-08-20).${C.reset}`,
    );
    if (strict) blocking = true;
  }
  return blocking;
}
