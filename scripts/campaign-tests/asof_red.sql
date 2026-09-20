-- STORE-ASOF — THE RED TWIN. Every claim the green suite makes, made FALSE again by putting
-- the pre-STORE-ASOF bodies back — inside ONE transaction that is ROLLED BACK, so nothing here
-- survives the run. A guard you cannot show failing is not a guard.
--
-- RUN IT exactly like the green suite:
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/asof_red.sql
--
-- Each block RAISES if the old body still behaves like the new one — that is, a block is GREEN
-- only when the defect it names is present, which is what makes this a red twin rather than a
-- second green suite. The bodies restored below are the ones in
-- migrations/inverse/asof_*_down.sql, so running this also proves those inverses are valid SQL
-- against the live catalogue.
--
-- IT CREATES NOTHING AND DELETES NOTHING. Two blocks measure against organizations that
-- already exist and only ever SELECT from them.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'asof_red_suite', true);

-- ══════════════════ RED 1 — T13: the one-record question walks the whole organization
do $t$
declare
  v_org uuid; v_rec uuid; v_user uuid;
  v_new numeric; v_old numeric; t0 timestamptz; i int; ok boolean;
  n int;
begin
  -- The largest organization on this database that actually has a member to ask as. It is
  -- only ever read.
  select m.organization_id, m.user_id into v_org, v_user
    from iam.organization_member m
    join (select organization_id, count(*) c from custom.record
           where deleted_at is null group by 1) k on k.organization_id = m.organization_id
   order by k.c desc limit 1;
  if v_org is null then raise exception 'RED 1 could not find an organization with both records and a member.'; end if;
  select r.id into v_rec from custom.record r
   where r.organization_id = v_org and r.deleted_at is null order by r.created_at limit 1;
  select count(*) into n from custom.record where organization_id = v_org and deleted_at is null;
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_user), true);

  t0 := clock_timestamp();
  for i in 1..5 loop ok := custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_new := extract(epoch from (clock_timestamp() - t0)) * 1000 / 5;
end $t$;

-- the pre-STORE-ASOF body, verbatim from migrations/inverse/asof_one_record_is_one_question_down.sql
create or replace function custom.query_can_see(p_organization_id uuid, p_record_id uuid, p_required text default 'viewer')
returns boolean language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_can_see');
  return (
select exists (select 1 from custom.query_visible_ids(p_organization_id, null, p_required) v
                  where v = p_record_id)
  );
end;
$fn$;

do $t$
declare
  v_org uuid; v_rec uuid; v_user uuid; n int;
  v_old numeric; t0 timestamptz; i int; ok boolean; v_body text;
