-- WRITE-PERF — THE RED TWIN. It executes the REAL BYTES of this lane's six inverses inside a
-- rolled-back transaction, and then demonstrates each defect coming back. A guard you cannot show
-- failing is not a guard.
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf_red.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local lock_timeout = '10min';

-- THE FIXTURE, built with the LANDED bodies so the rows exist before anything is undone.
create temp table wp_red (k text primary key, v text) on commit drop;
do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; i int;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ironline Fitness Red', 'ironline-fitness-red-' || substr(md5(random()::text),1,8), 'IFR', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');
  perform set_config('app.actor_system','campaign-test/writeperf_red', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then raise exception 'red: not seated'; end if;
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Red Home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Member Check-ins','slug','member_checkins','type','entity',
    'label_singular','Row','label_plural','Rows','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..250 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('title','Row ' || i));
  end loop;
  perform set_config('role', v_boss, true);
  insert into wp_red values ('org', v_org::text), ('tbl', v_tbl::text);
end $$;

\echo '=== executing the real inverses ==='
-- WRITE-PERF-3'S INVERSES FIRST (added by that lane, 2026-09-21). Since WRITE-PERF-3 the three
-- store door predicates READ the memo this file is about to remove, so taking the memo away
-- underneath them left `custom.assert_store_door` calling a `platform.memo_get` that no longer
-- existed and this file died in its own fixture. The inverses below put those bodies back to the
-- ones that never asked, which is the state this file was written against.
-- The fourteen locks in ONE statement, before anything else: taken one table at a time these
-- trigger drops deadlock against ordinary concurrent visibility reads, which read
-- `platform.entity_grants` and then `platform.associations`.
lock table platform.entity_grants, platform.entity_relationships, platform.entity_types,
           platform.reachability, platform.rulebook, iam.memberships, iam.membership_grant,
           iam.org_industries, iam.organizations, iam.system_orgs, custom.portal,
           custom.portal_principal, platform.associations, custom.record
  in access exclusive mode;
\i migrations/inverse/writeperf3_a_structure_row_empties_the_memo_before_it_lands_down.sql
\i migrations/inverse/writeperf3_a_small_answer_is_not_read_out_of_a_big_blob_down.sql
\i migrations/inverse/writeperf3_an_edge_arriving_forgets_nothing_down.sql
\i migrations/inverse/writeperf3_the_table_is_read_once_per_statement_down.sql
\i migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_down.sql

\i migrations/inverse/writeperf_the_memo_reader_plans_once_too_down.sql
\i migrations/inverse/writeperf_the_same_question_is_asked_once_down.sql
\i migrations/inverse/writeperf_the_write_path_plans_once_down.sql
\i migrations/inverse/writeperf_the_export_door_keeps_the_page_contract_down.sql
-- ORDER MATTERS AND IT IS NOT ARBITRARY: the page inverse DROPS custom.silent_page_doors, so the
-- census inverse runs after it and puts the census back. A red twin that could not run the census
-- would be asserting the absence of a guard instead of showing the guard go red.
\i migrations/inverse/writeperf_a_page_says_what_it_did_down.sql
\i migrations/inverse/writeperf_the_page_census_names_only_the_silent_down.sql

do $$
declare
  v_boss text := current_user;
  v_org uuid := (select v from wp_red where k='org')::uuid;
  v_tbl uuid := (select v from wp_red where k='tbl')::uuid;
  v_n int; v_red int := 0; v_blocks int := 0;
begin
  perform set_config('role','authenticated', true);

  -- 1. THE SHORT PAGE IS BACK, AND IT IS SILENT.
  v_blocks := v_blocks + 1;
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, 5000, 0);
  if v_n = 200 then
    v_red := v_red + 1;
    raise notice '1: RED — asked custom.read_records for 5000 of 250 rows and it handed back % rows with no signal of any kind', v_n;
  else
    raise exception '1: NOT RED — expected the silent 200, got %', v_n;
  end if;

  perform set_config('role', v_boss, true);

  -- 2. THE CENSUS NAMES THEM AGAIN.
  v_blocks := v_blocks + 1;
  select count(*) into v_n from custom.silent_page_doors();
  if v_n > 0 then
    v_red := v_red + 1;
    raise notice '2: RED — % door(s) invent a page size again, including %', v_n,
      (select door from custom.silent_page_doors() order by door limit 1);
  else
    raise exception '2: NOT RED — the census is still empty after the inverse';
  end if;

  -- 3. THE PAGE CONTRACT IS NOT A DOOR ANY MORE.
  v_blocks := v_blocks + 1;
  if to_regprocedure('custom.page_contract(uuid)') is null
     and to_regprocedure('custom.page_size(uuid,text,integer,integer,integer)') is null then
    v_red := v_red + 1;
    raise notice '3: RED — custom.page_contract and custom.page_size are gone, so a client has no way to learn the ceiling except by being handed a short page';
  else
    raise exception '3: NOT RED — the page contract survived its own inverse';
  end if;

  -- 4. EVERY KNOB READ HITS THE REGISTER AGAIN.
  v_blocks := v_blocks + 1;
  if to_regprocedure('platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)') is null
     and (select prosrc !~ 'memo_get' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='platform' and p.proname='knob_resolve')
     and (select count(*) from pg_trigger t
           where t.tgrelid in ('platform.feature_knob'::regclass,
                               'platform.knob_override'::regclass,
                               'platform.knob_rung_lock'::regclass)
             and t.tgname like 'zz_memo_bump%') = 0 then
    v_red := v_red + 1;
    raise notice '4: RED — the memo is gone and so are its three bump triggers: all 35 knob reads per written record go to the register again';
  else
    raise exception '4: NOT RED — the memo survived its own inverse';
  end if;

  -- 5. THE WRITE PATH RE-PLANS ITS HELPERS ON EVERY CALL AGAIN.
  v_blocks := v_blocks + 1;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
   where l.lanname = 'sql' and p.provolatile <> 'i' and (p.proconfig is not null or p.prosecdef)
     and (n.nspname||'.'||p.proname) in
         ('custom.record_relation_edges','custom.record_carrying_edges','custom.io_changed_field_ids',
          'custom.organization_references','custom.query_is_store_owner','iam.has_org_access',
          'platform.is_provisioning');
  if v_n = 7 then
    v_red := v_red + 1;
    raise notice '5: RED — all 7 write-path helpers are LANGUAGE sql and non-inlinable again, so PostgreSQL re-plans each of them on every single call';
  else
    raise exception '5: NOT RED — only % of 7 went back to sql', v_n;
  end if;

  raise notice '=== % of % blocks are RED ===', v_red, v_blocks;
  if v_red <> v_blocks then raise exception 'the red twin did not go red'; end if;
end $$;
rollback;

\echo '=== POST-ROLLBACK: the landed bodies are back ==='
select (select count(*) from custom.silent_page_doors())            as silent_page_doors,
       (select count(*) from custom.ladder_replanners())            as ladder_replanners,
       to_regprocedure('custom.page_contract(uuid)') is not null     as page_contract_live,
       to_regprocedure('platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)') is not null as memo_live;
