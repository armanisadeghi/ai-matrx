-- lane: DOORS-ONLY-3
-- based-on: public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamp with time zone, boolean, timestamp with time zone) 7f8ccb1ed2f6feca6917067bfd5b14fbfb6a88b222070ff702ecebb5db404f86
-- based-on: public.masterwork_run_score(uuid, numeric, text) a2a4e184b3abea01a26279666c3a5670b6a808ee3d962adc41f5117b87558905
-- THE SAME CLASS, ONE LAYER DOWN: `is_platform_admin()` lives in `public` too.
--
-- The previous file qualified the TYPE (`public.permission_level`) in three doors pinned to
-- `search_path = pg_catalog`. The very next call from a real seat answered
-- `404 function is_platform_admin() does not exist` -- because plpgsql resolves a FUNCTION name
-- lazily as well, so the second unqualified reference was sitting behind the first one the
-- whole time and no static check in either repo can see either of them.
--
-- THE RULE THIS LANE IS NOW WRITTEN TO, and the one the census below enforces: in a door with a
-- pinned `search_path`, EVERY name that is not in `pg_catalog` is schema-qualified -- types,
-- functions, operators' operand types, tables. `iam.has_access`, `iam.has_org_access`,
-- `iam.accessible_entity_ids`, `iam.unnest_uuids`, `auth.uid()`, `platform.visibility` and the
-- tables were already written that way; `permission_level` and `is_platform_admin` were the two
-- that were not, and both are in `public`.
--
-- CENSUS OF THE SIBLINGS: `public.is_platform_admin()` appears in exactly two of this lane's
-- doors -- `checklist_run_save` and `masterwork_run_score` -- and both are here.
-- `egress_device_set` and `checklist_run_start` do not call it.
--
-- ADDITIVE: two CREATE OR REPLACE of functions this lane created minutes ago.
-- Inverse: migrations/inverse/doorsonly3_the_doors_qualify_their_functions.inverse.sql
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
           or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin());
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
  if not (public.is_platform_admin()
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