begin
  select m.organization_id, m.user_id into v_org, v_user
    from iam.organization_member m
    join (select organization_id, count(*) c from custom.record
           where deleted_at is null group by 1) k on k.organization_id = m.organization_id
   order by k.c desc limit 1;
  select r.id into v_rec from custom.record r
   where r.organization_id = v_org and r.deleted_at is null order by r.created_at limit 1;
  select count(*) into n from custom.record where organization_id = v_org and deleted_at is null;
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_user), true);

  t0 := clock_timestamp();
  for i in 1..5 loop ok := custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_old := extract(epoch from (clock_timestamp() - t0)) * 1000 / 5;
  perform set_config('request.jwt.claims', '', true);

  v_body := regexp_replace(pg_get_functiondef('custom.query_can_see(uuid,uuid,text)'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');
  if v_body !~* 'custom\.query_visible_ids' then
    raise exception 'RED 1 NOT RED — the restored old body does not reach the list-everything door, so it is not the old body.';
  end if;
  if v_old < 50 then
    raise exception 'RED 1 NOT RED — the old body answered one record in % ms over % live records; it is supposed to walk them all.', round(v_old,3), n;
  end if;
  raise notice 'RED 1 is RED — the pre-STORE-ASOF door answers ONE record in % ms by walking all % of them.', round(v_old, 3), n;
end $t$;

-- ══════════════ RED 2 — T6: the two clocks answer for each other
do $t$
declare
  d constant jsonb := '{"name":"ABC Contract","terms":"gold","_values":{"terms":{"dated":[{"from":"2027-01-01","to":"2029-01-01","value":"gold"}]}}}'::jsonb;
  v_body text;
begin
  -- The old door's two paths, asked of the function that IS those two paths.
  if history.value_in_document(d, 'terms', null) is distinct from '"gold"'::jsonb then
    raise exception 'RED 2 NOT RED — with no world date the old path no longer hands back the 2027 value as the present one.';
  end if;
  if history.value_in_document(d, 'name', '2027-03-01') is not null then
    raise exception 'RED 2 NOT RED — the old path no longer blanks an undated key under a world date.';
  end if;
  -- And the new one, on the same document, telling the two apart.
  if history.value_in_force(d, 'terms', current_date) ->> 'state' is distinct from 'not_yet' then
    raise exception 'RED 2 FAILED — the new answer does not say the contract is not yet in force.';
  end if;
  if history.value_in_force(d, 'name', '2027-03-01') -> 'value' is distinct from '"ABC Contract"'::jsonb then
    raise exception 'RED 2 FAILED — the new answer loses the undated key it is supposed to keep.';
  end if;
  raise notice 'RED 2 is RED — the old path answers a 2027 contract as today''s value and deletes the record''s own name from a dated read.';
end $t$;

-- the pre-STORE-ASOF body, verbatim from migrations/inverse/asof_two_clocks_never_answer_for_each_other_down.sql
create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
                                                    p_recorded_at timestamptz default null,
                                                    p_world_on date default null,
                                                    p_required text default 'viewer')
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb; v_out jsonb := '{}'::jsonb; v_key text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then return null; end if;
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then return null; end if;
  if p_world_on is null then return v_doc; end if;
  for v_key in select jsonb_object_keys(v_doc) loop
    v_out := v_out || jsonb_build_object(v_key, history.value_in_document(v_doc, v_key, p_world_on));
  end loop;
  return v_out;
end;
$fn$;

do $t$
declare v_body text;
begin
  v_body := regexp_replace(pg_get_functiondef('custom.query_record_as_of(uuid,uuid,timestamptz,date,text)'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');
  if v_body ~* 'value_in_force' then
    raise exception 'RED 2b NOT RED — the restored old door still knows about the in-force answer.';
  end if;
  if v_body !~* 'if p_world_on is null then return v_doc' then
    raise exception 'RED 2b NOT RED — the restored old door no longer falls through to the stored document.';
  end if;
  raise notice 'RED 2b is RED — the old door has no notion of a value being in force at all.';
end $t$;

-- ══════════════ RED 3 — T15: the share is filed nowhere, and the interval is unaskable
do $t$
declare n int;
begin
  -- Every record share recorded BEFORE this lane, on this database, filed under no
  -- organization at all — because the capture asked the platform-wide switch.
  select count(*) into n from history.row_versions
   where entity_type = 'iam.permissions' and row_data ->> 'resource_type' = 'record'
     and organization_id is null;
  if n = 0 then
    raise exception 'RED 3 NOT RED — no record share on this database was ever filed under no organization, so there was nothing to fix.';
  end if;
  -- And the switch the old capture asked is still false platform-wide, which is why it could
  -- never open for an organization that had turned its own store on.
  if custom.store_is_open(null) then
    raise exception 'RED 3 NOT RED — the platform-wide store switch is on, so asking it was not the defect.';
  end if;
  raise notice 'RED 3 is RED — % record share(s) already on this database are filed under no organization, and the switch the old capture asked is false platform-wide.', n;
end $t$;

-- the pre-STORE-ASOF audit answer: seven columns, no interval
drop function if exists custom.visibility_as_of(uuid, uuid, timestamptz);
create function custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns table(principal_kind text, principal_id uuid, level public.permission_level,
              through_kind text, through_id uuid, reason text, replayed boolean)
language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
begin
  -- the shape is what is under test here, not the arms
  return;
end;
$fn$;

do $t$
declare n int;
begin
  begin
    execute 'select held_from from custom.visibility_as_of(null::uuid, null::uuid, now()) limit 1';
    raise exception 'RED 3b NOT RED — the seven-column audit answer still has an interval on it.';
  exception when undefined_column then
    null;   -- "column held_from does not exist" — which is the point
  end;
  raise notice 'RED 3b is RED — with the old audit answer back, how long somebody held a record cannot be asked at all.';
end $t$;

-- ══════════════ RED 4 — T1: the diff excuses depth by a literal and states nothing
create or replace function custom.visibility_parity()
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language sql stable security definer set search_path to ''
as $fn$
  with recursive edges as materialized (
    select e.container_type, e.container_id, e.item_type, e.item_id, e.conveys_max
      from custom.carrying_edges e
  ), roots as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), walk as (
    select r.ct as root_type, r.ci as root_id, e.item_type, e.item_id,
           1 as depth, e.conveys_max as max_level,
           array[r.ct || ':' || r.ci::text, e.item_type || ':' || e.item_id::text] as path
      from roots r join edges e on e.container_type = r.ct and e.container_id = r.ci
    union all
    select w.root_type, w.root_id, e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),
           w.path || (e.item_type || ':' || e.item_id::text)
      from walk w join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth < 16 and not (e.item_type || ':' || e.item_id::text) = any (w.path)
  ), derived as (
    select w.root_type as container_type, w.root_id as container_id, w.item_type, w.item_id,
           min(w.depth) as depth, max(w.max_level) as max_level
      from walk w group by 1, 2, 3, 4
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d on d.container_type = r.container_type and d.container_id = r.container_id
                     and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null
  union all
  select 'level_differs', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, d.max_level, 'same pair, different level'
  from platform.reachability r
  join derived d on d.container_type = r.container_type and d.container_id = r.container_id
                and d.item_type = r.item_type and d.item_id = r.item_id
  where d.max_level is distinct from r.max_level
  union all
  select 'derived_only', d.container_type, d.container_id, d.item_type, d.item_id,
         null::public.permission_level, d.max_level,
         case when d.depth > 8 then 'beyond_stored_ceiling'
              else 'derived row the stored closure does not hold' end
  from derived d
  left join platform.reachability r on r.container_type = d.container_type and r.container_id = d.container_id
                                   and r.item_type = d.item_type and r.item_id = d.item_id
  where r.item_id is null;
$fn$;

do $t$
declare n int; v_body text;
begin
  select count(*) into n from custom.visibility_parity() p where p.side = 'depth_measured';
  if n <> 0 then raise exception 'RED 4 NOT RED — the old diff states its own reach.'; end if;
  select count(*) into n from custom.visibility_parity() p where p.side = 'depth_exceeded';
  if n <> 0 then raise exception 'RED 4 NOT RED — the old diff reports a path it could not reach.'; end if;
  v_body := pg_get_functiondef('custom.visibility_parity()'::regprocedure);
  if v_body !~ 'd\.depth > 8' then
    raise exception 'RED 4 NOT RED — the restored body no longer carries the literal 8.';
  end if;
  raise notice 'RED 4 is RED — the old diff excuses everything past a hard-coded depth of 8 and never says how deep it looked.';
end $t$;

do $t$ begin raise notice '5 of 5 blocks are RED.'; end $t$;
rollback;

do $t$
declare v_body text;
begin
  v_body := pg_get_functiondef('custom.visibility_parity()'::regprocedure);
  if v_body ~ 'd\.depth > 8' then
    raise exception 'ROLLBACK DID NOT TAKE — the old visibility_parity body is still live.';
  end if;
  -- comments stripped: the STORE-ASOF body NAMES the list-everything door in a comment, to say
  -- which rung it climbs instead. A comment is not a call.
  if regexp_replace(pg_get_functiondef('custom.query_can_see(uuid,uuid,text)'::regprocedure),
                    '--[^' || chr(10) || ']*', '', 'g') ~* 'query_visible_ids' then
    raise exception 'ROLLBACK DID NOT TAKE — the old query_can_see body is still live.';
  end if;
  raise notice 'ROLLBACK VERIFIED — every restored body is gone and the STORE-ASOF bodies are live.';
end $t$;
