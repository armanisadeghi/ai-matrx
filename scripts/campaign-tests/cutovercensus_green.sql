-- LANE CUTOVER-CENSUS — THE GREEN SUITE.
--
-- THE REAL USE CASE. Arman opens his organization's settings page and reads the Data tables
-- switch: "111 of 112 tables copied. Not yet: CIC Research." — the SAME number the mover's report
-- gives, because both read platform.cutover_tables_copied: live older tables against their live
-- same-id copies, with archived older tables, archived copies and the option lists the app keeps
-- never counted. Below it, "every feature that reads or writes tables uses the new store" says what
-- the census measured the last time it ran — never a sentence a lane typed — and nobody can set it
-- by hand: only the census's door writes it, and the door decides `met` from the rows.
--
-- RUN IT (clone; everything is rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/cutovercensus_green.sql
-- It refuses a database with active cron jobs (production) unless -v allow_production=1.
--
-- ITS RED: before the two cutovercensus_ files, or after their inverses, it fails at step 0.

\set ON_ERROR_STOP on
\timing off

begin;

do $$
begin
  if (select count(*) from cron.job where active) > 0
     and coalesce(current_setting('cutovercensus.allow_production', true), '') <> '1' then
    raise exception 'cutovercensus_green.sql runs on the dev clone (no active cron job); this database has active cron jobs';
  end if;
end;
$$;

-- 0. The objects exist (RED before the files / after the inverses).
do $$
begin
  if to_regprocedure('platform.cutover_tables_copied(uuid)') is null then
    raise exception 'RED 0a: platform.cutover_tables_copied(uuid) does not exist';
  end if;
  if to_regprocedure('platform.cutover_census_record(text,text,jsonb)') is null then
    raise exception 'RED 0b: platform.cutover_census_record(text,text,jsonb) does not exist';
  end if;
  if to_regclass('platform.cutover_census_run') is null then
    raise exception 'RED 0c: platform.cutover_census_run does not exist';
  end if;
  if pg_get_functiondef('platform._cutover_seam_readiness(text,uuid)'::regprocedure) !~ 'cutover_tables_copied' then
    raise exception 'RED 0d: the switch''s readiness does not read the one count';
  end if;
  raise notice 'ok 0 — the count, the door and the run log exist; readiness reads the count';
end;
$$;

-- 1. ONE COUNT: for every organization holding a live older table, the switch's sentence is the
--    count function's numbers, and the function agrees with a recount written out here.
do $$
declare
  o uuid; v jsonb; d text; n_live bigint; n_copied bigint; n_orgs int := 0;
begin
  for o in select distinct organization_id from workbench.udt_datasets where deleted_at is null loop
    v := platform.cutover_tables_copied(o);
    select count(*),
           count(*) filter (where exists (select 1 from custom.record r
                                            where r.organization_id = o and r.id = x.id and r.data_class = 'table'
                                              and r.deleted_at is null
                                              and coalesce((r.data ->> 'kept_by_the_app')::boolean, false) = false))
      into n_live, n_copied
      from workbench.udt_datasets x where x.organization_id = o and x.deleted_at is null;
    if (v ->> 'older_live')::bigint <> n_live or (v ->> 'copied')::bigint <> n_copied then
      raise exception 'RED 1a: % counts % of % but the recount is % of %', o, v ->> 'copied', v ->> 'older_live', n_copied, n_live;
    end if;
    select c ->> 'detail' into d
      from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', o) -> 'checks') c
     where c ->> 'key' = 'copied';
    if d not like format('%s of %s tables copied.%%', n_copied, n_live) then
      raise exception 'RED 1b: the switch for % says "%" but the count is % of %', o, d, n_copied, n_live;
    end if;
    n_orgs := n_orgs + 1;
  end loop;
  raise notice 'ok 1 — % organizations: the switch says exactly the count''s N of M', n_orgs;
end;
$$;

-- 2. WHAT IS EXCLUDED, on admin's Workspace's real tables (rolled back): an archived copy is not a
--    copy; an archived older table is not counted; the option lists the app keeps never count.
do $$
declare
  org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  before jsonb; after jsonb; t uuid; t2 uuid;
begin
  before := platform.cutover_tables_copied(org);
  if (before ->> 'app_kept')::int = 0 then
    raise exception 'RED 2 setup: admin''s Workspace keeps no option lists here, so the exclusion cannot be shown';
  end if;
  if (before ->> 'copied')::int > (before ->> 'older_live')::int then
    raise exception 'RED 2a: more copies (%) than older tables (%) — the option lists are being counted', before ->> 'copied', before ->> 'older_live';
  end if;

  select d.id into t from workbench.udt_datasets d
   where d.organization_id = org and d.deleted_at is null
     and exists (select 1 from custom.record r where r.organization_id = org and r.id = d.id and r.data_class = 'table' and r.deleted_at is null)
   order by d.table_name limit 1;
  update custom.record set deleted_at = now() where organization_id = org and id = t;
  after := platform.cutover_tables_copied(org);
  if (after ->> 'copied')::int <> (before ->> 'copied')::int - 1 or (after ->> 'archived_copies')::int <> (before ->> 'archived_copies')::int + 1 then
    raise exception 'RED 2b: archiving one copy moved copied % -> % and archived_copies % -> %',
      before ->> 'copied', after ->> 'copied', before ->> 'archived_copies', after ->> 'archived_copies';
  end if;

  select d.id into t2 from workbench.udt_datasets d
   where d.organization_id = org and d.deleted_at is null and d.id <> t order by d.table_name limit 1;
  perform workbench.udt_dataset_archive(t2, t2, 'cutovercensus_green: an archived older table is not counted (rolled back)');
  after := platform.cutover_tables_copied(org);
  if (after ->> 'older_live')::int <> (before ->> 'older_live')::int - 1 or (after ->> 'archived_older')::int <> (before ->> 'archived_older')::int + 1 then
    raise exception 'RED 2c: archiving one older table moved older_live % -> %', before ->> 'older_live', after ->> 'older_live';
  end if;
  raise notice 'ok 2 — % app-kept option lists never counted; an archived copy and an archived older table leave the count', before ->> 'app_kept';
end;
$$;

-- 3. THE FACT IS MEASURED, NEVER TYPED.
create temp table census_case (name text primary key, body jsonb) on commit drop;
insert into census_case
select 'all_ready', jsonb_build_object(
  'target', 'clone',
  'repos', jsonb_build_object('matrx-frontend', 'd0f05801d6', 'aidream', '2b0463dd16', 'matrx-extend', '3726379d76'),
  'script_sha256', 'suite',
  'unlisted', '[]'::jsonb,
  'rows', (select jsonb_agg(jsonb_build_object('id', id, 'status', 'proven', 'plain', '')) from (
             select 'F' || g as id from generate_series(1, 30) g
             union all select 'A' || g from generate_series(1, 22) g
             union all select 'E' || g from generate_series(1, 4) g
             union all select 'L1'
             union all select 'D' || g from generate_series(1, 15) g) ids));
insert into census_case
select 'one_open', jsonb_set(body, '{rows}', (body -> 'rows') || jsonb_build_array(jsonb_build_object(
         'id', 'X1', 'status', 'open',
         'plain', 'for a table that has been copied but not switched, agents write into the copy')))
  from census_case where name = 'all_ready';
insert into census_case
select 'one_unlisted', jsonb_set(body, '{unlisted}', '[{"repo":"matrx-frontend","file":"features/new-thing/saveRows.ts","names":["append_rows_to_user_table"]}]'::jsonb)
  from census_case where name = 'all_ready';
insert into census_case
select 'no_extension', body #- '{repos,matrx-extend}' from census_case where name = 'all_ready';
insert into census_case
select 'seventy_one', jsonb_set(body, '{rows}', (select jsonb_agg(r) from jsonb_array_elements(body -> 'rows') r where r ->> 'id' <> 'D15'))
  from census_case where name = 'all_ready';
insert into census_case
select 'open_without_words', jsonb_set(body, '{rows}', (body -> 'rows') || '[{"id":"X1","status":"open","plain":""}]'::jsonb)
  from census_case where name = 'all_ready';

do $$
declare
  v jsonb; c jsonb; refused boolean; n0 int; n1 int;
begin
  -- 3a. A hand edit of the fact is refused by name.
  refused := false;
  begin
    update platform.cutover_seam
       set prerequisites = (select jsonb_agg(case when e ->> 'key' = 'integrations_repointed' then e || '{"met": true}'::jsonb else e end)
                              from jsonb_array_elements(prerequisites) e)
     where seam_key = 'older_tables';
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'RED 3a: the integrations fact was set to true by hand'; end if;

  -- 3b. Malformed censuses are refused whole.
  foreach c in array array[
    (select body from census_case where name = 'no_extension'),
    (select body from census_case where name = 'seventy_one'),
    (select body from census_case where name = 'open_without_words')] loop
    refused := false;
    begin
      perform platform.cutover_census_record('older_tables', 'integrations_repointed', c);
    exception when invalid_parameter_value then refused := true;
    end;
    if not refused then raise exception 'RED 3b: a malformed census was recorded'; end if;
  end loop;

  -- 3c. A signed-in person is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', 'ea2d6a4b-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
  refused := false;
  begin
    perform platform.cutover_census_record('older_tables', 'integrations_repointed', (select body from census_case where name = 'all_ready'));
  exception when insufficient_privilege then refused := true;
  end;
  perform set_config('request.jwt.claims', '', true);
  if not refused then raise exception 'RED 3c: a signed-in person recorded a census'; end if;

  select count(*) into n0 from platform.cutover_census_run;

  -- 3d. One open place: not met, and the owner reads what is left.
  v := platform.cutover_census_record('older_tables', 'integrations_repointed', (select body from census_case where name = 'one_open'));
  if (v ->> 'met')::boolean then raise exception 'RED 3d: a census with an open place was met'; end if;
  select c2 into c from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', '3e790542-fdaf-40b2-8bf3-658bf94fe67f') -> 'checks') c2
   where c2 ->> 'key' = 'integrations_repointed';
  if (c ->> 'met')::boolean or c ->> 'detail' not like '%agents write into the copy%' then
    raise exception 'RED 3d: the switch reads "%" (met %)', c ->> 'detail', c ->> 'met';
  end if;

  -- 3e. An unlisted file: not met.
  v := platform.cutover_census_record('older_tables', 'integrations_repointed', (select body from census_case where name = 'one_unlisted'));
  if (v ->> 'met')::boolean then raise exception 'RED 3e: a census with an unlisted file was met'; end if;

  -- 3f. Everything ready: met, and the switch's fact is true with the measured sentence.
  v := platform.cutover_census_record('older_tables', 'integrations_repointed', (select body from census_case where name = 'all_ready'));
  if not (v ->> 'met')::boolean then raise exception 'RED 3f: a census with nothing open was not met: %', v; end if;
  select c2 into c from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', '3e790542-fdaf-40b2-8bf3-658bf94fe67f') -> 'checks') c2
   where c2 ->> 'key' = 'integrations_repointed';
  if not (c ->> 'met')::boolean or c ->> 'detail' not like 'Measured %every one of the 72 places%' then
    raise exception 'RED 3f: the switch reads "%" (met %)', c ->> 'detail', c ->> 'met';
  end if;

  -- 3g. Every run is kept, and a run is never changed.
  select count(*) into n1 from platform.cutover_census_run;
  if n1 <> n0 + 3 then raise exception 'RED 3g: % runs recorded, expected %', n1 - n0, 3; end if;
  refused := false;
  begin
    update platform.cutover_census_run set met = not met where id = (v ->> 'run')::uuid;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'RED 3g: a census run was edited'; end if;

  -- 3h. No client role can reach the door or the count.
  if has_function_privilege('authenticated', 'platform.cutover_census_record(text,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'platform.cutover_census_record(text,text,jsonb)', 'execute')
     or has_function_privilege('service_role', 'platform.cutover_census_record(text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'platform.cutover_tables_copied(uuid)', 'execute') then
    raise exception 'RED 3h: a client role may execute the census door or the count';
  end if;
  raise notice 'ok 3 — a hand edit, a malformed census and a signed-in person are refused; open or unlisted is not met; nothing open is met with the measured sentence; runs are append-only; no client role reaches the door';
end;
$$;

rollback;

\echo 'cutovercensus_green.sql: GREEN (rolled back)'
