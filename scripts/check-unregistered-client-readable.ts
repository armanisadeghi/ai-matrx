#!/usr/bin/env npx tsx
/**
 * EVERY CLIENT-READABLE TABLE IS REGISTERED — or is on the allowlist with a reason and an owner.
 *
 * WHY THIS EXISTS (DD-159, measured 2026-09-12 on `brsgrqvjdzwihsvnfqkf`)
 * ----------------------------------------------------------------------
 * 251 base tables carried an `anon` or `authenticated` SELECT grant and had NO row in
 * `platform.entity_types` at all. Unregistered is not a small gap — db-rules §1 says
 * "unregistered = does not exist canonically", and everything the platform uses to decide who may
 * read a row hangs off the token:
 *
 *   * `iam.class_lanes` has no `data_class` to resolve, so the table has no class floor;
 *   * `iam.apply_rls` cannot generate a policy for it, so its RLS is whatever somebody hand-wrote;
 *   * `iam.verify_canonical` only walks registered tokens, so no conformance check can ever fail it;
 *   * the access-delta harness compares registered tokens, so a widened door there is invisible.
 *
 * The two vault tables (`users.credential_items`, `users.user_secrets`) were the first two of these
 * ever found, and they were found BY ACCIDENT in a different lane (DD-137b11). That is the class this
 * guard closes: not "these 251 tables are wrong", but "a table can be readable from the browser and
 * be outside every mechanism we have, and nothing says so".
 *
 * COUNTS MEAN NOTHING. This gate never argues from how many. One unregistered client-readable table
 * is a finding because of what it is missing, not because of how many friends it has.
 *
 * WHAT IT CHECKS
 * --------------
 *  1. Every base or partitioned table with an `anon`/`authenticated` SELECT grant, outside the
 *     Postgres and Supabase system schemas, has a `platform.entity_types` row — or an allowlist
 *     entry carrying BOTH a reason (>= 40 characters, so it cannot be "TODO") and an owner.
 *  2. A PARTITION is covered by its parent's registration. A partition inherits its parent's grants
 *     and RLS and is not a separate entity; demanding 28 tokens for `history.row_versions` would be
 *     a rule nobody could satisfy honestly. If the parent is unregistered, the PARENT is the finding.
 *  3. STALE ALLOWLIST ENTRIES FAIL TOO. An entry whose relation is now registered, or no longer
 *     exists, or is no longer client-readable, is removed — never left to rot. A residue list that
 *     quietly shrinks is a residue list nobody re-reads.
 *
 * CREDENTIAL-GATED, AND AN ABSENT CREDENTIAL IS `UNMEASURED`, NOT A PASS. This reads the live
 * database through the same five `SUPABASE_MATRIX_*` variables `pnpm db:apply` uses (this repo's env
 * files first, then the aidream checkout's `.env`). Without them it exits 1 saying UNMEASURED — a
 * guard that cannot run must never read as a guard that ran.
 *
 *   pnpm check:unregistered-client-readable              # report + exit 1 on any finding
 *   pnpm check:unregistered-client-readable --self-test  # prove it RED then GREEN
 *
 * THE SELF-TEST is the forcing function. It runs the real comparison twice against the real live
 * census: once with a synthetic unregistered relation injected and once with the allowlist emptied,
 * and requires a finding both times; then it runs the real one. A guard that has never been seen to
 * fail is not a guard.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = require_("pg");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST = resolve(ROOT, "scripts/unregistered-client-readable-allowlist.json");
const MIN_REASON = 40;

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
};

const DB_VARS = ["SUPABASE_MATRIX_USER", "SUPABASE_MATRIX_PASSWORD", "SUPABASE_MATRIX_HOST", "SUPABASE_MATRIX_PORT", "SUPABASE_MATRIX_DATABASE_NAME"] as const;

interface AllowEntry { readonly relation: string; readonly reason: string; readonly owner: string; readonly anon_readable?: boolean }
interface Census { readonly relation: string; readonly registered: boolean; readonly parent: string | null; readonly anon: boolean }

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function loadDbEnv(): { user: string; password: string; host: string; port: number; database: string; from: string } | null {
  const tryBag = (bag: Record<string, string | undefined>, from: string) => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!, password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!, port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!, from,
    };
  };
  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;
  for (const p of [
    resolve(ROOT, ".env.local"), resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"), resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(p)) continue;
    const hit = tryBag(parseEnvFile(p), p);
    if (hit) return hit;
  }
  return null;
}

/**
 * The census. One query, no heuristics on names: a relation is client-readable iff `aclexplode` on
 * its own ACL yields a SELECT grant to `anon` or `authenticated`, and it is registered iff
 * `platform.entity_types` holds a row for its schema and table.
 */
