-- W4-QUERY — THE RED TWIN of `scripts/campaign-tests/w4_query_green.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file breaks THIS
-- LANE'S enforcement points, one at a time, inside ONE transaction that ROLLS BACK, and asserts
-- that the thing the green suite proves DISAPPEARS — and, where the failure is a wrong answer
-- rather than an error, that the WRONG NUMBER is actually returned, which is the half that
-- matters.
--
--   RED 1 — DOOR-10. `custom.query_access_ids` is rewritten to always return null ("everything
--           is visible"). test@test.com then reads all four jobs it may not see. The green
--           suite's 0 becomes 4.
--   RED 2 — DOOR-6. `custom.query_by_coordinates` loses `count(distinct n)` for `count(*)`.
--           Two coordinates then match J2 through one edge counted twice, and the intersection
--           silently returns rows that satisfy only ONE of them.
--   RED 3 — DOOR-7. `custom.query_rollup` loses `group by`, and the loop-plus-diamond graph
--           returns more nodes than it has.
--   RED 4 — DOOR-8. `custom.query_record_as_of` ignores `p_recorded_at`, and "what did the
--           store say in August" answers with September's correction — one clock wearing two
--           argument names.
--   RED 5 — DOOR-N-3. `custom.query_prepare_hot` becomes a no-op and the hot paths are
--           unprepared, which is the 86 ms cold plan DOOR-N-3 measured.
--
-- It refuses to run anywhere but the rehearsal branch, by system identifier, and it is not a
-- migration: nothing in `migrations/` and no sweep can see it.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w4_query_red.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_query.red', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

\i scripts/campaign-tests/_w4_query_red_fixture.sql

\echo ''
\echo '══ RED 1 — DOOR-10: the Visibility helper is made to say "everything"'
\echo ''

do $red1$
declare
  v_before int; v_after int;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_before from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                              current_setting('zz.tjob')::uuid);
  if v_before <> 0 then
    raise exception 'RED 1 cannot run: the GREEN state is meant to be 0 for test@test.com here, and it is %', v_before;
  end if;

  -- THE BREAK.
  create or replace function custom.query_access_ids(p_organization_id uuid, p_required text default 'viewer')
  returns uuid[] language sql stable set search_path to 'pg_catalog' as $b$ select null::uuid[] $b$;

  select count(*) into v_after from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                             current_setting('zz.tjob')::uuid);
  perform set_config('request.jwt.claims', '', true);

  if v_after <> 3 then
    raise exception 'RED 1 DID NOT GO RED: with the helper answering "everything", test@test.com should read all 3 jobs and read %', v_after;
  end if;
  raise notice 'RED 1 PASS (it went red): 0 → % for a principal with no grant. The helper is load-bearing, and the whole lane reads it', v_after;
end $red1$;

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_query.red', true);
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

\echo ''
\echo '══ RED 2 — DOOR-6: DISTINCT is removed from the coordinate count'
\echo ''

\i scripts/campaign-tests/_w4_query_red_fixture.sql

do $red2$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_tjob uuid := current_setting('zz.tjob')::uuid;
  v_alpha uuid := current_setting('zz.alpha')::uuid;
  v_beta uuid := current_setting('zz.beta')::uuid;
  v_before int; v_after int;
begin
  -- GREEN: "related to Alpha AND to Beta" is J2 alone.
  select count(*) into v_before from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  if v_before <> 1 then
    raise exception 'RED 2 cannot run: the GREEN answer for the intersection is 1, and it is %', v_before;
  end if;

  -- THE BREAK: `count(distinct n)` becomes `count(*)`, so J1's ONE edge to Alpha, counted
  -- against a two-coordinate question, no longer distinguishes "two coordinates satisfied"
  -- from "one coordinate satisfied twice".
  create or replace function custom.query_by_coordinates(
    p_organization_id uuid, p_table_id uuid default null, p_coordinates jsonb default '[]'::jsonb,
    p_limit integer default 50, p_offset integer default 0, p_required text default 'viewer')
  returns table(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
  language plpgsql stable set search_path to 'pg_catalog' as $b$
  declare v_n integer;
  begin
    select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));
    return query
    with coord as (
      select ord as n, c ->> 'role' as role, (c ->> 'target_id')::uuid as target_id,
             coalesce(c ->> 'direction', 'from') as direction
        from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb)) with ordinality as t(c, ord)),
    hit as (
      select case when co.direction = 'to' then a.target_id else a.source_id end as rec_id, co.n
        from coord co
        join platform.associations a
          on a.organization_id = p_organization_id and a.deleted_at is null
         and a.relation_field_id is not null and (co.role is null or a.role = co.role)
         and ((co.direction = 'from' and a.source_type = 'record' and a.target_id = co.target_id)
           or (co.direction = 'to' and a.source_id = co.target_id))),
    satisfied as (
      select rec_id, count(*)::integer as matched from hit group by rec_id
      having count(*) >= v_n)                       -- THE BREAK
    select r.id, r.table_id, r.data, coalesce(s.matched, 0)
      from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
      join custom.record r on r.organization_id = p_organization_id and r.id = v
      left join satisfied s on s.rec_id = v
     where v_n = 0 or s.rec_id is not null
     order by r.created_at desc, r.id limit 100;
  end $b$;

  select count(*) into v_after from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_alpha)), 100, 0);
  if v_after < 2 then
    raise exception 'RED 2 DID NOT GO RED: with count(*) for count(distinct n), asking Alpha TWICE should admit J1 as well as J2 and returned %', v_after;
  end if;
  raise notice 'RED 2 PASS (it went red): the same coordinate asked twice now admits % records where the intersection is 1 — the DISTINCT is what makes "any subset" mean anything', v_after;
end $red2$;

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_query.red', true);
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');
\i scripts/campaign-tests/_w4_query_red_fixture.sql

\echo ''
\echo '══ RED 3 — DOOR-7: the rollup loses its grouping and double-counts the loop'
\echo ''

do $red3$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_before int; v_after int;
begin
  select count(*) into v_before from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if v_before <> 3 then
    raise exception 'RED 3 cannot run: the GREEN rollup over this three-node loop is 3, and it is %', v_before;
  end if;

  create or replace function custom.query_rollup(p_organization_id uuid, p_roots uuid[],
      p_flavor text default null, p_role text default null, p_max_depth integer default 33,
      p_required text default 'viewer')
  returns table(record_id uuid, depth integer)
  language plpgsql stable set search_path to 'pg_catalog' as $b$
  begin
    return query
    with recursive edge as (
      select e.parent_id, e.child_id from custom.query_relation_edges(p_organization_id, p_flavor, p_role) e),
    walk (node, d) as (
        select x, 0 from unnest(p_roots) as x
      union all
        select e.child_id, walk.d + 1 from walk join edge e on e.parent_id = walk.node where walk.d < 8)
    select w.node, w.d                               -- THE BREAK: no cycle stop, no grouping
      from walk w
      join custom.query_visible_ids(p_organization_id, null, p_required) v on v = w.node;
  end $b$;

  select count(*) into v_after from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if v_after <= v_before then
    raise exception 'RED 3 DID NOT GO RED: without the grouping the loop should overcount 3 nodes and returned %', v_after;
  end if;
  raise notice 'RED 3 PASS (it went red): 3 nodes became % — the number a caller would have shown a person as "how many jobs are downstream"', v_after;
end $red3$;

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_query.red', true);
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');
\i scripts/campaign-tests/_w4_query_red_fixture.sql

\echo ''
\echo '══ RED 4 — DOOR-8: the recorded clock is ignored and answers with today'
\echo ''

do $red4$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1 uuid := current_setting('zz.j1')::uuid;
  v_t constant timestamptz := '2026-08-10 12:00:00+00';
  v_then jsonb; v_then_broken jsonb;
begin
  update history.row_versions set occurred_at = v_t
   where entity_type = 'custom.record' and row_id = v_j1 and organization_id = v_org;
  perform custom.record_update(v_org, v_j1, '{"title":"J1 corrected"}'::jsonb, null);

  v_then := custom.query_record_as_of(v_org, v_j1, v_t + interval '1 second', null);
  if v_then ->> 'title' <> 'J1' then
    raise exception 'RED 4 cannot run: the GREEN recorded-clock answer is "J1", and it is %', v_then ->> 'title';
  end if;

  create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
      p_recorded_at timestamptz default null, p_world_on date default null,
      p_required text default 'viewer')
  returns jsonb language plpgsql stable set search_path to 'pg_catalog' as $b$
  declare v_doc jsonb;
  begin
    if not custom.query_can_see(p_organization_id, p_record_id, p_required) then return null; end if;
    select r.data into v_doc from custom.record r          -- THE BREAK: p_recorded_at ignored
     where r.organization_id = p_organization_id and r.id = p_record_id;
    return v_doc;
  end $b$;

  v_then_broken := custom.query_record_as_of(v_org, v_j1, v_t + interval '1 second', null);
  if v_then_broken ->> 'title' <> 'J1 corrected' then
    raise exception 'RED 4 DID NOT GO RED: ignoring p_recorded_at should answer with today''s "J1 corrected" and answered %', v_then_broken ->> 'title';
  end if;
  raise notice 'RED 4 PASS (it went red): the store now says it said "%" in August, which it did not. This is the silent wrong answer, not an error', v_then_broken ->> 'title';
end $red4$;

\echo ''
\echo '══ RED 5 — DOOR-N-3: the hot paths stop being prepared'
\echo ''

do $red5$
declare
  n_before int; n_after int;
begin
  perform custom.query_prepare_hot();
  select count(*) into n_before from custom.query_hot_paths_prepared() where prepared;
  if n_before < 4 then
    raise exception 'RED 5 cannot run: the GREEN state prepares 4 hot paths and prepared %', n_before;
  end if;
  deallocate all;

  create or replace function custom.query_prepare_hot() returns integer
  language sql set search_path to 'pg_catalog' as $b$ select 0 $b$;   -- THE BREAK

  perform custom.query_prepare_hot();
  select count(*) into n_after from custom.query_hot_paths_prepared() where prepared;
  if n_after <> 0 then
    raise exception 'RED 5 DID NOT GO RED: a no-op prepare should leave 0 hot paths prepared and left %', n_after;
  end if;
  raise notice 'RED 5 PASS (it went red): % prepared → 0. Every hot read goes back to planning against a table that grows one promoted index per organization per Field', n_before;
end $red5$;

\echo ''
\echo '══ W4-QUERY RED TWIN: every break went red ══'

rollback;
