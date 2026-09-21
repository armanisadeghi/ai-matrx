-- lane: DOORS-ONLY-3
-- based-on: public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamp with time zone, boolean, timestamp with time zone) 38751de8bfd051c443e25594a9ae9a6d9a7331c59209c2fd78e0d0751637f922
-- `public.checklist_run_save` set `version` itself, and the `_touch_row` BEFORE UPDATE trigger
-- on every platform table overwrites it: `NEW.version := OLD.version + 1`, unconditionally.
-- So the door's own arithmetic was dead code -- harmless here because both expressions produce
-- the same number, but it is a second author of the same column and the trigger is the one
-- that wins. Caught by the seated probe
-- (scripts/access-matrix/check-guided-checklist-run.ts) asserting the returned version, not by
-- reading the body.
--
-- THE CAS IS UNCHANGED and is the only thing that matters: the UPDATE still carries
-- `and r.version = p_expected_version`, so a stale caller still writes nothing and still gets
-- NULL back. What changes is that `version` now has exactly ONE author on this table, the same
-- one every other platform table has.
--
-- ADDITIVE: one CREATE OR REPLACE of a function this lane created twenty minutes ago.
-- Inverse: migrations/inverse/doorsonly3_the_trigger_owns_the_version.inverse.sql
-- Guard: scripts/access-matrix/check-guided-checklist-run.ts -- "saving through
--        public.checklist_run_save advances the version by exactly one".

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
           or iam.has_access('guided_checklist_run', v_row.id, 'editor'::permission_level)
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
