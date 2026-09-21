-- lane: DOORS-ONLY-3
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) DOORS-ONLY closed the first twenty tables, DOORS-ONLY-2 closed
-- forty-three more and left NINE, each with real client writers and no door. This is the
-- first three of those nine.
--
-- Every write to these two schemas goes through a SECURITY DEFINER door that decides through
-- the one ladder. Reads stay exactly as they are, under RLS. The reason is not that any one
-- policy is wrong today: a base table reachable directly over REST is safe only while EVERY
-- policy on it is complete, forever, including the ones `iam.apply_rls` regenerates tomorrow.
--
-- THREE TABLES, THREE WRITE SEMANTICS, THREE DOORS. Each door decides AT LEAST as strictly as
-- the `std_*` policy it replaces -- the predicate was read out of `pg_policy` on the live
-- database and is reproduced in the body, not paraphrased -- and each one narrows the column
-- set to what the caller actually writes, which a table grant can never do.
--
--   platform.guided_checklist_run   `checklist_run_start` / `checklist_run_save`
--     The ONE writer is `lib/guided-setup/service.ts`, and it reaches the table through a
--     `function table() { return createClient().schema("platform").from(...) }` helper thirty
--     lines above the `.insert(` -- the shape DOORS-ONLY-2 recorded as the trap that a
--     `.from()`-plus-context grep misses. `checklist_run_save` carries the optimistic
--     concurrency INTO the door: the CAS on `version` is one statement in SQL instead of a
--     round trip the client can lose, and a miss returns NULL so the caller's existing
--     `guardedUpdate` re-read path is unchanged.
--
--   platform.egress_device          `egress_device_set`
--     Two updates, and between them they write exactly two columns: `enabled` and
--     `display_name`. The door takes those two and nothing else, so a browser can no longer
--     reach `token_hash`, `token_prefix`, `connection_id` or `gateway_host` on a residential
--     egress device even in principle. Every other column on that table is written by the
--     aidream server lane over its own Postgres credentials, which no `authenticated` policy
--     touches.
--
--   platform.masterwork_run         `masterwork_run_score`
--     One update, of `expert_score` and `expert_verdict` -- a human's judgement of a run.
--     Everything else about a run's lifecycle (claim, heartbeat, complete, fail, cancel) is
--     written by aidream's Python lane. So the client's door is exactly "record what the
--     expert thought", and a client can no longer set `status`, `result` or `completed_at`.
--
-- THE LADDER, PER DOOR. Read from `pg_policy` on the live database 2026-09-21:
--   guided_checklist_run  insert  created_by = auth.uid() AND has_org_access(organization_id)
--                         update  created_by = auth.uid() OR has_access(token, id, 'editor')
--                                 (or platform admin at visibility >= internal)
--   egress_device         update  created_by = auth.uid() OR has_access(token, id, 'editor')
--   masterwork_run        update  platform admin, OR editor on the parent rulebook, OR
--                                 has_access('masterwork_run', id, 'editor')
-- Each door asks the same question with the same functions. `created_by` is stamped from
-- `auth.uid()` inside the door, never taken from the caller, so nobody can author a row in
-- somebody else's name -- which the base-table INSERT grant allowed as long as the WITH CHECK
-- was the only thing looking.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked here. The refusal policies are a separate
-- file per table; the dead GRANTs that remain afterwards are a chair step, because `platform`
-- and `iam` are REVOKE-protected schemas (scripts/lib/migration-target.ts).
-- Inverse: migrations/inverse/doorsonly3_batch_a_three_doors_for_three_tables.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, and the seated suite
--        scripts/campaign-tests/doorsonly3_batch_a_green.sql.

set local lock_timeout = '2s';

-- ── platform.guided_checklist_run ──────────────────────────────────────────────

create or replace function public.checklist_run_start(
  p_organization_id uuid,
  p_checklist_key text,
  p_target_key text default ''
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_target text := coalesce(p_target_key, '');
  v_row platform.guided_checklist_run;
begin
  if v_actor is null then
    raise exception 'checklist_run_start: a guided checklist belongs to the person doing it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_organization_id is null or coalesce(btrim(p_checklist_key), '') = '' then
    raise exception 'checklist_run_start: name the organization and the checklist.'
      using errcode = '22004';
  end if;
  -- THE LADDER. Same question `std_insert` asked: this person may act in this organization.
  if not iam.has_org_access(p_organization_id) then
    raise exception 'checklist_run_start: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  -- A run is per (checklist, target, organization). The client's loadOrCreateRun already
  -- races two tabs and re-reads; doing the read INSIDE the door makes the race impossible
  -- instead of recoverable.
  select * into v_row
    from platform.guided_checklist_run r
   where r.checklist_key = p_checklist_key
     and r.target_key = v_target
     and r.organization_id = p_organization_id
     and r.deleted_at is null
   limit 1;

  if not found then
    insert into platform.guided_checklist_run
      (checklist_key, target_key, organization_id, state, created_by)
    values (p_checklist_key, v_target, p_organization_id, '{}'::jsonb, v_actor)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id, 'checklist_key', v_row.checklist_key, 'target_key', v_row.target_key,
    'organization_id', v_row.organization_id, 'state', v_row.state,
    'completed_at', v_row.completed_at, 'dismissed_at', v_row.dismissed_at,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'version', v_row.version);
