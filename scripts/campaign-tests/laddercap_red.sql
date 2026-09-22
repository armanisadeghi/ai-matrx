-- LADDER-CAP — THE RED TWIN. THE REAL BYTES OF EVERY INVERSE, AND EVERY BLOCK MUST GO RED.
--
-- RUN IT (against the MAIN database):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/laddercap_red.sql
--
-- WHY IT EXISTS. `laddercap_green.sql` passing proves the system answers correctly TODAY. It
-- does not prove that this lane is what makes it answer correctly — a suite that would pass
-- against the old code is not a regression test. So each block here executes the REAL BYTES of
-- one of this lane's inverses inside a transaction that is ROLLED BACK, and asserts that the
-- clause the green suite relies on goes RED. A block that stays green is a clause nothing in
-- this lane is actually holding up.
--
-- It also proves the inverses are valid SQL, which nothing else does.
--
-- NOTHING IS LEFT BEHIND: every block ends in ROLLBACK, and the last part re-asserts the landed
-- answers so a reader can see the database came back.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'laddercap_red.sql'
-- SUITES-TIDY 2026-09-22 — THE SIZE-AWARE CEILING. This suite carries two whole-database
-- censuses — `iam.member_level_overreach()` in BLOCK 3 and
-- `custom.levels_raised_by_a_less_specific_rung()` in ROLLBACK VERIFIED and in TEARDOWN — and
-- the nightly dev clone is production's data on SMALLER COMPUTE (measured 2026-09-22:
-- shared_buffers 2 GB against production's 4 GB, effective_cache_size 6 GB against 12 GB, 2
-- parallel workers against 4). It was given `compute:shared_buffers:524288` at FILE level, so on
-- the clone the whole suite — every RED block, the rollback verification and the teardown —
-- asserted nothing.
--
-- SUITES-TIDY-2, 2026-09-22 — MEASURED, NOT ASSUMED. On the clone the two censuses cost 18.9 s
-- and 8.4 s against the 60-second `statement_timeout` each block sets, and the WHOLE FILE runs
-- green end to end in 79.5 s, inside the sweep's 180-second cap. Nothing here is a
-- milliseconds-per-row measurement: every assertion in this file is a COUNT or a catalogue
-- answer, and a count is the same count on a smaller machine. So the compute declaration is
-- removed rather than pushed down to a clause — gating a census that finishes in 18.9 s of a
-- 60-second budget would be inventing a skip and losing real coverage. The 60-second timeout is
-- the guard this file has always had and must never be raised to answer a slow run: a census
-- that cannot finish inside it has regressed, and that is the assertion.
\set requires 'relation:custom.io_outbox'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG    '\'1ef1ca00-0000-4a00-8a00-000000000c01\''
\set ADMIN  '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA   '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set HQ     '\'1ef1ca00-0000-4a00-8a00-000000000c11\''
\set TBL    '\'1ef1ca00-0000-4a00-8a00-000000000c21\''
\set REC    '\'1ef1ca00-0000-4a00-8a00-000000000c31\''

-- ══════════════════════════════════════════════ STEP 0 — a clean slate
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LADDERCAP Green Throwaway', 'laddercap-green-throwaway', 'LCG', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
-- THE STORE SWITCH, and nothing else yet. PART 1 sets `custom/member_default_level` per case.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG, :ORG, 'true'::jsonb, 'LADDER-CAP green suite');
commit;

-- The Table, its Home, and one record — built through the store's own door, as the owner.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
do $t$
declare
  v_org   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c11';
  v_tbl   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c21';
  v_rec   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c31';
  t uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'LADDERCAP Green HQ'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Case', 'slug', 'laddercap_green_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  if t is distinct from v_tbl then
    update custom.record set id = v_tbl where organization_id = v_org and id = t;
    update custom.record set data = data || jsonb_build_object('entity_definition_id', v_tbl::text)
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and (data ->> 'entity_definition_id')::uuid = t;
    update custom.field set entity_definition_id = v_tbl where organization_id = v_org and entity_definition_id = t;
    -- AND THE CARRYING EDGE, which is what makes HQ a real HOME of this Table (rung 3). Without
    -- this the `contains` association still points at the id table_declare generated and
    -- `custom.visibility_ancestors` returns nothing, so PART 1's home cases would assert on a
    -- rung that does not exist.
    update platform.associations set target_id = v_tbl
     where organization_id = v_org and target_type = 'record' and target_id = t;
    update platform.associations set source_id = v_tbl
     where organization_id = v_org and source_type = 'record' and source_id = t;
  end if;
  if not exists (select 1 from custom.visibility_ancestors('record', v_tbl) a
                  where a.container_id = v_hq) then
    raise exception 'FIXTURE — HQ is not a carrying ancestor of the Table, so PART 1 could not '
      'test rung 3 (a home addressed to her) at all.';
  end if;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec, v_org, v_tbl, 'record', jsonb_build_object('title', 'The admin''s record'), v_admin);
