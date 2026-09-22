-- chair-step: the third and last correction to this lane's own gate bodies, which nothing outside the campaign has ever called. It cannot carry `-- guard: custom/code_paths_enabled` and read it, because a gate that refuses to run while the campaign is off can never be run BEFORE the switch, which is the only time it matters.
-- based-on: campaign_watch.consumer_access_diff(text, uuid) 509c81c98b4d5040e86f33f1c05365b7620501387c2ac5aacaa6c3c77fb94986
-- based-on: campaign_watch.consumer_cache_drift(text, uuid) 64b732cd703e39e3c7ecda7488e43ab6693abd9583d8554959afe622b235c580
-- based-on: campaign_watch.consumer_gate(text, uuid, uuid) b0540c83cb53ddaa7f76b17fb599be5449c935d670098e593280482cbf39f9d1
--
-- W7-OFF — THE GATE ASKS ABOUT ONE ORGANIZATION'S CONTAINERS, AND IT STOPS EARLY.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-19, twice, with a stopwatch.
-- "The principals of this organization" was read as "every grant held by anyone
-- who is a member of it". The admin account is a member of the throwaway
-- organization and holds 923 grants ACROSS THE WHOLE PLATFORM, so the gate
-- walked 923 containment closures to answer a question about an organization
-- with ONE edge in it — 97 s, then 47 s after the first fix, then the 2 minute
-- statement timeout on the switch itself. Even the "this consumer has not
-- landed" case, whose answer needs no data at all, timed out.
--
-- It was wrong in MEANING before it was wrong in cost, and that is the real
-- finding. A grant the admin holds on some other organization's record is not
-- this organization's business, and an access change there is not a reason to
-- refuse — or to allow — this organization's switch. A per-organization gate
-- that quietly widens to the platform is exactly the "gate with something else
-- behind it" this campaign keeps refusing elsewhere.
--
-- THE SCOPE, STATED ONCE AND USED BY ALL THREE FUNCTIONS. The containers in
-- scope are the containers of THIS ORGANIZATION'S OWN containment edges —
-- `platform.associations` rows carrying `organization_id = $1`, joined to
-- `platform.association_types` exactly as `platform.containment_edges` does
-- (the view is inlined only because it does not expose organization_id). The
-- principals in scope are the grants ON THOSE CONTAINERS, held by the
-- organization itself or by one of its members. Both halves are now bounded by
-- the organization, which is what "ramp one organization" means.
--
-- AND IT STOPS EARLY. A consumer whose code has not landed is answered before a
-- single row is read: that verdict is a fact about the codebase, and making a
-- person wait 47 s for it — or time out — was absurd.
--
-- WHAT DID NOT CHANGE: lost and gained counted separately (CUT-N-8), the
-- collapse to a maximum level per (principal, item), the three verdicts, the
-- anti-vacuity floor, and the sentence each verdict carries. The red case is
-- re-proven against these bodies after they land.

set lock_timeout = '3s';
set statement_timeout = '5min';

-- THE SCOPE. One function, so the diff, the drift check and the gate cannot
-- drift apart about what "this organization's containers" means.
create or replace function campaign_watch.consumer_scope(
  p_organization_id uuid
)
returns table (container_type text, container_id uuid)
language sql
stable
security definer
set search_path to ''
as $fn$
  select distinct
         case when r.container_side = 'source' then a.source_type else a.target_type end,
         case when r.container_side = 'source' then a.source_id   else a.target_id   end
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type
     and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.organization_id = p_organization_id
     and a.deleted_at is null
     and r.is_active
     and r.container_side in ('source', 'target');
$fn$;