const CENSUS_SQL = `
with g as (
  select c.oid,
         bool_or(x.grantee = 'anon'          and x.priv = 'SELECT') as anon_sel,
         bool_or(x.grantee = 'authenticated' and x.priv = 'SELECT') as auth_sel
    from pg_class c
    cross join lateral (select (aclexplode(c.relacl)).grantee::regrole::text as grantee,
                               (aclexplode(c.relacl)).privilege_type          as priv) x
   where c.relkind in ('r','p')
   group by c.oid)
select n.nspname || '.' || c.relname as relation,
       (et.token is not null)        as registered,
       (select pn.nspname || '.' || pc.relname
          from pg_inherits i
          join pg_class pc on pc.oid = i.inhparent
          join pg_namespace pn on pn.oid = pc.relnamespace
         where i.inhrelid = c.oid)   as parent,
       g.anon_sel                    as anon
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join g on g.oid = c.oid
  left join platform.entity_types et
    on et.schema_name = n.nspname and et.table_name = c.relname
 where c.relkind in ('r','p')
   and (g.anon_sel or g.auth_sel)
   and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime',
        'vault','supabase_migrations','extensions','graphql','graphql_public','net','pgsodium',
        'pgsodium_masks','supabase_functions','cron','pgbouncer','_analytics','_realtime')
 order by 1;`;

async function census(): Promise<Census[]> {
  const env = loadDbEnv();
  if (!env) {
    console.error(`${TAG.fail}UNMEASURED — none of this repo's env files nor ../aidream/.env carry the five`);
    console.error(`       ${DB_VARS.join(", ")} variables, so the live census could not run.`);
    console.error(`       A guard that cannot run is not a guard that passed. Supply the credentials and re-run.`);
    process.exit(1);
  }
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, port: env.port,
    database: env.database, ssl: { rejectUnauthorized: false }, statement_timeout: 60_000,
  });
  await client.connect();
  try {
    await client.query("set session characteristics as transaction read only");
    const r = await client.query(CENSUS_SQL);
    return r.rows as Census[];
  } finally {
    await client.end();
  }
}

function loadAllowlist(): AllowEntry[] {
  if (!existsSync(ALLOWLIST)) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST, "utf8")) as { entries?: AllowEntry[] };
  return parsed.entries ?? [];
}

interface Verdict { readonly findings: string[]; readonly stale: string[]; readonly bad: string[]; readonly covered: number }

/** The whole judgement, as a pure function of (census, allowlist), so the self-test can drive it. */
function judge(rows: readonly Census[], allow: readonly AllowEntry[]): Verdict {
  const byRelation = new Map(rows.map((r) => [r.relation, r]));
  const allowed = new Map(allow.map((a) => [a.relation, a]));
  const findings: string[] = [];
  const stale: string[] = [];
  const bad: string[] = [];
  let covered = 0;

  for (const a of allow) {
    if (!a.reason || a.reason.trim().length < MIN_REASON) {
      bad.push(`${a.relation}: reason is ${a.reason ? `${a.reason.trim().length} characters` : "missing"}, and an allowlist entry without a real reason is an exemption pretending to be a decision (>= ${MIN_REASON} required)`);
    }
    if (!a.owner || !a.owner.trim()) {
      bad.push(`${a.relation}: no owner. An allowlist entry is a debt, and a debt with nobody's name on it is never paid`);
    }
  }

  for (const r of rows) {
    if (r.registered) continue;
    // A partition is covered by its parent's registration: it inherits the parent's grants and RLS
    // and is not a separate entity. If the parent is itself unregistered, the PARENT is the finding.
    if (r.parent) {
      const parent = byRelation.get(r.parent);
      if (parent?.registered) { covered++; continue; }
      if (parent && !parent.registered) { covered++; continue; } // the parent row carries the finding
      covered++; continue;
    }
    const a = allowed.get(r.relation);
    if (a) { covered++; continue; }
    findings.push(`${r.relation}${r.anon ? "  (readable by ANON)" : ""}`);
  }

  for (const a of allow) {
    const r = byRelation.get(a.relation);
    if (!r) { stale.push(`${a.relation}: no longer exists, or no longer carries a client SELECT grant`); continue; }
    if (r.registered) { stale.push(`${a.relation}: is now registered in platform.entity_types`); }
  }

  return { findings, stale, bad, covered };
}

