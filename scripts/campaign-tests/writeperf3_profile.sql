-- WRITE-PERF-3 — WHERE THE REMAINING MILLISECONDS GO.
--
-- Three instruments on ONE fixture, in ONE transaction that rolls back:
--   A. `pg_stat_user_functions` deltas with `track_functions = all` set INSIDE the transaction
--      (the pooler hands a session-level SET to a different backend, so it must be `set local`).
--      THE SNAPSHOTS CANNOT BE TAKEN INSIDE THE TRANSACTION: Postgres only flushes a backend's
--      pending function stats from `PostgresMain` when it is NOT in a transaction block, so a
--      `select … from pg_stat_user_functions` two statements after the write reads zeroes —
--      measured, not assumed (`pg_stat_force_next_flush()` does not help; it only arms the next
--      flush, which still never comes until the transaction ends). The stats ARE flushed at
--      transaction end, including a ROLLBACK, and they are not transactional, so they survive it.
--      So `writeperf3_profile.sh` runs this file TWICE — once with `:write` = 0 (the fixture
--      alone) and once with `:write` = 1 (the fixture plus 2,000 rows) — snapshotting between
--      runs, and the difference of the two deltas is the 2,000 rows and nothing else.
--   B. `EXPLAIN (ANALYZE, BUFFERS)` of ONE 500-row insert into `custom.record`, which names every
--      trigger's own time. The connected role IS `custom.record_write_many`'s owner (postgres),
--      which is exactly the effective user the triggers see inside that SECURITY DEFINER door —
--      so this is the door's own context, not a superuser shortcut.
--   C. The wall clock of the four batches, and of the same 2,000 rows one at a time.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3_profile.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10s';
set local track_functions = 'all';
set local stats_fetch_consistency = 'none';

create temp table wp3_fx (k text primary key, v text) on commit drop;
create temp table wp3_fn (phase text, funcid oid, calls bigint, self numeric, total numeric) on commit drop;
-- The harness's own scratch tables, reachable from the seat: they are temp, they are dropped on
-- commit, and the file rolls back. Nothing in schema custom is granted anything here.
grant all on wp3_fx, wp3_fn to authenticated;

create or replace function pg_temp.build(p_slug text) returns void language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_home uuid; v_tbl uuid; v_acct uuid; v_accts uuid[]; i int;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Peak Ridge Roofing', p_slug, 'PRR', c_admin) returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3_profile', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this harness did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Peak Ridge Roofing — Main Office'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Accounts','slug','accounts_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Account','label_plural','Accounts','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..10 loop
    v_accts := v_accts || custom.record_write(v_org, v_acct, jsonb_build_object('title','PRR-2026-' || lpad((100 + i)::text, 4, '0')));
  end loop;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','deal','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','deal')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Deal','key','deal','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Closes','key','closes','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Stage','key','stage','type','select','options', jsonb_build_array('Open','Won','Lost')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Owner','key','owner','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Account','key','account','type','relation','relation_target', v_acct::text));

  insert into wp3_fx values ('org', v_org::text), ('home', v_home::text), ('tbl', v_tbl::text),
                            ('acct', v_acct::text), ('accts', array_to_string(v_accts, ','));
end;
$$;

create or replace function pg_temp.docs(p_from int, p_to int) returns jsonb[] language plpgsql as $$
declare v_home uuid; v_accts uuid[]; v_docs jsonb[];
begin
  select v::uuid into v_home from wp3_fx where k='home';
  select string_to_array(v, ',')::uuid[] into v_accts from wp3_fx where k='accts';
  select array_agg(jsonb_strip_nulls(jsonb_build_object(
           'deal',   'Deal ' || g.i,
           'amount', round((g.i * 12.37 + 100)::numeric, 2),
           'closes', to_char(date '2026-01-01' + ((g.i % 360) || ' days')::interval, 'YYYY-MM-DD'),
           'stage',  (array['Open','Won','Lost'])[1 + (g.i % 3)],
           'owner',  case when g.i % 10 = 0 then v_home::text else null end,
           'account', case when g.i % 7 = 0 then null else v_accts[1 + (g.i % 10)]::text end))
           order by g.i)
    into v_docs from generate_series(p_from, p_to) g(i);
  return v_docs;
end;
$$;

select pg_temp.build('peak-ridge-wp3-' || substr(md5(random()::text),1,8));

\if :write

-- ============ A + C: the function profile and the wall clock of the batched door ============
do $t$
declare b int; t0 timestamptz; t1 timestamptz; v_ids uuid[]; v_org uuid; v_tbl uuid;
begin
  select v::uuid into v_org from wp3_fx where k='org';
  select v::uuid into v_tbl from wp3_fx where k='tbl';
  perform set_config('role','authenticated', true);
  t0 := clock_timestamp();
  for b in 0..3 loop
    v_ids := v_ids || custom.record_write_many(v_org, v_tbl, pg_temp.docs(b*500+1, b*500+500));
  end loop;
  t1 := clock_timestamp();
  raise notice 'C. BATCHED: 2000 rows in 4 statements of 500 = % ms total = % ms/row',
    round(extract(epoch from (t1-t0))*1000)::text,
    round((extract(epoch from (t1-t0))*1000/2000)::numeric, 2);
end;
$t$;

-- ============ B: EXPLAIN ANALYZE of ONE 500-row insert, which names every trigger ============
\echo ''
\echo '=== B. EXPLAIN (ANALYZE, BUFFERS) of ONE 500-row insert into custom.record ==='
select v as org from wp3_fx where k='org' \gset
select v as tbl from wp3_fx where k='tbl' \gset
-- Back to the connected role, which IS `custom.record_write_many`'s owner, so the triggers below
-- see exactly the effective user they see inside that SECURITY DEFINER door.
reset role;

explain (analyze, buffers, costs off, timing on)
insert into custom.record (organization_id, table_id, id, data)
select :'org'::uuid, :'tbl'::uuid, gen_random_uuid(), d
  from unnest(pg_temp.docs(3001, 3500)) with ordinality as u(d, ord)
 order by ord;

\endif

rollback;
