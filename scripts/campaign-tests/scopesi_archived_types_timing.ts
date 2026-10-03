#!/usr/bin/env npx tsx
/**
 * LANE 9 SCOPES-ON-THE-STORE (SCOPES-I) — THE ARCHIVED SCOPE TYPES WALK THE LADDER ONCE: timing gate (dev clone only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/scopesi_archived_types_timing.ts
 *
 * THE USE CASE. test@test.com and admin@admin.com open the scopes page of Cedar Ridge Physical Therapy, which
 * holds 21 archived scope types; the archived list counts each type's archived scopes through the archive door
 * (custom.read_records_archived, chair ruling 4). Before migrations/campaign/scopesi_the_archived_scope_types_
 * ask_the_ladder_once.sql every one of those asks walked the practice's containment edges again
 * (custom.carrying_edges_in, once per type); after it the walk runs ONCE for all of them.
 *
 * INTERLEAVED A/B on ONE session-pooler backend: A = the body before the file, loaded from its inverse as a
 * pg_temp copy; B = the live custom.context_archived_types. Every call is its own transaction, as PostgREST runs
 * one request, nothing written (the statement memos are fenced to a transaction that has written nothing).
 * Server side: clock_timestamp() - statement_timestamp() after the answer is materialized. One warm call each,
 * then RUNS (7) rounds, A and B alternating which goes first; the median is the number.
 *
 * Every timed call also reads, from its own transaction's function statistics (track_functions, SET LOCAL),
 * how many times it walked containment (calls of custom.carrying_edges_in, the edge set each walk reads) and
 * how long its containment answers took (total time in custom.read_door_carried_ids, walk and memo reads).
 *
 * GREEN, for each seat, when BOTH hold:
 *   1. B walks containment once per call and A once per counted type (> 1) — the cause, counted;
 *   2. the median time B spends walking <= WALK_RATIO (0.5) x A's — the cause, timed, so the shared clone's
 *      load swings (one call 1.5-13 s on 2026-10-03) cannot fake it either way.
 * The whole call's medians and their ratio are printed beside it, measured, not gated: on the loaded clone the
 * archive door's own per-type work (see the SCOPES-I report) swamps the walk this file shares.
 * Before the file is live B is A's body, so both fail: RED. `--as-before` makes B a second pg_temp copy of the
 * inverse's body, which is that state on a clone where the file is already live. Exit 0 GREEN, 1 RED, 2 could not run.
 *
 * The pg_temp copy is a SECURITY DEFINER door; the definer-grant sweep (platform.enforce_definer_client_grants)
 * strips any undeclared client grant, a concurrent lane's DDL included. So the copy's grant to `authenticated`
 * is given with the sweep's own transaction-local re-entrancy marker set, given again before each call, and a
 * call refused for that reason is retried. Clone only: the run refuses any database with an active pg_cron job
 * or pg_net (never true of production).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { requireRehearsalDbEnv } from "../lib/direct-db-env";

const ROOT = resolve(__dirname, "..", "..");
const INVERSE = resolve(ROOT, "migrations/inverse/scopesi_the_archived_scope_types_ask_the_ladder_once_down.sql");
const RUNS = Number(process.env.RUNS ?? 7);
const WALK_RATIO = Number(process.env.WALK_RATIO ?? 0.5);
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy (21 archived scope types)
const SEATS: Record<string, string> = {
  "test@test.com": "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
  "admin@admin.com": "87a6e699-3622-4869-8843-d0867456c0dd",
};
const A = "pg_temp.archived_types_before";
const AS_BEFORE = process.argv.includes("--as-before");
const B = AS_BEFORE ? "pg_temp.archived_types_before_too" : "custom.context_archived_types";

function bodyAs(name: string): string {
  const text = readFileSync(INVERSE, "utf8");
  const at = text.indexOf("CREATE OR REPLACE FUNCTION custom.context_archived_types(");
  if (at < 0) throw new Error(`UNMEASURED: no context_archived_types body in ${INVERSE}`);
  return text.slice(at).replace("FUNCTION custom.context_archived_types(", `FUNCTION ${name}(`);
}

async function main() {
  const env = requireRehearsalDbEnv("scopesi_archived_types_timing installs function bodies");
  const client = new pg.Client({
    user: env.user, password: env.password, host: env.host, database: env.database,
    port: 5432, // the session pooler: the pg_temp copy and every call share one backend
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const who = await client.query(
    `select current_user as u, (select count(*) from cron.job where active)::int as jobs,
            exists (select 1 from pg_extension where extname = 'pg_net') as net`,
  );
  const { u, jobs, net } = who.rows[0];
  if (jobs !== 0 || net || /brsgrqvjdzwihsvnfqkf/.test(env.user)) {
    console.log(`REFUSED: ${u} (${env.user}) is not the quarantined dev clone (cron ${jobs}, pg_net ${net}).`);
    process.exit(2);
  }
  console.log(`# ${env.user} (${env.from}); A = ${A} (the inverse's body), B = ${B} (${AS_BEFORE ? "the inverse's body again, --as-before" : "live"}); ${RUNS} rounds, walk ratio ${WALK_RATIO}`);

  async function grant() {
    for (let k = 0; k < 6; k++) {
      try {
        await client.query("begin");
        await client.query("select set_config('platform.definer_sweep', '1', true)");
        await client.query(`grant execute on function ${A}(uuid) to authenticated`);
        if (AS_BEFORE) await client.query(`grant execute on function ${B}(uuid) to authenticated`);
        await client.query("commit");
        return;
      } catch {
        await client.query("rollback").catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw new Error("UNMEASURED: could not grant the pg_temp copy");
  }
  await client.query("begin");
  await client.query("select set_config('platform.definer_sweep', '1', true)");
  await client.query(bodyAs(A));
  if (AS_BEFORE) await client.query(bodyAs(B));
  await client.query("commit");
  await grant();

  async function inSeat<T>(uid: string, fn: () => Promise<T>, prep: string[] = []): Promise<T> {
    for (let k = 0; ; k++) {
      if (k > 0) await grant();
      await client.query("begin");
      try {
        for (const p of prep) await client.query(p);
        await client.query(
          "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
          [uid],
        );
        await client.query("set local statement_timeout = '120s'");
        await client.query("set local role authenticated");
        return await fn();
      } catch (e) {
        if (k < 5 && /permission denied for function archived_types_before/.test(String(e))) continue;
        throw e;
      } finally {
        await client.query("rollback").catch(() => {});
      }
    }
  }
  const timed = (uid: string, door: string) =>
    inSeat(uid, async () => {
      const r = await client.query(
        `with a as materialized (select ${door}($1::uuid) as v)
         select v, (extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::float8 as ms from a`,
        [ORG],
      );
      await client.query("reset role");
      const w = await client.query(
        `select coalesce(sum(calls) filter (where funcname = 'carrying_edges_in'), 0)::int as walks,
                coalesce(sum(total_time) filter (where funcname = 'read_door_carried_ids'), 0)::float8 as walk_ms
           from pg_stat_xact_user_functions
          where schemaname = 'custom' and funcname in ('carrying_edges_in', 'read_door_carried_ids')`,
      );
      const counted = (r.rows[0].v as { archived_scope_count: number }[]).filter((x) => x.archived_scope_count > 0).length;
      return { ms: Number(r.rows[0].ms), walks: Number(w.rows[0].walks), walkMs: Number(w.rows[0].walk_ms), counted };
    }, ["set local track_functions = 'all'"]);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  let red = 0;
  for (const [seat, uid] of Object.entries(SEATS)) {
    await timed(uid, A);
    await timed(uid, B);
    const ra: Awaited<ReturnType<typeof timed>>[] = [];
    const rb: Awaited<ReturnType<typeof timed>>[] = [];
    for (let i = 0; i < RUNS; i++) {
      if (i % 2 === 0) { ra.push(await timed(uid, A)); rb.push(await timed(uid, B)); }
      else { rb.push(await timed(uid, B)); ra.push(await timed(uid, A)); }
    }
    const ma = median(ra.map((x) => x.ms));
    const mb = median(rb.map((x) => x.ms));
    const wa = median(ra.map((x) => x.walkMs));
    const wb = median(rb.map((x) => x.walkMs));
    const counted = ra[0].counted;
    const walkOk = rb.every((x) => x.walks === 1) && ra.every((x) => x.walks === counted) && counted > 1;
    const timeOk = wb <= WALK_RATIO * wa;
    if (!walkOk || !timeOk) red++;
    console.log(
      `${walkOk && timeOk ? "GREEN" : "RED  "} ${seat}: walks per call A ${[...new Set(ra.map((x) => x.walks))].join("/")} ` +
        `(counted types ${counted}) B ${[...new Set(rb.map((x) => x.walks))].join("/")}; ` +
        `median walk time A ${wa.toFixed(0)} ms, B ${wb.toFixed(0)} ms (B/A ${(wb / wa).toFixed(2)}, need <= ${WALK_RATIO}); ` +
        `whole call median A ${ma.toFixed(0)} ms, B ${mb.toFixed(0)} ms (B/A ${(mb / ma).toFixed(2)}, measured)` +
        `\n      A ${ra.map((x) => x.ms.toFixed(0)).join(" ")}\n      B ${rb.map((x) => x.ms.toFixed(0)).join(" ")}`,
    );
  }
  await client.end();
  console.log(red ? `RED: ${red} seat(s)` : "GREEN: both seats");
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
