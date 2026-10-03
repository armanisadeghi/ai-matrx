#!/usr/bin/env npx tsx
/**
 * CHAIR-READPERF — the definer-grant guard leaves another session's pg_temp function alone.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_temp_guard.ts        (dev clone only)
 *
 * Session A makes a session-temporary SECURITY DEFINER function and grants EXECUTE on it to `authenticated`
 * (what a timing harness does). Session B then issues a GRANT on a function (a re-grant of one custom.resolve_context
 * already holds), which makes platform.enforce_definer_client_grants re-sweep the whole database. GREEN when
 * session A's function still holds its grant afterwards; RED (exit 1) when the sweep revoked it — which is what
 * the body before chairreadperf_c did, and what this check shows when that file's inverse is on the clone.
 */
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";

async function connect(name: string) {
  const url = new URL(dsnFor("clone", { app: name }));
  const c = new pg.Client({ host: `db.${currentCloneRef()}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password),
    database: "postgres", ssl: { rejectUnauthorized: false }, application_name: name, query_timeout: 120_000 });
  await c.connect();
  return c;
}

async function main() {
  const a = await connect("chair-readperf-temp-guard-a");
  const b = await connect("chair-readperf-temp-guard-b");
  const who = (await a.query(`select (select count(*) from cron.job where active)::int as jobs, exists (select 1 from pg_extension where extname = 'pg_net') as net`)).rows[0];
  if (!(who.jobs === 0 && !who.net)) throw new Error("REFUSED: this is not the quarantined dev clone");
  try {
    await a.query(`create function pg_temp.chair_readperf_probe() returns integer language sql security definer set search_path to '' as $$ select 1 $$`);
    await a.query(`grant execute on function pg_temp.chair_readperf_probe() to authenticated`);
    const before = (await a.query(`select has_function_privilege('authenticated', 'pg_temp.chair_readperf_probe()'::regprocedure, 'EXECUTE') as ok`)).rows[0].ok;
    if (!before) {
      // the body before chairreadperf_c: the session's own GRANT triggers the sweep, which revokes it at once
      console.log("RED   the guard REVOKED this session's pg_temp grant inside the session's own GRANT statement");
      process.exitCode = 1;
      return;
    }
    await b.query(`grant execute on function custom.resolve_context(text, uuid, uuid[], uuid[], text[]) to authenticated`);
    const after = (await a.query(`select has_function_privilege('authenticated', 'pg_temp.chair_readperf_probe()'::regprocedure, 'EXECUTE') as ok`)).rows[0].ok;
    console.log(`${after ? "GREEN" : "RED  "} another session's GRANT ${after ? "left" : "REVOKED"} this session's pg_temp grant`);
    process.exitCode = after ? 0 : 1;
  } finally {
    await a.end(); await b.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