end $t$;
commit;


-- ══════════════ BLOCK 1 — THE LEVEL RESOLUTION STOPS GOVERNING ARM 1, and a grant addressed to
-- her on the TABLE or on a HOME loses to the organization's default. Executes the three inverses
-- that take the ladder back to the state it was in when the cap governed only arms 2 and 3 —
-- which is the state this lane's own green suite went red on.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_red_suite', true);
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'member_default_level', 'organization', :ORG, :ORG, '"admin"'::jsonb, 'LADDER-CAP red');
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
values ('record', :TBL, :DANA, 'viewer', :ADMIN),
       ('record', :HQ,  :DANA, 'viewer', :ADMIN);
\i migrations/inverse/laddercap_a_ceiling_cannot_refuse_at_the_floor_down.sql
\i migrations/inverse/laddercap_the_cap_is_resolved_once_and_governs_the_whole_ladder_down.sql
\i migrations/inverse/laddercap_the_organization_default_steps_aside_for_every_specific_rung_down.sql
do $t$
declare
  c_org  constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c01';
  c_rec  constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c31';
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss constant text := current_user;
  v_rec_lvl public.permission_level;
begin
  -- FROM HER SEAT, through the door a screen calls.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if current_user <> 'authenticated' then
    raise exception '1: this block did not take the seat — current_user is %', current_user;
  end if;
  v_rec_lvl := custom.my_level(c_org, c_rec, 'record');
  perform set_config('role', v_boss, true);

  if v_rec_lvl is not distinct from 'viewer'::public.permission_level then
    raise exception '1 STAYED GREEN — with VIS-19 back to "this row", a TABLE grant at viewer '
      'still capped her on the record. This lane is not what holds that clause up.';
  end if;
  raise notice '1: RED — a grant addressed to her on the TABLE at viewer, and the record answers '
    '% because the organization default overruled it.', coalesce(v_rec_lvl::text,'nothing');
  -- The HOME rung is NOT asserted at this depth on purpose: at this depth
  -- `custom.addressed_cap` still resolves rungs 1 to 3 inline and still governs arm 2, so the
  -- home grant is held up by an EARLIER file of this same lane rather than by the three this
  -- block removes. It is asserted in BLOCK 2, where the whole level resolution is gone.
end $t$;
rollback;

-- ══════════════ BLOCK 2 — THE WHOLE CAP IS REMOVED, and the 5b shape comes back: a deliberate
-- VIEWER share on the record, raised to editor by the organization default carried through the
-- Table. Executes all four inverses, newest first.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_red_suite', true);
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'member_default_level', 'organization', :ORG, :ORG, '"editor"'::jsonb, 'LADDER-CAP red');
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
values ('record', :REC, :DANA, 'viewer', :ADMIN),
       ('record', :HQ,  :DANA, 'viewer', :ADMIN);
\i migrations/inverse/laddercap_a_ceiling_cannot_refuse_at_the_floor_down.sql
\i migrations/inverse/laddercap_the_cap_is_resolved_once_and_governs_the_whole_ladder_down.sql
\i migrations/inverse/laddercap_the_organization_default_steps_aside_for_every_specific_rung_down.sql
\i migrations/inverse/laddercap_the_cap_is_asked_only_when_an_arm_would_say_yes_down.sql
\i migrations/inverse/laddercap_the_overreach_census_knows_the_fourth_rung_down.sql
\i migrations/inverse/laddercap_the_most_specific_grant_decides_the_level_down.sql
do $t$
declare
  c_org  constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c01';
  c_rec  constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c31';
  c_tbl  constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c21';
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss constant text := current_user;
  v_lvl  public.permission_level;
  v_tbl  public.permission_level;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if current_user <> 'authenticated' then
    raise exception '2: this block did not take the seat — current_user is %', current_user;
  end if;
  v_lvl := custom.my_level(c_org, c_rec, 'record');
  v_tbl := custom.my_level(c_org, c_tbl, 'record');
  perform set_config('role', v_boss, true);

  if v_lvl is null or v_lvl < 'editor'::public.permission_level then
    raise exception '2 STAYED GREEN — with the cap removed entirely, a deliberate VIEWER share '
      'was still not raised to editor (it answers %). levelfix PART 5b is not held up by this lane.',
      coalesce(v_lvl::text,'nothing');
  end if;
  raise notice '2: RED — levelfix_green PART 5b''s exact shape is back: a deliberate VIEWER share '
    'answers %, raised by the organization default carried through the Table.', v_lvl;
  -- STEPPING OUT for a catalogue read. No client door lists the store's own functions, and this
  -- asserts nothing about the product — only that the inverse really removed what it names.
  if to_regprocedure('custom.addressed_cap(uuid,text,uuid,uuid,uuid)') is not null then
    raise exception '2b STAYED GREEN — the inverse left custom.addressed_cap behind.';
  end if;
  raise notice '2b: RED — custom.addressed_cap is gone, so the level resolution is gone with it.';
  if v_tbl is null or v_tbl <= 'viewer'::public.permission_level then
    raise exception '2c STAYED GREEN — a grant addressed to her on a HOME at viewer still capped '
      'her on the Table (it answers %), with the whole level resolution removed.',
      coalesce(v_tbl::text,'nothing');
  end if;
  raise notice '2c: RED — a grant addressed to her on a HOME at viewer, and the Table answers %.', v_tbl;
