#!/usr/bin/env npx tsx
/**
 * CHAIR-READPERF round 2 — custom.levels_of hands each record's organization on, and custom._where_ids_open_with
 * answers the same bytes with it.
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/chairreadperf_where_parity.ts        (dev clone only)
 *
 * BEFORE = the two bodies in the inverse of chairreadperf_f, as session-temporary copies; AFTER = what the clone
 * holds. For every seat (a person with an active membership in a live organization that has scope types), in one
 * read-only transaction with that person's claims, over: every live scope of the person's organizations, 100 other
 * organizations' scopes, 150 of the person's organizations' ordinary records and 150 of their Tables and Fields
 * (the kernel arm):
 *   LEVELS  `l` and `s` are the same for every id;
 *   ORG     `o` is present exactly when one row carries the id, and is that row's organization;
 *   WHERE   _where_ids_open_with(ids, person, levels) is the same text before and after (each fed its own levels);
 *   ALONE   _where_ids_open_with(ids) — no levels handed in — is the same text before and after.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { currentCloneRef, dsnFor } from "../lib/pooled-db.mjs";

const ROOT = resolve(__dirname, "..", "..");
const DOWN = "migrations/inverse/chairreadperf_f_the_class_walk_hands_each_records_organization_on_down.sql";

function bodyOf(text: string, fn: string, as: string): string {
  const head = `CREATE OR REPLACE FUNCTION custom.${fn}(`;
  const at = text.indexOf(head);
  const end = text.indexOf("\n$function$;", at);
  if (at < 0 || end < 0) throw new Error(`${DOWN}: no ${fn} body`);
  return text.slice(at, end + "\n$function$".length).replace(head, `CREATE OR REPLACE FUNCTION pg_temp.${as}(`);
}

const WRAPPER = `create or replace function pg_temp.where_parity(p_uid uuid, p_foreign uuid[]) returns jsonb language sql security definer set search_path to '' as $wp$
with orgs as (select m.organization_id from iam.memberships m where m.user_id = p_uid and m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null),
         mine as (select coalesce(array_agg(s.id), '{}'::uuid[]) as ids from context.scopes s
                   join iam.organizations o on o.id = s.organization_id and o.archived_at is null
                  where s.deleted_at is null and s.organization_id in (select organization_id from orgs)),
         own as (select coalesce(array_agg(x.id), '{}'::uuid[]) as ids from (select r.id from custom.record r
                  where r.deleted_at is null and r.data_class = 'record' and r.organization_id in (select organization_id from orgs)
                  order by r.organization_id, r.table_id, r.created_at limit 150) x),
         parts as (select coalesce(array_agg(x.id), '{}'::uuid[]) as ids from (select r.id from custom.record r
                  where r.organization_id in (select organization_id from orgs)
                    and r.table_id in ('11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002')
                  order by r.organization_id, r.created_at limit 150) x),
         set as materialized (select (select ids from mine) || p_foreign || (select ids from own) || (select ids from parts) as ids),
         lb as materialized (select pg_temp.levels_before(p_uid, ids) as j from set),
         la as materialized (select custom.levels_of(p_uid, ids) as j from set),
         wb as materialized (select pg_temp.where_before(set.ids, p_uid, lb.j) as j from set, lb),
         wa as materialized (select custom._where_ids_open_with(set.ids, p_uid, la.j) as j from set, la),
         wb0 as materialized (select pg_temp.where_before(set.ids) as j from set),
         wa0 as materialized (select custom._where_ids_open_with(set.ids) as j from set)
         select jsonb_build_object(
                'n', (select count(*) from jsonb_each(lb.j))::int,
                'levels_differ', (select count(*) from jsonb_each(lb.j) e where ((la.j -> e.key) - 'o') is distinct from e.value)::int,
                'levels_extra', (select count(*) from jsonb_each(la.j) e where (lb.j -> e.key) is null)::int,
                'org_wrong', (select count(*) from jsonb_each(la.j) e
                   left join lateral (select count(*) as c, min(x.organization_id::text) as o from custom.record x where x.id = e.key::uuid) z on true
                  where (e.value ->> 'o') is distinct from (case when z.c = 1 then z.o end))::int,
                'with_o', (select count(*) from jsonb_each(la.j) e where e.value ? 'o')::int,
                'where_same', (wb.j::text = wa.j::text), 'alone_same', (wb0.j::text = wa0.j::text),
                'opened', (select count(*) from jsonb_each(wa.j))::int,
                'seen', (select count(*) from jsonb_each(la.j) e where (e.value ->> 's')::boolean)::int,
                'kinds', (select string_agg(distinct e.value ->> 'kind', ',') from jsonb_each(wa.j) e))
           from lb, la, wb, wa, wb0, wa0
$wp$`;

async function main() {
  const url = new URL(dsnFor("clone", { app: "chair-readperf-where-parity" }));
  const client = new pg.Client({ host: `db.${currentCloneRef()}.supabase.co`, port: 5432, user: "postgres", password: decodeURIComponent(url.password),
    database: "postgres", ssl: { rejectUnauthorized: false }, application_name: "chair-readperf-where-parity", query_timeout: 600_000 });
  await client.connect();
  const who = (await client.query(`select (select count(*) from cron.job where active)::int as jobs, exists (select 1 from pg_extension where extname = 'pg_net') as net`)).rows[0];
  if (!(who.jobs === 0 && !who.net)) throw new Error("REFUSED: this is not the quarantined dev clone");
  const text = readFileSync(resolve(ROOT, DOWN), "utf8");
  await client.query(bodyOf(text, "levels_of", "levels_before"));
  await client.query(bodyOf(text, "_where_ids_open_with", "where_before"));
  // THE SEAT, NOT THE OWNER. Called as postgres the where door takes its store-owner arm and opens every id; the
  // comparison runs as `authenticated` with the person's claims, through this session-temporary SECURITY DEFINER
  // wrapper (the doors themselves carry no client grant; chairreadperf_c is what lets the temporary grant stand).
  await client.query(WRAPPER);
  await client.query("grant execute on function pg_temp.where_parity(uuid, uuid[]) to authenticated");
  const seats = (await client.query(
    `select user_id from (select distinct m.user_id from iam.memberships m
       join iam.organizations o on o.id = m.organization_id and o.archived_at is null
      where m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null
        and exists (select 1 from context.scope_types st where st.organization_id = m.organization_id and st.deleted_at is null)) u
      order by (u.user_id in ('87a6e699-3622-4869-8843-d0867456c0dd','4060701e-706a-4c76-b3ca-0bbc69fa5a14')) desc, 1`)).rows.map((r: { user_id: string }) => r.user_id);
  const foreign = (await client.query(
    `select array_agg(id) as ids from (select s.id from context.scopes s join iam.organizations o on o.id = s.organization_id and o.archived_at is null
      where s.deleted_at is null order by s.id limit 100) x`)).rows[0].ids as string[];
  console.log(`# ${seats.length} seats: own organizations' live scopes + ${foreign.length} sampled scopes + 150 own records + 150 own Tables and Fields each`);
  let red = 0, ids = 0, opened = 0, withO = 0;
  for (const uid of seats) {
    await client.query("begin isolation level repeatable read read only");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await client.query("set local statement_timeout = '5min'");
      await client.query("set local role authenticated");
      const r = await client.query(`select pg_temp.where_parity($1::uuid, $2::uuid[]) as x`, [uid, foreign]);
      await client.query("reset role");
      const x = r.rows[0].x;
      ids += x.n; opened += x.opened; withO += x.with_o;
      const ok = x.levels_differ === 0 && x.levels_extra === 0 && x.org_wrong === 0 && x.where_same && x.alone_same;
      if (!ok) red++;
      console.log(`${ok ? "ok  " : "RED "} seat ${uid}: ${x.n} ids, ${x.with_o} carry o, ${x.seen} seen, ${x.opened} open (${x.kinds ?? "-"})${ok ? "" : ` — levels differ ${x.levels_differ}, extra ${x.levels_extra}, org wrong ${x.org_wrong}, where same ${x.where_same}, alone same ${x.alone_same}`}`);
    } finally {
      await client.query("rollback");
    }
  }
  await client.end();
  const ok = red === 0 && ids > 0 && withO > 0 && opened > 0;
  console.log(`${ok ? "GREEN" : "RED  "} SAME ${seats.length - red}/${seats.length} seats: l and s, the organization key, and both where answers (${ids} seat-ids, ${withO} with o, ${opened} opened)`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
