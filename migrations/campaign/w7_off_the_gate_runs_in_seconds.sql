-- chair-step: this replaces the bodies of two functions THIS LANE created hours ago and nothing outside the campaign has ever called. It cannot carry `-- guard: custom/code_paths_enabled` and read it, because a gate that refuses to run while the campaign is off is a gate that can never be run BEFORE the switch, which is the only time it matters. The knob still holds every consumer OFF; this file changes how fast the gate answers and whose containers its drift check covers, never whether anybody is switched.
-- based-on: campaign_watch.consumer_access_diff(text, uuid) 276b2af68a972868bbe2cd8f03db2985273e6dc397f2fc8214e3462a08cbb31f
-- based-on: campaign_watch.consumer_gate(text, uuid, uuid) 6b31e2ce1b6919f2dd599dfe3ca4b3ff4c46429a31b1a5e52a6362b555c5f4d5
--
-- W7-OFF — THE GATE RUNS IN SECONDS, AND ITS DRIFT CHECK IS THE ORGANIZATION'S.
--
-- WHAT WENT WRONG, MEASURED ON THE MAIN DATABASE 2026-09-19. The first cut of
-- this gate ran for 97 seconds on a throwaway organization holding ONE edge, and
-- then hit the 2 minute statement timeout on its second run. Two causes, both of
-- them the same mistake in different clothes — asking a platform-wide question
-- to answer a per-organization one:
--
--   1. THE PRINCIPAL FILTER WAS AN `OR`. `granted_to_organization_id = $1 OR
--      exists (… memberships …)` cannot use either of the two partial indexes on
--      iam.permissions, so it scanned all 4,600-odd live grants and then
--      CROSS JOIN LATERAL'd platform.derive_reachability over every one of them:
--      thousands of closure walks to answer a question about two principals.
--      It is now a UNION ALL of two index-friendly branches, which is the same
--      set by construction (the table's own CHECK constraint makes the two
--      branches disjoint: a grant carries a user id or an organization id or
--      neither, never both).
--
--   2. THE DRIFT INSTRUMENT WAS THE WHOLE PLATFORM. `platform.reachability_drift()`
--      derives the closure of EVERY container in the database — 6,322 containment
--      edges — and the gate then threw away every row that did not touch this
--      consumer's record types. The cache being wrong three tenants away is a
--      real defect, and it belongs to the nightly self-heal (cron job 21) and to
--      `platform.reachability_drift()` itself; it is not a reason to refuse THIS
--      organization's switch, and paying for it on every gate run is what made
--      the gate unusable from a screen. The gate now compares the cache to the
--      derived closure over THIS ORGANIZATION'S OWN CONTAINERS, and the verdict
--      sentence says exactly that, so nobody reads it as a platform-wide claim.
--
-- WHAT DID NOT CHANGE: the comparison, the collapse to a maximum level per
-- (principal, item), lost and gained counted separately (CUT-N-8), the three
-- verdicts, and the anti-vacuity floor. This is a speed and scope fix, not a
-- softer gate — the red case is re-proven after it lands.

