#!/usr/bin/env npx tsx
/**
 * CHAIR-READPERF — custom.levels_of answers the same {l, s} for every seat before and after.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_levels_parity.ts        (dev clone only)
 *
 * The BEFORE body is the inverse file's, created as a session-temporary copy (pg_temp.levels_before); the
 * AFTER body is what the clone holds (custom.levels_of, after `pnpm db:apply … --target clone`). For every
 * person with an active organization membership (every seat) the two are asked, in one read-only transaction
 * per seat with that person's claims, about the SAME set: every live scope of every live organization the
 * person is an active member of (the hand-off's parity set, lane 9's), 200 other organizations' scopes (which
 * must answer null/false), and up to 400 live ordinary records of the person's organizations. RED on any id whose {l, s}
 * differs. The run holds no door row and grants nothing: the doors are internal and both copies run as the
 * store's owner with the seat's claims, as the parity sweep of lane 9 did.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const ROOT = resolve(__dirname, "..", "..");
const DOWN = "migrations/inverse/chairreadperf_b_the_class_walk_folds_in_the_persons_own_membership_down.sql";

async function main() {
  const url = new URL(dsnFor("clone", { app: "chair-readperf-parity" }));
  const ref = currentCloneRef();
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password),
    database: "postgres", ssl: { rejectUnauthorized: false }, application_name: "chair-readperf-parity", query_timeout: 600_000,
  });
  await client.connect();
  const who = (await client.query(`select (select count(*) from cron.job where active)::int as jobs, exists (select 1 from pg_extension where extname = 'pg_net') as net`)).rows[0];
  if (!(who.jobs === 0 && !who.net)) throw new Error("REFUSED: this is not the quarantined dev clone");
  const text = readFileSync(resolve(ROOT, DOWN), "utf8");
  const at = text.indexOf("CREATE OR REPLACE FUNCTION custom.levels_of(");
  if (at < 0) throw new Error("no levels_of body in the inverse file");
  await client.query(text.slice(at).replace("CREATE OR REPLACE FUNCTION custom.levels_of(", "CREATE OR REPLACE FUNCTION pg_temp.levels_before("));

  const seats = (await client.query(
    `select user_id from (select distinct m.user_id from iam.memberships m
       join iam.organizations o on o.id = m.organization_id and o.archived_at is null
      where m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null
        and exists (select 1 from context.scope_types st where st.organization_id = m.organization_id and st.deleted_at is null)) u
      order by (u.user_id in ('87a6e699-3622-4869-8843-d0867456c0dd','4060701e-706a-4c76-b3ca-0bbc69fa5a14')) desc, 1`)).rows.map((r: { user_id: string }) => r.user_id);
  const foreign = (await client.query(
    `select array_agg(id) as ids from (select s.id from context.scopes s join iam.organizations o on o.id = s.organization_id and o.archived_at is null
      where s.deleted_at is null order by s.id limit 100) x`)).rows[0].ids as string[];
  console.log(`# ${seats.length} seats: own organizations' live scopes + ${foreign.length} sampled scopes + up to 400 own ordinary records each`);
  let red = 0, ids = 0, classesBefore = 0;
  const t0 = Date.now();
  for (const uid of seats) {
    await client.query("begin isolation level repeatable read read only");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await client.query("set local statement_timeout = '5min'");
      const r = await client.query(
        `with own as (
           select (array_agg(x.id))[1:150] as ids
             from (select r.id from custom.record r
                    where r.deleted_at is null and r.data_class = 'record'
                      and r.organization_id in (select m.organization_id from iam.memberships m
                                                 where m.user_id = $1 and m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null)
                    order by r.organization_id, r.table_id, r.created_at limit 600) x),
         mine as (select coalesce(array_agg(s.id), '{}'::uuid[]) as ids from context.scopes s
                   join iam.organizations o on o.id = s.organization_id and o.archived_at is null
                  where s.deleted_at is null and s.organization_id in (select m.organization_id from iam.memberships m
                          where m.user_id = $1 and m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null)),
         set as (select (select ids from mine) || $2::uuid[] || coalesce((select ids from own), '{}'::uuid[]) as ids),
         a as (select pg_temp.levels_before($1::uuid, ids) as j, clock_timestamp() as t0 from set),
         b as (select custom.levels_of($1::uuid, ids) as j, clock_timestamp() as t1 from set, a),
         a2 as (select pg_temp.levels_before($1::uuid, ids) as j, clock_timestamp() as t2 from set, b),
         b2 as (select custom.levels_of($1::uuid, ids) as j, clock_timestamp() as t3 from set, a2)
         select (select count(*) from jsonb_each(a.j)) as n,
                round(extract(epoch from (b.t1 - a.t0)) * 1000) as ms_before, round(extract(epoch from (b2.t3 - a2.t2)) * 1000) as ms_after,
                (select count(*) from jsonb_each(a.j) e where ((b.j -> e.key) - 'o') is distinct from (e.value - 'o')) as differ,
                (select count(*) from jsonb_each(b.j) e where (a.j -> e.key) is null) as extra,
                (select string_agg(e.key || ' before ' || e.value::text || ' after ' || coalesce((b.j -> e.key)::text, 'absent'), '; ')
                   from (select * from jsonb_each(a.j) limit 100000) e where ((b.j -> e.key) - 'o') is distinct from (e.value - 'o')) as sample
           from a, b, a2, b2`, [uid, foreign]);
      const row = r.rows[0];
      ids += Number(row.n);
      console.log(`seat ${uid}: ${row.n} ids, levels_of before ${row.ms_before} ms, after ${row.ms_after} ms${Number(row.differ) || Number(row.extra) ? "" : " — same"}`);
      if (Number(row.differ) > 0 || Number(row.extra) > 0) {
        red++;
        console.log(`RED  seat ${uid}: ${row.differ} of ${row.n} ids differ, ${row.extra} extra — ${String(row.sample).slice(0, 600)}`);
      }
    } finally {
      await client.query("rollback");
    }
  }
  await client.end();
  console.log(`${red === 0 ? "GREEN" : "RED  "} SAME ${seats.length - red}/${seats.length} seats answer the same {l, s} for every id (${ids} seat-ids checked, ${formatDurationMs(Date.now() - t0, { style: "compact" })})`);
  process.exit(red ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
