-- LANE FINAL-SWITCH — THE GREEN SUITE. One platform press switches every organization at once;
-- one undo reverses exactly that run; only a platform administrator, signed in, from a page, in the
-- admin lane, may press; the press refuses — naming organization and difference — while anything is
-- not ready; while it is on, no organization switches on its own and nothing new is born older; the
-- older write doors leave the browser's reach and come back with the undo.
--
-- THE REAL USE CASE: Arman has validated the new tables and says "switch everything". The platform
-- admin (admin@admin.com, in the admin section) opens Administration → Database → Final switch. It
-- names what blocks (older pick lists that belong to no organization; the scope screens switch that
-- has no code yet). Once those are fixed he presses: every organization's Data tables and agent
-- context switch in one transaction. An owner who tries Switch back on one organization is told the
-- organizations go back together. He undoes it: everything is exactly as before.
--
-- RUN IT (clone, after scripts/final_switch_rehearsal/run.sh has copied every organization again):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/finalswitch_green.sql
-- Everything is rolled back. The two stand-ins the press needs on the clone (the orphan lists
-- archived, a do-nothing scopes step) are made INSIDE the rolled-back transaction.
--
-- ITS RED: before the migration (or after its inverse) it fails at 0a — there is no final switch.
-- 6a is its own red: without the log trigger a per-organization Switch back is taken while the final
-- switch is on.

\set ON_ERROR_STOP on
\timing off

\set suite 'finalswitch_green.sql'
\set requires 'grant:authenticated:platform.cutover_seams|grant:authenticated:platform.cutover_seam_press'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '15min';
set local lock_timeout = '30s';

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com (platform admin)
  c_tech     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com (not an admin)
  c_ws       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace (admin owns it)
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"finalswitch-green-0001"}';
  c_tech_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated","session_id":"finalswitch-green-0002"}';
  c_minted_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_admin_page constant text := '{"origin":"http://final-switch.localhost:3001","x-matrx-admin-lane":"1"}';
  c_user_page  constant text := '{"origin":"http://final-switch.localhost:3001"}';
  v jsonb;
  v_ready jsonb;
  v_press jsonb;
  v_n int;
  v_refused_before int;
  v_org uuid;