set lock_timeout = '3s';
set statement_timeout = '5min';

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
  grants as (
    -- Branch one: granted TO this organization. Uses idx_permissions_org_grant.
    select p.resource_type, p.resource_id, p.permission_level,
           'organization'::text as principal_kind,
           p.granted_to_organization_id as principal_id
      from iam.permissions p
     where p.granted_to_organization_id = p_organization_id
       and p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
    union all
    -- Branch two: granted to a member of this organization. Driven from the
    -- membership side, so the planner starts from the handful of members rather
    -- than from every grant in the database.
    select p.resource_type, p.resource_id, p.permission_level,
           'user'::text as principal_kind,
           p.granted_to_user_id as principal_id
      from iam.memberships m
      join iam.permissions p on p.granted_to_user_id = m.user_id
     where m.organization_id = p_organization_id
       and m.deleted_at is null
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

-- THE CACHE DISAGREEMENT, SCOPED TO ONE ORGANIZATION'S CONTAINERS.
-- The same question platform.reachability_drift() asks, asked only about the
-- containers this organization holds a grant on. A row here means the stored
-- form and the associations disagree in a way that no CURRENT grant happens to
-- surface but the next grant would.
create function campaign_watch.consumer_cache_drift(
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
  containers as (
    select distinct p.resource_type as container_type, p.resource_id as container_id
      from iam.permissions p
     where p.granted_to_organization_id = p_organization_id
       and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
    union
    select distinct p.resource_type, p.resource_id
      from iam.memberships m
      join iam.permissions p on p.granted_to_user_id = m.user_id
     where m.organization_id = p_organization_id and m.deleted_at is null
       and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
  ),
  derived as (
    select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
      from containers c
      cross join lateral platform.derive_reachability(c.container_type, c.container_id) d
     where d.item_type in (select unnest(t.record_types) from types t)
  ),
  cached as (
    select r.container_type, r.container_id, r.item_type, r.item_id, r.depth, r.max_level
      from platform.reachability r
      join containers c
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

  -- The principals this organization actually has. Zero is the anti-vacuity case
  -- and is never green: "lost 0, gained 0" over no principal is what an empty
  -- set returns, not a proof.
  select count(*)::int into v_princ from (
    select distinct 'organization'::text as k, p.granted_to_organization_id as id
      from iam.permissions p
     where p.granted_to_organization_id = p_organization_id
       and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
    union
    select distinct 'user'::text, p.granted_to_user_id
      from iam.memberships m
      join iam.permissions p on p.granted_to_user_id = m.user_id
     where m.organization_id = p_organization_id and m.deleted_at is null
       and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
  ) s;

  select count(*) filter (where side = 'lost'),
         count(*) filter (where side = 'gained')
    into v_lost, v_gained
    from campaign_watch.consumer_access_diff(p_consumer, p_organization_id);

  select count(*) into v_stored
    from platform.reachability r
   where r.item_type = any (v_consumer.record_types)
     and (r.container_type, r.container_id) in (
       select p.resource_type, p.resource_id from iam.permissions p
        where p.granted_to_organization_id = p_organization_id
          and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
       union
       select p.resource_type, p.resource_id
         from iam.memberships m join iam.permissions p on p.granted_to_user_id = m.user_id
        where m.organization_id = p_organization_id and m.deleted_at is null
          and p.status = 'active' and (p.expires_at is null or p.expires_at > now()));

  v_drift := campaign_watch.consumer_cache_drift(p_consumer, p_organization_id);
  v_derived := v_stored + v_gained - v_lost;

  if v_consumer.landed_at is null then
    v_verdict := 'red';
    v_why := 'This consumer''s code has not landed: ' || coalesce(v_consumer.not_ready_why, '(no reason recorded)')
             || ' A gate over code that does not exist cannot say anything about it.';
  elsif v_princ = 0 or (v_stored = 0 and v_gained = 0) then
    v_verdict := 'nothing_to_compare';
    v_why := 'Nothing to compare: ' || v_princ || ' principal(s) hold a live grant in this '
             || 'organization and the cache carries ' || v_stored || ' pair(s) over record type(s) '
             || array_to_string(v_consumer.record_types, ', ')
             || '. "Lost 0, gained 0" is what an empty set returns, so this is not green. REMEDY: '
             || 'ramp an organization that holds real data, or give this one the records and grants '
             || 'the consumer actually reads.';
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
             || '; the cache and the associations agree on every one of this ORGANISATION''S OWN '
             || 'containers. It says nothing about the rest of the platform — that is '
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
select 'campaign_watch', 'consumer_cache_drift', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes),
       'The cache-versus-associations disagreement over ONE organization''s own containers. p_organization_id names that organization; a foreign or invented id simply yields no containers and therefore zero.',
       'W7-OFF', false, false,
       'server_only: called by campaign_watch.consumer_gate and by the campaign runner, both behind a platform-admin identity. No client calls it: it reads every container an organization holds a grant on.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'campaign_watch'
 where p.proname = 'consumer_cache_drift'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'campaign_watch' and c.function_name = 'consumer_cache_drift'
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));
