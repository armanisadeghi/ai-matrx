-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- based-on: public.prune_high_volume_logs() 99be97d1e5fd266577457bb1e93c4f9242d2baf6e579bf51734c06e1679c058f
--
-- TIDY 1 — THE PROVENANCE LOG GETS A RETENTION POLICY, AND THE JOB THAT ALREADY RUNS
-- APPLIES IT.
--
-- CONTEXT-PERF's closing note: *"`custom.merge_field_provenance` is growing now that the
-- flush works ... Nobody has given it a retention policy, and the data-lifecycle system is
-- where that belongs."* Before this file the table had exactly one deleter in the whole
-- database: the hard-destroy arm of `custom.organization_clear`. A log with one deleter and
-- one writer only goes up.
--
-- THE FLOOR IS NOT A SECOND OPINION. The store's history already has a floor — the
-- `extensibility / user_tables.history_retention_floor_days` knob, read through
-- `history.retention_floor_days(org)` (default 30, min 30, raise_only). A provenance row is
-- the explanation OF a value whose own history is kept for that long; a shorter provenance
-- window would mean "the value is still here and why it says that is gone". So
-- `custom.provenance_retention_days` is the organization's own knob AND it can never resolve
-- below that floor: the function takes `greatest(knob, history floor)`. One knob, one floor,
-- and the two can never disagree.
--
-- WHAT IS NEVER DELETED. The LAST row per (organization, merge field key, merge field id) —
-- the item's most recent resolution — survives its own retention window, for any age, so
-- DYN-24's question *"what did it resolve to last"* always has an answer. **This log carries
-- no agent column** (see `db/migrations/campaign/dyn22_the_provenance_store.sql` in aidream
-- for its full shape): `conversation_id` and `turn_id` exist but are null on every row
-- written so far, because the context bridge does not yet pass them. So the keep-key is the
-- ITEM inside the organization, not (agent, item) — the closest key the row actually
-- carries. When the bridge starts passing a conversation, the keep-key becomes
-- (organization, conversation, item) by adding one column to the partition below, and this
-- comment is the note that says so.
--
-- NO NEW SCHEDULE. `../common-docs/policies/no-unapproved-schedules.md`: a cron job exists
-- only by Arman's approval, by name and interval. There is NO nightly retention job for this
-- campaign's store — I looked: `cron.job` holds thirteen rows and not one of them calls
-- `history.prune` or touches schema `custom`. What DOES already run, hourly and approved, is
-- `prune-high-volume-logs` -> `public.prune_high_volume_logs()`, whose whole job is exactly
-- this: deleting rows of a high-volume log past their retention. The provenance log is a
-- high-volume log. So it joins that function's body. The two existing blocks are unchanged,
-- byte for byte, and the schedule is untouched.
--
-- INVERSE: migrations/inverse/tidy_the_provenance_log_is_kept_not_hoarded_down.sql

set lock_timeout = '3s';
set statement_timeout = '5min';

-- ---------------------------------------------------------------------------
-- 1. THE KNOB.
-- ---------------------------------------------------------------------------
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, overridable_by, override_direction,
   propagation, public_read, ui)
