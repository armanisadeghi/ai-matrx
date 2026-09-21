-- WRITE-PERF-3 — THE RED TWIN. It executes the REAL BYTES of all four of this lane's inverses
-- inside one transaction and shows, block by block, that every clause `writeperf3_green.sql`
-- asserts is FALSE without them. Then it rolls back and checks, in the same session, that the
-- store is as it was.
--
-- A guard nobody has seen fail is not a guard. Each block below fails loudly if the thing it is
-- supposed to find missing is still there.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3_red.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local lock_timeout = '10min';

-- THE FOURTEEN LOCKS, TAKEN ONCE, IN ONE STATEMENT, BEFORE ANYTHING ELSE.
--
-- The inverses drop three triggers on each of fourteen tables, which needs ACCESS EXCLUSIVE on
-- all fourteen. Taken one table at a time, across four files, this file deadlocked on NINE
-- consecutive attempts against ordinary concurrent readers — every visibility check on this
-- database reads `platform.entity_grants` and then `platform.associations`, so any peer in the
-- middle of one while this file already held `platform.associations` closed the cycle.
--
-- One statement acquires them in the order written, while this transaction holds nothing else,
-- and the two tables every peer touches are last. This suite runs in well under a minute, so
-- the wait it imposes on a peer is a wait and not an outage.
lock table platform.entity_grants, platform.entity_relationships, platform.entity_types,
           platform.reachability, platform.rulebook, iam.memberships, iam.membership_grant,
           iam.org_industries, iam.organizations, iam.system_orgs, custom.portal,
           custom.portal_principal, platform.associations, custom.record
  in access exclusive mode;

\echo ''
\echo '=== executing the real bytes of all four inverses ==='
\i migrations/inverse/writeperf3_a_small_answer_is_not_read_out_of_a_big_blob_down.sql
\i migrations/inverse/writeperf3_an_edge_arriving_forgets_nothing_down.sql
\i migrations/inverse/writeperf3_the_table_is_read_once_per_statement_down.sql
\i migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_down.sql

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; i int; n int; v_red int := 0; v_ids uuid[];
begin
  -- 1. THE CENSUS IS GONE ENTIRELY.
  if to_regprocedure('platform.memo_reach_unguarded()') is not null then
    raise exception 'RED 1 FAILED: the census is still there after its own inverse';
  end if;
  if to_regprocedure('platform.memo_reach_tables()') is not null
     or to_regprocedure('platform.memo_reach_exempt()') is not null then
    raise exception 'RED 1 FAILED: the declared list or the exemption list is still there';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1  the memo-invalidation census, its declared list and its exemption list are all gone';

  -- 2. NOT ONE MEMO-CLEARING STATEMENT TRIGGER IS LEFT ON ANY OF THE FOURTEEN.
  select count(*) into n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal
     and p.proname in ('memo_clear_stmt','memo_clear_on_structure','memo_clear_on_reach_loss');
  if n <> 0 then
    raise exception 'RED 2 FAILED: % memo-clearing triggers survived the inverse', n;
  end if;
  if to_regprocedure('platform.memo_clear_on_reach_loss()') is not null then
    raise exception 'RED 2 FAILED: the precise trigger body is still there';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2  zero memo-clearing statement triggers anywhere, and the precise body is gone';

  -- 3. BOTH STRUCTURE MEMOS ARE GONE AS FUNCTIONS.
  if to_regprocedure('platform.memo_b_get(text)') is not null
     or to_regprocedure('platform.memo_s_get(text)') is not null then
    raise exception 'RED 3 FAILED: a structure memo reader survived its inverse';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3  neither structure memo has a reader left';

  -- 4. THE THREE DOOR PREDICATES ASK THE LADDER AGAIN ON EVERY ROW.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'custom'
     and p.proname in ('assert_store_door','assert_client_may_reach','assert_may_know_table')
     and p.prosrc like '%platform.memo_get%';
  if n <> 0 then
    raise exception 'RED 4 FAILED: % of the three predicates still read a memo', n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4  none of the three door predicates reads a memo any more';

  -- 5. THE FIVE READS READ THE TABLE AGAIN ON EVERY CALL.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ((ns.nspname = 'custom' and p.proname in ('applicable_fields','table_type_field','choice_field_map','table_rules'))
          or (ns.nspname = 'platform' and p.proname = 'relation_declaration'))
     and p.prosrc like '%memo_%get%';
  if n <> 0 then
    raise exception 'RED 5 FAILED: % of the five reads still read a memo', n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5  none of the five structure reads reads a memo any more';

  -- 6. AND THE STORE STILL WORKS — the control, so RED 1 to 5 are not "everything is broken".
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('ZZZ WRITEPERF3 RED', 'zzz-wp3-red-' || substr(md5(random()::text),1,8), 'ZWC', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');
  perform set_config('app.actor_system','campaign-test/writeperf3_red', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Red Home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ WP3 Red','slug','zz_wp3r_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','deal','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','deal')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Deal','key','deal','type','text'));
  v_ids := custom.record_write_many(v_org, v_tbl,
             (select array_agg(jsonb_build_object('deal','Red ' || g.i) order by g.i)
                from generate_series(1,10) g(i)));
  select count(*) into n from custom.read_records(v_org, v_tbl, true, 200, 0);
  if n <> 10 then
    raise exception 'RED 6 FAILED: the store without this lane wrote % of 10 records', n;
  end if;
  -- AND THE MEMO IS NEVER SET, which is the whole cost this lane removed.
  for i in 1..5 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('deal','Solo ' || i));
  end loop;
  if coalesce(nullif(current_setting('mx_memo.b', true), ''), '') <> ''
     or coalesce(nullif(current_setting('mx_memo.s', true), ''), '') <> '' then
    raise exception 'RED 6 FAILED: a structure memo filled up with no memo functions in the database';
  end if;
  perform set_config('role', v_boss, true);
  v_red := v_red + 1;
  raise notice 'RED 6  the store still writes and reads 10 records, and no structure memo is ever filled';

  -- 7. AND THE REPLANNER CENSUS IS STILL 0, so nothing this lane did to it is undone by accident.
  select count(*) into n from custom.ladder_replanners();
  if n <> 0 then
    raise exception 'RED 7 FAILED: % replanners appeared, which is not this lane''s doing', n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 7  the write-path replanner census is still 0 without this lane';

  raise notice '% OF 7 BLOCKS RED', v_red;
end;
$t$;
rollback;

\echo ''
\echo '=== after the rollback, in the same session ==='
select (select count(*) from platform.memo_reach_unguarded())        as census_rows,
       (select count(*) from platform.memo_reach_exempt())           as declared_exemptions,
       (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where not t.tgisinternal
           and p.proname in ('memo_clear_stmt','memo_clear_on_structure','memo_clear_on_reach_loss')
                                                                    ) as memo_clearing_triggers,
       to_regprocedure('platform.memo_b_get(text)') is not null       as bulky_memo_live,
       to_regprocedure('platform.memo_s_get(text)') is not null       as small_memo_live,
       (select count(*) from custom.ladder_replanners())             as replanners;