end $t$;
rollback;

-- ══════════════ BLOCK 3 — THE OVERREACH CENSUS FORGETS SHARED-ONLY'S FOURTH RUNG and names the
-- twelve Table rows again. Executes the fourth-rung inverse.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_red_suite', true);
\i migrations/inverse/laddercap_the_overreach_census_knows_the_fourth_rung_down.sql
do $t$
declare v_n int;
begin
  -- STEPPING OUT, and asserting no product clause while out: the overreach census is a
  -- whole-database read that crosses every organization and no client door exposes it.
  select count(*) into v_n from iam.member_level_overreach();
  if v_n = 0 then
    raise exception '3 STAYED GREEN — with the fourth rung taken back out, the overreach census '
      'is still zero, so this lane is not what made levelfix PART 6 pass.';
  end if;
  raise notice '3: RED — the overreach census names % member(s) again, because it no longer knows '
    'that a Table you can see something inside is a Table you may know.', v_n;
end $t$;
rollback;

-- ══════════════ BLOCK 4 — THREE DOORS STOP ASKING WHETHER SHE MAY KNOW THE TABLE, and
-- STORE-REL's own census names them again. Executes the three-door inverse.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_red_suite', true);
\i migrations/inverse/laddercap_three_doors_ask_whether_she_may_know_the_table_down.sql
do $t$
declare v_n int; v_who text;
begin
  -- STEPPING OUT, and asserting no product clause while out: this census reads the catalogue of
  -- every client door in the schema and no client door exposes it.
  select count(*), string_agg(function_name, ', ' order by function_name)
    into v_n, v_who from custom.tables_described_without_asking();
  if v_n = 0 then
    raise exception '4 STAYED GREEN — with the VIS-5 line taken back out of all three doors, the '
      'census is still empty, so this lane is not what made storerel_green PART 4j pass.';
  end if;
  raise notice '4: RED — % door(s) describe a Table without asking whether the caller may know it '
    'exists again: %', v_n, v_who;
end $t$;
rollback;

-- ══════════════ ROLLBACK VERIFIED — the landed state answered the whole time underneath.
begin;
set local statement_timeout = '60s';
do $t$
declare v_n int;
begin
  if to_regprocedure('custom.addressed_cap(uuid,text,uuid,uuid,uuid)') is null
     or to_regprocedure('custom.addressed_cap_specific(uuid,text,uuid,uuid,uuid)') is null then
    raise exception 'ROLLBACK FAILED — a function this lane landed is missing after the blocks.';
  end if;
  select count(*) into v_n from custom.levels_raised_by_a_less_specific_rung();
  if v_n <> 0 then raise exception 'ROLLBACK FAILED — census is % after the blocks', v_n; end if;
  select count(*) into v_n from iam.member_level_overreach();
  if v_n <> 0 then raise exception 'ROLLBACK FAILED — overreach census is % after the blocks', v_n; end if;
  select count(*) into v_n from custom.tables_described_without_asking();
  if v_n <> 0 then raise exception 'ROLLBACK FAILED — % door(s) describe a Table without asking, after the blocks', v_n; end if;
  raise notice 'ROLLBACK VERIFIED — every landed body is back and both censuses are zero.';
  raise notice 'LADDER-CAP RED: every block is RED.';
end $t$;
commit;

-- ═══════════════════════════ TEARDOWN — the throwaway organization leaves nothing behind.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;
do $t$
declare v_n int;
begin
  select count(*) into v_n from custom.levels_raised_by_a_less_specific_rung();
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — census is % after teardown', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero, the throwaway organization is gone.';
  raise notice 'LADDER-CAP RED: teardown complete.';
end $t$;
commit;