values
  ('custom', 'provenance_retention_days', '30'::jsonb, '30'::jsonb, 'number', 'days', 30, 3650,
   'How long the merge-field provenance log is kept',
   'DYN-22/DYN-24. One row per resolved merge field per turn explains why a value said what '
   'it said. This is how many days those rows are kept. The default is the same floor the '
   'store''s own history uses (extensibility / user_tables.history_retention_floor_days, '
   '30 days), and custom.provenance_retention_days(org) resolves to the GREATER of the two, '
   'so an organization can keep its explanations longer than its history but never shorter. '
   'The most recent row for each merge field is never deleted at any age, so "what did it '
   'resolve to last" always answers.',
   'agent', 'Unified data campaign, lane TIDY 2026-09-20: CONTEXT-PERF left the log with no '
   'retention policy and one deleter (organization destroy).',
   '{organization}'::text[], 'raise_only', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. THE RESOLVED NUMBER — knob, never below the store's history floor.
-- ---------------------------------------------------------------------------
create function custom.provenance_retention_days(p_organization_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_knob  integer;
  v_floor integer;
begin
  if p_organization_id is null then
    raise exception 'custom.provenance_retention_days: which organization''s provenance?'
      using errcode = '22004',
            hint = 'Retention is an organization''s own setting. Name the organization.';
  end if;
  v_knob := coalesce(
    (platform.knob_resolve('custom', 'provenance_retention_days', p_organization_id) #>> '{}')::integer,
    30);
  -- THE ONE FLOOR, ASKED RATHER THAN COPIED. A number written here would be a second
  -- opinion about the same promise; `history.retention_floor_days` is the promise.
  v_floor := history.retention_floor_days(p_organization_id);
  return greatest(v_knob, coalesce(v_floor, 30));
end;
$function$;

-- DD-223: a SECURITY DEFINER function must say IN DATA who may call it. Neither of these
-- two is a door. They are run by the platform's own log-retention job and by an operator
-- reading a dry run; no browser role can even reach schema `custom`.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'provenance_retention_days', 'p_organization_id uuid',
   array['uuid'::regtype]::oid[],
   'Reads two knob rows for the organization named by p_organization_id and returns a number of days; it reads no row of anybody''s data and refuses a NULL organization by name.',
   'tidy_the_provenance_log_is_kept_not_hoarded.sql',
   'server_only: called by custom.provenance_prune inside public.prune_high_volume_logs, the platform''s own hourly log-retention job, and by an operator reading a dry run. No client surface asks an organization how long its provenance is kept.',
   false, false)
on conflict do nothing;

comment on function custom.provenance_retention_days(uuid) is
  'How many days custom.merge_field_provenance is kept for this organization: the '
  'custom/provenance_retention_days knob, floored by history.retention_floor_days so the '
  'explanation of a value is never dropped while the value''s own history is still kept.';

-- ---------------------------------------------------------------------------
-- 3. THE PRUNE.
-- ---------------------------------------------------------------------------
create function custom.provenance_prune(
  p_organization_id uuid default null,
  p_dry_run boolean default true,
  p_limit integer default 200000
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_count   bigint := 0;
  v_orgs    integer := 0;
begin
  with scope as (
    -- THE OFF SWITCH, PER ORGANIZATION. `custom.store_is_open` is the one predicate that
    -- reads `custom/system_enabled`; an organization whose store is closed keeps every
    -- provenance row it has until somebody turns the store back on.
    select distinct organization_id
      from custom.merge_field_provenance
     where (p_organization_id is null or organization_id = p_organization_id)
       and custom.store_is_open(organization_id)
  ),
  cutoffs as (
    select s.organization_id,
           custom.provenance_retention_days(s.organization_id) as days,
           now() - make_interval(days => custom.provenance_retention_days(s.organization_id)) as cutoff
      from scope s
  ),
  ranked as (
    -- THE LAST ROW PER ITEM IS NOT A CANDIDATE, AT ANY AGE. `merge_field_id` is null for a
    -- literal declaration, so it is coalesced into the key rather than joined on: two rows
    -- with the same key and no id are the same item, and `distinct from` in a partition
    -- would split them.
    select p.id,
           c.days,
           row_number() over (
             partition by p.organization_id, p.merge_field_key,
                          coalesce(p.merge_field_id, '00000000-0000-0000-0000-000000000000'::uuid)
             order by p.resolved_at desc, p.id desc
           ) as recency_rank
      from custom.merge_field_provenance p
      join cutoffs c on c.organization_id = p.organization_id
     where p.resolved_at < c.cutoff
  ),
  doomed as (
    select id from ranked where recency_rank > 1 limit p_limit
  ),
  gone as (
    delete from custom.merge_field_provenance
     where not p_dry_run and id in (select id from doomed)
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end,
         (select count(*) from scope)
    into v_count, v_orgs;

  return jsonb_build_object(
    'function', 'custom.provenance_prune',
    'organization_id', p_organization_id,
    'organizations_considered', v_orgs,
    'policy', 'delete rows past custom.provenance_retention_days(org); never the most recent row for a merge field, at any age',
    'dry_run', p_dry_run,
    'row_limit', p_limit,
    'rows_pruned', v_count,
    'duration_ms', extract(millisecond from (clock_timestamp() - v_started))::int,
    'at', now());
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'provenance_prune', 'p_organization_id uuid, p_dry_run boolean, p_limit integer',
   array['uuid'::regtype, 'boolean'::regtype, 'integer'::regtype]::oid[],
   'p_organization_id NULL means every organization whose store is open, which is what the retention job passes; a non-NULL value narrows to that organization and is never checked against a caller because no client caller exists.',
   'tidy_the_provenance_log_is_kept_not_hoarded.sql',
   'server_only: run by public.prune_high_volume_logs, the approved hourly job that already prunes the platform''s other high-volume logs. Retention is not something a browser asks for; the door a person uses to ask about history is custom.history_prune.',
   false, false)
on conflict do nothing;

comment on function custom.provenance_prune(uuid, boolean, integer) is
  'DYN-22 retention. Deletes merge-field provenance rows older than '
  'custom.provenance_retention_days(org), keeping the most recent row for every merge field '
  'at any age so DYN-24 can always answer "what did it resolve to last". Not a door: it is '
  'run by public.prune_high_volume_logs(), the hourly job that already prunes the platform''s '
  'other high-volume logs.';

revoke all on function custom.provenance_prune(uuid, boolean, integer) from public, anon, authenticated;
revoke all on function custom.provenance_retention_days(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE JOB THAT ALREADY RUNS NOW APPLIES IT.
--    The two existing blocks are reproduced unchanged; only the third is new.
-- ---------------------------------------------------------------------------
create or replace function public.prune_high_volume_logs()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed integer;
  verdict jsonb;
begin
  -- ops.api_request_log: keep 30 days. Bounded to 200k rows per run; hourly cron
  -- easily keeps pace with steady-state (~46k new rows/day cross the window).
  delete from ops.api_request_log
  where ctid in (
    select ctid from ops.api_request_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.api_request_log removed=%', removed;

  -- ops.app_log: keep 30 days.
  delete from ops.app_log
  where ctid in (
    select ctid from ops.app_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.app_log removed=%', removed;

  -- custom.merge_field_provenance: kept for custom.provenance_retention_days(org), which is
  -- the organization's knob floored by the store's own history floor. The most recent row
  -- for every merge field is kept at any age. THE CAMPAIGN'S OFF SWITCH IS READ HERE AND
  -- AGAIN INSIDE: while `custom/system_enabled` is false at every rung this block deletes
  -- nothing and says so, and `custom.provenance_prune` separately skips any organization
  -- whose own store is closed.
  if coalesce((platform.knob_resolve('custom', 'system_enabled', null) #>> '{}')::boolean, false)
     or exists (select 1 from platform.knob_override o
                 where o.feature = 'custom' and o.key = 'system_enabled'
                   and coalesce((o.value #>> '{}')::boolean, false))
  then
    verdict := custom.provenance_prune(null, false, 200000);
    raise log 'prune_high_volume_logs: custom.merge_field_provenance removed=% over % organization(s)',
      verdict ->> 'rows_pruned', verdict ->> 'organizations_considered';
  else
    raise log 'prune_high_volume_logs: custom.merge_field_provenance skipped — custom/system_enabled is off at every rung';
  end if;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'prune_high_volume_logs', '', array[]::oid[],
   'Takes no argument and therefore checks no entity id; it deletes only rows past their own declared retention.',
   'tidy_the_provenance_log_is_kept_not_hoarded.sql',
   'server_only: this is the body of the approved pg_cron job prune-high-volume-logs and has never had a client caller. Replacing its body re-incurs the DD-223 debt, so the decision is declared here.',
   false, false)
on conflict do nothing;