create or replace function campaign_watch.consumer_access_diff(
  p_consumer        text,
  p_organization_id uuid
)
returns table (
  side           text,
  principal_kind text,
  principal_id   uuid,
  item_type      text,
  item_id        uuid,
  stored_level   public.permission_level,
  derived_level  public.permission_level
)
language sql
stable
security definer
set search_path to ''
as $fn$
  with types as (
    select c.record_types from campaign_watch.ramp_consumer c
     where c.consumer_id = p_consumer
  ),
  scope as (
    select s.container_type, s.container_id from campaign_watch.consumer_scope(p_organization_id) s
  ),
  grants as (
    select p.resource_type, p.resource_id, p.permission_level,
           'organization'::text as principal_kind,
           p.granted_to_organization_id as principal_id
      from scope s
      join iam.permissions p
        on p.resource_type = s.container_type and p.resource_id = s.container_id
     where p.granted_to_organization_id = p_organization_id
       and p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
    union all
    select p.resource_type, p.resource_id, p.permission_level,
           'user'::text as principal_kind,
           p.granted_to_user_id as principal_id
      from scope s
      join iam.permissions p
        on p.resource_type = s.container_type and p.resource_id = s.container_id
     where p.granted_to_user_id in (select m.user_id from iam.memberships m
                                     where m.organization_id = p_organization_id
                                       and m.deleted_at is null)
       and p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
  ),
  stored as (
    select g.principal_kind, g.principal_id, r.item_type, r.item_id,
           max(least(g.permission_level, r.max_level)) as lvl
      from grants g
      join platform.reachability r
        on r.container_type = g.resource_type
       and r.container_id   = g.resource_id
     where r.item_type in (select unnest(t.record_types) from types t)
     group by 1, 2, 3, 4
  ),
  derived as (
    select g.principal_kind, g.principal_id, d.item_type, d.item_id,
           max(least(g.permission_level, d.max_level)) as lvl
      from grants g
      cross join lateral platform.derive_reachability(g.resource_type, g.resource_id) d
     where d.item_type in (select unnest(t.record_types) from types t)
     group by 1, 2, 3, 4
  )
  select case
           when s.item_id is null                then 'gained'
           when d.item_id is null                then 'lost'
           when d.lvl > s.lvl                    then 'gained'
           when d.lvl < s.lvl                    then 'lost'
         end as side,
         coalesce(s.principal_kind, d.principal_kind),
         coalesce(s.principal_id,   d.principal_id),
         coalesce(s.item_type,      d.item_type),
         coalesce(s.item_id,        d.item_id),
         s.lvl,
         d.lvl
    from stored s
    full outer join derived d
      on  d.principal_kind = s.principal_kind
     and  d.principal_id is not distinct from s.principal_id
     and  d.item_type      = s.item_type
     and  d.item_id        = s.item_id
   where s.item_id is null
      or d.item_id is null
      or d.lvl is distinct from s.lvl;
$fn$;

create or replace function campaign_watch.consumer_cache_drift(
  p_consumer        text,
  p_organization_id uuid
)
returns bigint
language sql
stable
security definer
set search_path to ''
as $fn$
  with types as (
    select c.record_types from campaign_watch.ramp_consumer c where c.consumer_id = p_consumer
  ),
  scope as (
    select s.container_type, s.container_id from campaign_watch.consumer_scope(p_organization_id) s
  ),
  derived as (
    select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
      from scope c
      cross join lateral platform.derive_reachability(c.container_type, c.container_id) d
     where d.item_type in (select unnest(t.record_types) from types t)
  ),
  cached as (
    select r.container_type, r.container_id, r.item_type, r.item_id, r.depth, r.max_level
      from platform.reachability r
      join scope c
        on c.container_type = r.container_type and c.container_id = r.container_id
     where r.item_type in (select unnest(t.record_types) from types t)
  )
  select count(*)
    from cached r
    full outer join derived d
      on  d.container_type = r.container_type and d.container_id = r.container_id
     and  d.item_type      = r.item_type      and d.item_id      = r.item_id
   where r.item_id is null
      or d.item_id is null
      or r.depth     is distinct from d.depth
      or r.max_level is distinct from d.max_level;
$fn$;

create or replace function campaign_watch.consumer_gate(
  p_consumer        text,
  p_organization_id uuid,
  p_ran_by          uuid default null
)
returns campaign_watch.ramp_gate_run
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_consumer  campaign_watch.ramp_consumer%rowtype;
  v_started   timestamptz := clock_timestamp();
  v_row       campaign_watch.ramp_gate_run%rowtype;
  v_princ     integer := 0;
  v_stored    bigint  := 0;
  v_derived   bigint  := 0;
  v_lost      bigint  := 0;
  v_gained    bigint  := 0;
  v_drift     bigint  := 0;
  v_verdict   text;
  v_why       text;
