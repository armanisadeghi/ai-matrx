-- lane: DOORS-ONLY-3
-- based-on: public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamp with time zone, boolean, timestamp with time zone) b4daa4405413a354a1a9eea3669b0193af3753eef9e6bcee1f1e6de74ae3fa48
-- based-on: public.egress_device_set(uuid, boolean, text) 2983c2777464d5ee15f273c3cbe27a0ea1e7f4075cedcce06bcc562ce2212423
-- based-on: public.masterwork_run_score(uuid, numeric, text) 243391651d3089a3efdcb4a0319723888ff963cc2307806800c53094cce2556d
-- 🚨 A DOOR WITH `search_path = pg_catalog` CANNOT NAME A TYPE THAT LIVES IN `public`, AND
-- plpgsql ONLY FINDS OUT WHEN SOMEBODY CALLS IT.
--
-- Three of batch A's doors cast to `'editor'::permission_level`. That enum is in `public`, the
-- bodies pin `search_path` to `pg_catalog` (which is right -- a SECURITY DEFINER function that
-- inherits the caller's search_path is the classic definer hijack), and plpgsql resolves a type
-- name LAZILY, at first execution. So every one of them compiled, applied, ledgered and passed
-- every static check, and then answered `400 type "permission_level" does not exist` the first
-- time a real signed-in caller used it.
--
-- It was caught by the seated probe calling the door over PostgREST under a real user's JWT --
-- not by reading the body, not by the migration runner, and not by any type check. That is the
-- whole argument for proving a door from the seat before the refusal policy lands beside it:
-- had these three gone out unexercised, the residential-egress toggles, the Masterwork expert
-- score and the guided checklist would each have had NO working write path at all.
--
-- THE FIX IS THE SCHEMA-QUALIFIED TYPE, `public.permission_level`, in all three. The
-- `search_path` pin is unchanged, deliberately. The ladder, the column sets and the CAS are
-- byte-identical otherwise.
--
-- SIBLINGS: every other door this lane ships is written with schema-qualified type names from
-- the start, and `scripts/campaign-tests/doorsonly3_doors_answer_from_the_seat.sql` calls every
-- one of them as a signed-in caller so a lazily-resolved name can never ship unexercised again.
--
-- ADDITIVE: three CREATE OR REPLACE of functions this lane created minutes ago.
-- Inverse: migrations/inverse/doorsonly3_the_doors_qualify_their_types.inverse.sql
-- Guard: scripts/access-matrix/check-guided-checklist-run.ts (green end to end).

create or replace function public.checklist_run_save(
  p_organization_id uuid,
  p_run_id uuid,
  p_state jsonb,
  p_expected_version integer,
  p_set_completed boolean default false,
  p_completed_at timestamptz default null,
  p_set_dismissed boolean default false,
  p_dismissed_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.guided_checklist_run;
  v_may boolean;
begin
  if v_actor is null then
    raise exception 'checklist_run_save: nobody is signed in.' using errcode = '42501';
  end if;
  if p_run_id is null or p_organization_id is null or p_expected_version is null then
    raise exception 'checklist_run_save: name the run, its organization and the version you read.'
      using errcode = '22004';
  end if;
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'checklist_run_save: the state of a checklist is an object.'
      using errcode = '22023';
  end if;

  select * into v_row
    from platform.guided_checklist_run r
   where r.id = p_run_id and r.organization_id = p_organization_id and r.deleted_at is null;
  if not found then
    -- A run that is not here, or is in another organization, reads as absent: organizations
    -- are hard walls, and a door never tells a caller that somebody else`s row exists.
    return null;
  end if;

  -- THE LADDER. The predicate `std_update` carried, asked with the same functions.
  v_may := (v_row.created_by = v_actor)
           or iam.has_access('guided_checklist_run', v_row.id, 'editor'::public.permission_level)
           or (v_row.visibility >= 'internal'::platform.visibility and is_platform_admin());
  if not v_may then
    raise exception 'checklist_run_save: this run is not yours to change.' using errcode = '42501';
  end if;

  update platform.guided_checklist_run r
     set state = p_state,
         completed_at = case when p_set_completed then p_completed_at else r.completed_at end,
         dismissed_at = case when p_set_dismissed then p_dismissed_at else r.dismissed_at end,
         updated_by = v_actor
   where r.id = p_run_id
     and r.organization_id = p_organization_id
     and r.version = p_expected_version
     and r.deleted_at is null
  returning * into v_row;

  -- A version miss is NULL, not an error: the caller re-reads and replays, exactly as the
  -- client`s guardedUpdate already does.
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id, 'checklist_key', v_row.checklist_key, 'target_key', v_row.target_key,
    'organization_id', v_row.organization_id, 'state', v_row.state,
    'completed_at', v_row.completed_at, 'dismissed_at', v_row.dismissed_at,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'version', v_row.version);
end;
$fn$;

create or replace function public.egress_device_set(
  p_device_id uuid,
  p_enabled boolean default null,
  p_display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.egress_device;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_actor is null then
    raise exception 'egress_device_set: nobody is signed in.' using errcode = '42501';
  end if;
  if p_device_id is null then
    raise exception 'egress_device_set: name the device.' using errcode = '22004';
  end if;
  if p_enabled is null and v_name is null then
    raise exception 'egress_device_set: nothing to change -- pass an enabled flag, a display name, or both.'
      using errcode = '22004';
  end if;

  select * into v_row from platform.egress_device d
   where d.id = p_device_id and d.deleted_at is null;
  if not found then
    raise exception 'egress_device_set: there is no such device here.' using errcode = '23503';
  end if;

  -- THE LADDER. The predicate `std_update` carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('egress_device', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'egress_device_set: this device is not yours to change.' using errcode = '42501';
  end if;

  -- TWO COLUMNS, AND THAT IS THE POINT. `token_hash`, `token_prefix`, `connection_id`,
  -- `gateway_host` and `gateway_port` belong to the server lane; a table grant could not
  -- say so, and this door says it by construction.
  update platform.egress_device d
     set enabled = coalesce(p_enabled, d.enabled),
         display_name = coalesce(v_name, d.display_name),
         updated_by = v_actor
   where d.id = p_device_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'enabled', v_row.enabled,
                            'display_name', v_row.display_name, 'version', v_row.version);
end;
$fn$;

create or replace function public.masterwork_run_score(
  p_run_id uuid,
  p_expert_score numeric,
  p_expert_verdict text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.masterwork_run;
begin
  if v_actor is null then
    raise exception 'masterwork_run_score: nobody is signed in.' using errcode = '42501';
  end if;
  if p_run_id is null then
    raise exception 'masterwork_run_score: name the run.' using errcode = '22004';
  end if;

  select * into v_row from platform.masterwork_run r
   where r.id = p_run_id and r.deleted_at is null;
  if not found then
    raise exception 'masterwork_run_score: there is no such run here.' using errcode = '23503';
  end if;

  -- THE LADDER. The predicate `std_update` carried: platform admin, OR editor on the parent
  -- rulebook, OR editor on the run itself.
  if not (is_platform_admin()
          or v_row.rulebook_id in (
               select iam.unnest_uuids(
                 iam.accessible_entity_ids('rulebook', 'editor'::public.permission_level)))
          or iam.has_access('masterwork_run', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'masterwork_run_score: this run is not yours to score.' using errcode = '42501';
  end if;

  -- AN EXPERT`S JUDGEMENT, AND NOTHING ELSE. `status`, `result`, `error`, `completed_at` and
  -- the heartbeat belong to the run`s own lifecycle in aidream; this door cannot write them.
  update platform.masterwork_run r
     set expert_score = p_expert_score,
         expert_verdict = nullif(btrim(coalesce(p_expert_verdict, '')), ''),
         updated_by = v_actor
   where r.id = p_run_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'expert_score', v_row.expert_score,
                            'expert_verdict', v_row.expert_verdict, 'version', v_row.version);
end;
$fn$;