end;
$fn$;

comment on function public.checklist_run_start(uuid, text, text) is
  'DOORS-ONLY-3: the door onto platform.guided_checklist_run for starting a run. Decides on the one ladder (iam.has_org_access), stamps created_by from auth.uid() so nobody starts a checklist in somebody else`s name, and returns the existing live run when there is one -- which makes the two-tab race impossible rather than recoverable. The base table stops being client-writable in doorsonly3_platform_guided_checklist_run_is_never_client_written.sql.';

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
         version = p_expected_version + 1,
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

comment on function public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamptz, boolean, timestamptz) is
  'DOORS-ONLY-3: the door onto platform.guided_checklist_run for saving one. It carries the optimistic-concurrency CAS on `version` INTO the database -- one statement instead of a round trip the client can lose -- and returns NULL on a miss so the caller re-reads and replays. The ladder is the exact predicate std_update carried: created_by, or editor on the run, or a platform admin at visibility >= internal. A run in another organization reads as absent.';

-- ── platform.egress_device ─────────────────────────────────────────────────────

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
          or iam.has_access('egress_device', v_row.id, 'editor'::permission_level)) then
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

comment on function public.egress_device_set(uuid, boolean, text) is
  'DOORS-ONLY-3: the door onto platform.egress_device. It writes exactly two columns, `enabled` and `display_name` -- the only two a browser ever wrote -- so a client can no longer reach token_hash, token_prefix, connection_id, gateway_host or gateway_port on a residential egress device even in principle. Every other column belongs to aidream`s server lane. The ladder is the predicate std_update carried: created_by, or editor on the device.';

-- ── platform.masterwork_run ────────────────────────────────────────────────────

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
                 iam.accessible_entity_ids('rulebook', 'editor'::permission_level)))
          or iam.has_access('masterwork_run', v_row.id, 'editor'::permission_level)) then
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

comment on function public.masterwork_run_score(uuid, numeric, text) is
  'DOORS-ONLY-3: the door onto platform.masterwork_run for the one thing a client writes -- a human expert`s score and verdict on a run. status, result, error, completed_at and the heartbeat belong to the run`s lifecycle in aidream and this door cannot write them. The ladder is the predicate std_update carried: platform admin, or editor on the parent rulebook, or editor on the run.';

-- ── the register, in the same transaction ──────────────────────────────────────
-- A SECURITY DEFINER function reaching COMMIT without a platform.client_callable_door row is
-- refused by the `provision_shape_guard` event trigger (23514).

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/doorsonly3_batch_a_three_doors_for_three_tables.sql (lane DOORS-ONLY-3)',
       case p.proname
         when 'checklist_run_start' then
           'p_organization_id is put to iam.has_org_access on entry and NULL is refused, so a caller can only start a run in an organization they may act in. p_checklist_key and p_target_key are stored as given and name nothing outside this table. created_by is stamped from auth.uid() inside the door, never taken from the caller. It writes at most ONE platform.guided_checklist_run row, in the caller''s own organization, and returns that row.'
         when 'checklist_run_save' then
           'p_run_id is resolved together with p_organization_id, so a run in another organization reads as absent rather than as refused. The ladder is then the exact predicate std_update carried -- created_by, editor on the run, or a platform admin at visibility >= internal. p_state must be a JSON object. p_expected_version is a CAS: a miss returns NULL and writes nothing. It writes state, version, updated_by and, only when explicitly asked, completed_at / dismissed_at; no other column is reachable.'
         when 'egress_device_set' then
           'p_device_id is resolved first and an absent or soft-deleted device is refused by name. The ladder is the predicate std_update carried: created_by, or editor on the device. It writes exactly two columns, enabled and display_name -- the only two a browser ever wrote -- so token_hash, token_prefix, connection_id, gateway_host and gateway_port are unreachable from a client by construction.'
         else
           'p_run_id is resolved first and an absent or soft-deleted run is refused by name. The ladder is the predicate std_update carried: platform admin, editor on the parent rulebook, or editor on the run. It writes exactly expert_score, expert_verdict and updated_by -- a human''s judgement -- and cannot write status, result, error, completed_at or the heartbeat, which belong to the run''s lifecycle in aidream.'
       end
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('checklist_run_start', 'checklist_run_save',
                     'egress_device_set', 'masterwork_run_score')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select platform.reopen_declared_doors('public');