begin
  -- 0. The doors exist, and nothing private is reachable.
  if to_regprocedure('platform.final_switch_press(text, jsonb)') is null
     or to_regprocedure('platform.final_switch_undo(text, boolean)') is null
     or to_regprocedure('platform.final_switch_readiness()') is null then
    raise exception '0a: there is no final switch (press, undo or readiness door missing)';
  end if;
  if has_function_privilege('authenticated', 'platform._final_switch_readiness()', 'execute')
     or has_function_privilege('authenticated', 'platform._final_switch_record(text, text, text, text, jsonb, jsonb, text, uuid)', 'execute')
     or has_function_privilege('anon', 'platform.final_switch_press(text, jsonb)', 'execute') then
    raise exception '0b: a client can reach a private step of the final switch, or a signed-out visitor can press';
  end if;
  if coalesce((platform._final_switch_last()).direction, 'old') <> 'old' then
    raise exception '0c: the clone is already switched (final switch on); undo it before this suite';
  end if;

  -- 1. Reading: a platform admin in the admin lane reads every organization; nobody else does.
  perform set_config('request.jwt.claims', c_tech_j, true);
  perform set_config('request.headers', c_admin_page, true);
  perform set_config('role', 'authenticated', true);
  v := platform.final_switch_readiness();
  if (v ->> 'ok')::boolean or v ->> 'reason' <> 'not_a_platform_admin' then raise exception '1a: a non-admin read the final switch: %', left(v::text, 300); end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', c_user_page, true);
  v := platform.final_switch_readiness();
  if (v ->> 'ok')::boolean then raise exception '1b: an admin outside the admin lane read the final switch'; end if;
  perform set_config('request.headers', c_admin_page, true);
  v_ready := platform.final_switch_readiness();
  if not (v_ready ->> 'ok')::boolean or jsonb_array_length(v_ready -> 'organizations') = 0 then
    raise exception '1c: the platform admin cannot read every organization: %', left(v_ready::text, 300);
  end if;

  -- 2. Pressing: only a person at a page in the admin lane. Each person refusal is recorded.
  perform set_config('role', 'postgres', true);  -- read the internals as the owner
  select count(*) into v_refused_before from platform.cutover_seam_press where seam_key = 'final_switch' and outcome = 'refused';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_minted_j, true);
  v := platform.final_switch_press('suite', null);
  if v ->> 'reason' <> 'not_a_person' then raise exception '2a: a minted token pressed: %', v; end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', '{}', true);
  v := platform.final_switch_press('suite', null);
  if v ->> 'reason' <> 'not_from_the_screen' then raise exception '2b: a press without a page was taken: %', v; end if;
  perform set_config('request.jwt.claims', c_tech_j, true);
  perform set_config('request.headers', c_admin_page, true);
  v := platform.final_switch_press('suite', null);
  if v ->> 'reason' <> 'not_a_platform_admin' then raise exception '2c: a non-admin pressed: %', v; end if;
  perform set_config('role', 'postgres', true);  -- read the internals as the owner
  if (select count(*) from platform.cutover_seam_press where seam_key = 'final_switch' and outcome = 'refused') < v_refused_before + 3 then
    raise exception '2d: a refused press was not recorded';
  end if;

  -- 3. Not ready: the press refuses and names what blocks it (organization or platform + what).
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from workbench.udt_structured_lists where organization_id is null and deleted_at is null)
     or platform._final_switch_scopes_code() = 'none' then
    perform set_config('role', 'authenticated', true);
    v := platform.final_switch_press('suite', null);
    perform set_config('role', 'postgres', true);
    if v ->> 'reason' <> 'not_ready' then raise exception '3a: a press that is not ready was taken: %', left(v::text, 400); end if;
    if position('scope and context screens switch has no code yet' in coalesce(v ->> 'says', '')) = 0
       and platform._final_switch_scopes_code() = 'none' then
      raise exception '3b: the refusal does not say the scopes seam has no code: %', v ->> 'says';
    end if;
    if (platform._final_switch_last()).id is not null and (platform._final_switch_last()).direction = 'new' then
      raise exception '3c: a refused press switched something';
    end if;
  end if;

  -- 4. Stand-ins for the owners' fixes (rolled back with the suite).
  perform set_config('role', 'postgres', true);
  update workbench.udt_structured_lists set deleted_at = now() where organization_id is null and deleted_at is null;
  if platform._final_switch_scopes_code() = 'none' then
    execute $f$create or replace function platform._final_switch_scopes_rehearsal_stand_in() returns text
              language sql set search_path to 'pg_catalog' as $b$ select 'suite stand-in'::text $b$$f$;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', c_admin_page, true);
  v_ready := platform.final_switch_readiness();
  if not (v_ready ->> 'ready')::boolean then
    raise notice 'SKIPPED 5–8: after the stand-ins the clone still is not ready (%). Run scripts/final_switch_rehearsal/run.sh (it copies every organization again), then this suite.', left(v_ready ->> 'says', 300);
    return;
  end if;

  -- 5. THE PRESS: every organization, one record.
  v_press := platform.final_switch_press('finalswitch_green suite', null);
  if not coalesce((v_press ->> 'ok')::boolean, false) then raise exception '5a: the press refused: %', left(v_press::text, 600); end if;
  perform set_config('role', 'postgres', true);
  if platform.final_switch_state() ->> 'state' <> 'new' or platform.final_switch_state() ->> 'data_screen' <> 'new' then
    raise exception '5b: the state does not say everything is on the new system: %', platform.final_switch_state();
  end if;
  select count(*) into v_n from jsonb_array_elements(v_ready -> 'organizations') o
   where (o -> 'plan' ->> 'press_tables')::boolean
     and coalesce((platform._cutover_seam_last_done('older_tables', (o ->> 'id')::uuid)).direction, 'old') <> 'new';
  if v_n > 0 then raise exception '5c: % organizations planned for Data tables are not switched', v_n; end if;
  if exists (select 1 from workbench.udt_datasets d where d.deleted_at is null and d.organization_id is not null) then
    raise exception '5d: live older tables remain after the final switch';
  end if;
  if has_function_privilege('authenticated', 'public.udt_bulk_write(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.append_rows_to_user_table(uuid, jsonb)', 'execute') then
    raise exception '5e: an older write door is still in the browser''s reach';
  end if;
  if not has_function_privilege('service_role', 'public.udt_bulk_write(uuid, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_full_table(jsonb)', 'execute') then
    raise exception '5f: the server lost a write door, or a read door was closed at the press';
  end if;
  if (select d.signed_in_callers from platform.client_callable_door d
       where d.schema_name = 'public' and d.function_name = 'udt_bulk_write') then
    raise exception '5g: the door registry still opens udt_bulk_write to signed-in callers';
  end if;
  if (select value from platform.feature_knob where feature = 'data_tables' and key = 'older_tables_moved') <> 'true'::jsonb then
    raise exception '5h: new organizations are not born on the new side';
  end if;

  -- 6. While it is on: no organization switches on its own, nothing new is born older anywhere.
  perform set_config('role', 'authenticated', true);
  begin
    v := platform.cutover_seam_press('older_tables', c_ws, 'old', 'suite');
    if coalesce((v ->> 'ok')::boolean, false) then raise exception '6a: one organization switched back on its own: %', v; end if;
    raise exception '6a: the per-organization press answered % instead of being held by the final switch', v ->> 'reason';
  exception when sqlstate '55000' then
    null;  -- held: "Every organization switched to the new system together with the final switch …"
  end;
  perform set_config('role', 'postgres', true);
  select o.id into v_org from iam.organizations o
   where not exists (select 1 from platform.cutover_seam_press p where p.organization_id = o.id and p.seam_key = 'older_tables')
   limit 1;
  if not platform.older_tables_switched(v_org) then raise exception '6c: an organization with no press is not switched while the final switch is on'; end if;

  -- 7. THE UNDO: exactly that run, backwards.
  perform set_config('role', 'authenticated', true);
  v := platform.final_switch_undo('finalswitch_green suite', true);
  perform set_config('role', 'postgres', true);
  if not coalesce((v ->> 'ok')::boolean, false) then raise exception '7a: the undo refused: %', left(v::text, 600); end if;
  if platform.final_switch_state() ->> 'state' <> 'old' or platform.final_switch_state() ->> 'data_screen' <> 'old' then
    raise exception '7b: the state did not go back: %', platform.final_switch_state();
  end if;
  if not has_function_privilege('authenticated', 'public.udt_bulk_write(uuid, jsonb)', 'execute')
     or not (select d.signed_in_callers from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'udt_bulk_write') then
    raise exception '7c: an older write door did not come back as it was';
  end if;
  if has_function_privilege('authenticated', 'public.append_rows_to_user_table(uuid, jsonb)', 'execute') is distinct from true
     or exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'append_rows_to_user_table') then
    raise exception '7d: an older door without a registry row did not come back exactly (grant back, the press''s row gone)';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_ready -> 'organizations') o
   where (o -> 'plan' ->> 'press_tables')::boolean
     and coalesce((platform._cutover_seam_last_done('older_tables', (o ->> 'id')::uuid)).direction, 'old') <> 'old';
  if v_n > 0 then raise exception '7e: % organizations are still switched after the undo', v_n; end if;
  if (select value from platform.feature_knob where feature = 'data_tables' and key = 'older_tables_moved') <> 'false'::jsonb then
    raise exception '7f: the platform value did not go back';
  end if;
  if platform.older_tables_switched(v_org) then raise exception '7g: an organization with no press still counts as switched after the undo'; end if;

  -- 8. Undo again: nothing to undo.
  perform set_config('role', 'authenticated', true);
  v := platform.final_switch_undo('suite', true);
  if v ->> 'reason' <> 'nothing_to_undo' then raise exception '8a: a second undo did something: %', v; end if;

  raise notice 'GREEN finalswitch_green.sql — refused for a minted token, no page, a non-admin, not ready (named); pressed every organization (% in the plan), closed the older write doors, kept the read doors and the server; one organization could not switch alone; undone exactly.',
    jsonb_array_length(v_ready -> 'organizations');
end $t$;

rollback;