begin
  select * into v_consumer
    from campaign_watch.ramp_consumer where consumer_id = p_consumer;
  if not found then
    raise exception 'campaign_watch.consumer_gate: "%" is not a consumer in campaign_watch.ramp_consumer', p_consumer
      using errcode = 'P0001',
            hint = 'The ramp register is the one place a consumer exists. Add the row and its knob, or fix the id.';
  end if;

  -- STOP EARLY. This verdict is a fact about the codebase and needs no data at
  -- all; reading a graph to produce it is pure cost.
  if v_consumer.landed_at is null then
    insert into campaign_watch.ramp_gate_run
      (consumer_id, organization_id, ran_by, principals, pairs_stored, pairs_derived,
       lost_count, gained_count, drift_rows, verdict, why, duration_ms)
    values
      (p_consumer, p_organization_id, p_ran_by, 0, 0, 0, 0, 0, 0, 'red',
       'This consumer''s code has not landed: ' || coalesce(v_consumer.not_ready_why, '(no reason recorded)')
       || ' A gate over code that does not exist cannot say anything about it, so nothing was read.',
       (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int)
    returning * into v_row;
    return v_row;
  end if;

  select count(*)::int into v_princ from (
    select distinct p.granted_to_user_id, p.granted_to_organization_id
      from campaign_watch.consumer_scope(p_organization_id) s
      join iam.permissions p
        on p.resource_type = s.container_type and p.resource_id = s.container_id
     where p.status = 'active' and (p.expires_at is null or p.expires_at > now())
       and ( p.granted_to_organization_id = p_organization_id
          or p.granted_to_user_id in (select m.user_id from iam.memberships m
                                       where m.organization_id = p_organization_id
                                         and m.deleted_at is null) )
  ) q;

  select count(*) filter (where side = 'lost'),
         count(*) filter (where side = 'gained')
    into v_lost, v_gained
    from campaign_watch.consumer_access_diff(p_consumer, p_organization_id);

  select count(*) into v_stored
    from platform.reachability r
    join campaign_watch.consumer_scope(p_organization_id) s
      on s.container_type = r.container_type and s.container_id = r.container_id
   where r.item_type = any (v_consumer.record_types);

  v_drift := campaign_watch.consumer_cache_drift(p_consumer, p_organization_id);
  v_derived := v_stored + v_gained - v_lost;

  if v_princ = 0 or (v_stored = 0 and v_gained = 0) then
    v_verdict := 'nothing_to_compare';
    v_why := 'Nothing to compare: this organization''s own containment edges carry '
             || v_princ || ' principal(s) with a live grant and ' || v_stored
             || ' cached pair(s) over record type(s) '
             || array_to_string(v_consumer.record_types, ', ')
             || '. "Lost 0, gained 0" is what an empty set returns, so this is not green. REMEDY: '
             || 'ramp an organization that holds real data of this kind, or give this one the '
             || 'records and grants the consumer actually reads.';
  elsif v_gained > 0 then
    v_verdict := 'red';
    v_why := v_gained || ' principal/item pair(s) GAIN access under the derived model that they do '
             || 'not hold today, and ' || v_lost || ' lose it. Gained access is its own gate '
             || '(CUT-N-8): a more permissive model passes the lost half and is still a security '
             || 'regression. Read them with campaign_watch.consumer_access_diff(' || quote_literal(p_consumer)
             || ', ' || quote_literal(p_organization_id::text) || '::uuid).';
  elsif v_lost > 0 then
    v_verdict := 'red';
    v_why := v_lost || ' principal/item pair(s) LOSE access under the derived model (0 gained). '
             || 'Read them with campaign_watch.consumer_access_diff(' || quote_literal(p_consumer)
             || ', ' || quote_literal(p_organization_id::text) || '::uuid).';
  elsif v_drift > 0 then
    v_verdict := 'red';
    v_why := 'No principal gains or loses access, but the cache disagrees with the associations on '
             || v_drift || ' pair(s) over this organization''s own containers. The cache is wrong in '
             || 'a way no current grant happens to see, and the next grant would see it.';
  else
    v_verdict := 'green';
    v_why := 'Lost 0, gained 0, counted separately, over ' || v_princ || ' principal(s) and '
             || v_stored || ' cached pair(s) of record type(s) '
             || array_to_string(v_consumer.record_types, ', ')
             || '; the cache and the associations agree on every one of THIS ORGANIZATION''S OWN '
             || 'containment edges. It says nothing about the rest of the platform — that is '
             || 'platform.reachability_drift() and the nightly self-heal, not this switch.';
  end if;

  insert into campaign_watch.ramp_gate_run
    (consumer_id, organization_id, ran_by, principals, pairs_stored, pairs_derived,
     lost_count, gained_count, drift_rows, verdict, why, duration_ms)
  values
    (p_consumer, p_organization_id, p_ran_by, v_princ, v_stored, v_derived,
     v_lost, v_gained, v_drift, v_verdict, v_why,
     (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int)
  returning * into v_row;

  return v_row;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'campaign_watch', 'consumer_scope', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes),
       'The containers of one organization''s own containment edges. p_organization_id is the only argument and it is the filter: a foreign or invented id yields no rows, which is why every caller above is bounded by it.',
       'W7-OFF', false, false,
       'server_only: the shared scope of the three gate functions, called only behind a platform-admin identity. No client calls it: it lists every container an organization owns.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'campaign_watch'
 where p.proname = 'consumer_scope'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'campaign_watch' and c.function_name = 'consumer_scope'
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));