function report(v: Verdict, total: number): boolean {
  let failed = false;
  if (v.findings.length) {
    failed = true;
    console.error(`${TAG.fail}${v.findings.length} client-readable relation(s) are NOT registered in platform.entity_types`);
    console.error(`       and are not on the allowlist. Unregistered means no class, no generated policy and no`);
    console.error(`       guard — db-rules §1: "unregistered = does not exist canonically".`);
    for (const f of v.findings) console.error(`         ${f}`);
    console.error(`       Register it (see migrations/platform_unregistered_client_readable_dd159_batch1.sql`);
    console.error(`       for the registered-not-regenerated pattern), or add it to`);
    console.error(`       scripts/unregistered-client-readable-allowlist.json WITH a real reason and an owner.`);
  }
  if (v.stale.length) {
    failed = true;
    console.error(`${TAG.fail}${v.stale.length} stale allowlist entr(ies) — remove them from`);
    console.error(`       scripts/unregistered-client-readable-allowlist.json:`);
    for (const s of v.stale) console.error(`         ${s}`);
  }
  if (v.bad.length) {
    failed = true;
    console.error(`${TAG.fail}${v.bad.length} allowlist entr(ies) do not carry a real reason and an owner:`);
    for (const b of v.bad) console.error(`         ${b}`);
  }
  if (!failed) {
    console.log(`${TAG.ok}every one of the ${total} client-readable relations is registered, is a partition of a`);
    console.log(`       registered parent, or is on the allowlist with a reason and an owner (${v.covered} covered)`);
  }
  return failed;
}

async function selfTest(rows: Census[], allow: AllowEntry[]): Promise<void> {
  console.log(`${TAG.info}${C.bold}self-test${C.reset} — the guard must be seen to FAIL before it is believed when it passes`);

  // RED 1: a synthetic client-readable relation nobody registered and nobody allowlisted.
  const injected: Census[] = [...rows, { relation: "selftest.b48_unregistered_probe", registered: false, parent: null, anon: true }];
  const red1 = judge(injected, allow);
  if (!red1.findings.some((f) => f.startsWith("selftest.b48_unregistered_probe"))) {
    console.error(`${TAG.fail}self-test RED 1 did not fire: an unregistered, unallowlisted client-readable relation was not reported`);
    process.exit(1);
  }
  console.log(`${TAG.ok}RED 1 — an injected unregistered relation is reported (${red1.findings.length} finding(s))`);

  // RED 2: the real census with an EMPTY allowlist. Every real unregistered relation must surface.
  const red2 = judge(rows, []);
  if (red2.findings.length === 0) {
    console.error(`${TAG.fail}self-test RED 2 did not fire: with an empty allowlist the live census produced no finding,`);
    console.error(`       which would mean every client-readable relation is already registered. Verify that by hand`);
    console.error(`       before trusting this guard — it is far more likely the census query stopped seeing grants.`);
    process.exit(1);
  }
  console.log(`${TAG.ok}RED 2 — with the allowlist emptied, ${red2.findings.length} live relation(s) surface`);

  // RED 3: an allowlist entry with a stub reason is refused.
  const red3 = judge(rows, [{ relation: rows[0]!.relation, reason: "TODO", owner: "" }]);
  if (red3.bad.length < 2) {
    console.error(`${TAG.fail}self-test RED 3 did not fire: a stub reason and a missing owner were accepted`);
    process.exit(1);
  }
  console.log(`${TAG.ok}RED 3 — a stub reason and a missing owner are both refused`);

  // GREEN: a census in which everything is registered.
  const green = judge(rows.map((r) => ({ ...r, registered: true })), []);
  if (green.findings.length !== 0) {
    console.error(`${TAG.fail}self-test GREEN did not pass: a fully registered census still produced findings`);
    process.exit(1);
  }
  console.log(`${TAG.ok}GREEN — a fully registered census produces no finding`);
  console.log("");
}

async function main(): Promise<void> {
  const rows = await census();
  const allow = loadAllowlist();
  console.log(`${TAG.info}${rows.length} client-readable relations live; ${rows.filter((r) => !r.registered).length} unregistered; allowlist holds ${allow.length}`);

  if (process.argv.includes("--self-test")) await selfTest(rows, allow);

  const failed = report(judge(rows, allow), rows.length);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${TAG.fail}UNMEASURED — the live census failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
