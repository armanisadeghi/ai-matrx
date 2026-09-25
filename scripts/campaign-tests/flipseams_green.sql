-- LANE FLIP-SEAMS — THE GREEN SUITE. Every switch from an old system to a new one is ONE owner
-- press through ONE door, read through ONE door, recorded with who and when, reversible, and
-- refused when the seam is not ready or when the caller is not a person at a screen.
--
-- THE REAL USE CASE: admin@admin.com owns "admin's Workspace", whose scopes (15 scope types, 7
-- scopes, 20 context fields) and older data tables were copied into the record store. Before its
-- agents read context from the copy, the owner opens the organization's settings page, sees the
-- "Where agents get their context" switch is ready, presses it, checks an agent, and presses it
-- back. The same afternoon he tries the "Data tables" switch for Arman's Org, where 1 of its older
-- tables is copied: the switch refuses and says what is missing. test@test.com, a member, cannot
-- press anything. A server key, a database connection and a request without a page cannot press.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/flipseams_green.sql
--   add `-v keep=1` to COMMIT the agent-context flip and unflip (the older-tables part is always
--   rolled back inside the suite: it unarchives admin's Workspace's moved tables to stage itself).
--
-- ITS RED: before the migration it fails at 0a (the two doors do not exist); after the inverse,
-- the same.

\set ON_ERROR_STOP on
\timing off

\set suite 'flipseams_green.sql'
\set requires 'grant:authenticated:platform.cutover_seams|grant:authenticated:platform.cutover_seam_press'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?keep}
\else
\set keep 0
\endif

begin;

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_tech     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_ws       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_arman    constant uuid := '3e790542-fdaf-40b2-8bf3-658bf94fe67f';   -- Arman's Org (read only here)
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-flipseams001"}';
  c_tech_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-flipseams002"}';
  c_minted_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_service  constant text := '{"role":"service_role"}';
  c_page     constant text := '{"origin":"http://flip-seams.localhost:3001"}';
  v jsonb;
  v2 jsonb;
  v_n integer;
  v_moved uuid[];
  v_archived uuid[];
  v_before jsonb;
begin
  if to_regprocedure('platform.cutover_seams(uuid)') is null
     or to_regprocedure('platform.cutover_seam_press(text, uuid, text, text)') is null then
    raise exception '0a: there is no one door to read the switches or to press one';
  end if;
  if has_function_privilege('authenticated', 'platform._cutover_seam_apply(text, uuid, text, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'platform.cutover_seam_press(text, uuid, text, text)', 'execute') then
    raise exception '0b: a client can reach the private switch step, or a signed-out visitor can press';
  end if;

  -- ── the seat ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', c_page, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0c: the suite did not take the seat'; end if;

  -- 1. Reading: every seam, default OLD, readiness measured, admin may press.
  v := platform.cutover_seams(c_ws);
  if not (v ->> 'ok')::boolean or not (v ->> 'may_press')::boolean then raise exception '1a: the owner cannot read or press: %', v; end if;
  if (select count(*) from jsonb_array_elements(v -> 'seams') s where s ->> 'key' in ('older_tables','agent_context') and s ->> 'state' = 'old') <> 2 then
    raise exception '1b: a per-organization seam is not OLD by default: %', v -> 'seams';
  end if;
  if not (select (s -> 'readiness' ->> 'ready')::boolean from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'agent_context') then
    raise exception '1c: agent context is not ready for admin''s Workspace: %', v -> 'seams' -> 1;
  end if;

  -- 2. A member reads but may not press.
  perform set_config('request.jwt.claims', c_tech_j, true);
  v := platform.cutover_seams(c_ws);
  if not (v ->> 'ok')::boolean or (v ->> 'may_press')::boolean then raise exception '2a: the member''s read is wrong: %', v ->> 'may_press_detail'; end if;
  v := platform.cutover_seam_press('agent_context', c_ws, 'new', 'member tries');
  if v ->> 'reason' <> 'not_an_owner' then raise exception '2b: a member pressed or was refused for the wrong reason: %', v; end if;

  -- 3. Not a person at a screen: a minted token without a session, the server's key, no page.
  perform set_config('request.jwt.claims', c_minted_j, true);
  v := platform.cutover_seam_press('agent_context', c_ws, 'new', null);
  if v ->> 'reason' <> 'not_a_person' then raise exception '3a: a token without a sign-in session pressed: %', v; end if;
  perform set_config('request.jwt.claims', c_service, true);
  v := platform.cutover_seam_press('agent_context', c_ws, 'new', null);
  if v ->> 'reason' <> 'not_a_person' then raise exception '3b: the server key pressed: %', v; end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', '{}', true);
  v := platform.cutover_seam_press('agent_context', c_ws, 'new', null);
  if v ->> 'reason' <> 'not_from_the_screen' then raise exception '3c: a request with no page pressed: %', v; end if;
  perform set_config('request.headers', c_page, true);

  -- 4. Readiness refuses an unready seam: Arman's Org's older tables are mostly not copied.
  v := platform.cutover_seam_press('older_tables', c_arman, 'new', 'try an unready seam');
  if v ->> 'reason' <> 'not_ready' or v ->> 'says' !~ 'tables copied' then raise exception '4a: an unready seam was not refused by name: %', v; end if;
  v := platform.cutover_seams(c_arman);
  if (select (s ->> 'may_flip')::boolean from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables') then
    raise exception '4b: the read door offers a flip on an unready seam';
  end if;
  if (select s -> 'last_press' ->> 'refusal' from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables') <> 'not_ready' then
    raise exception '4c: the refusal was not recorded';
  end if;

  -- 5. A platform-wide seam is never pressed from an organization.
  v := platform.cutover_seam_press('scopes_screens', c_ws, 'new', null);
  if v ->> 'reason' <> 'not_pressed_here' then raise exception '5a: a platform-wide switch was pressed from one organization: %', v; end if;

  -- 6. The knob behind a seam has ONE writer: the settings door refuses it by name.
  v := platform.knob_override_set('custom', 'agent_context_reads_the_copy', 'organization', c_ws, c_ws, 'true'::jsonb, 'behind the switch');
  if v ->> 'reason' <> 'wrong_door' or v ->> 'set_door' <> 'platform.cutover_seam_press' then raise exception '6a: the seam knob can be set around the switch: %', v; end if;
  v := platform.knob_write_door_for('custom.agent_context_reads_the_copy', c_ws);
  if (v ->> 'may_write')::boolean then raise exception '6b: the settings page would offer a control for the seam knob'; end if;

  -- 7. FLIP agent context for admin's Workspace; the knob answers on; a second press says so.
  v := platform.cutover_seam_press('agent_context', c_ws, 'new', 'the owner compares agents on the copy');
  if not (v ->> 'ok')::boolean then raise exception '7a: the owner''s press failed: %', v; end if;
  if platform.knob_resolve('custom', 'agent_context_reads_the_copy', c_ws) <> 'true'::jsonb then raise exception '7b: agents still read the old path after the flip'; end if;
  v2 := platform.cutover_seam_press('agent_context', c_ws, 'new', null);
  if v2 ->> 'reason' <> 'already_there' then raise exception '7c: a second flip was not refused: %', v2; end if;
  v := platform.cutover_seams(c_ws);
  if (select s ->> 'state' from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'agent_context') <> 'new'
     or (select s -> 'switched' ->> 'by' from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'agent_context') is null
     or not (select (s ->> 'may_reverse')::boolean from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'agent_context') then
    raise exception '7d: the read door does not say who switched it or offer the reversal';
  end if;

  -- 8. UNFLIP: back to the old path, the setting as it was.
  v := platform.cutover_seam_press('agent_context', c_ws, 'old', 'back to the current system');
  if not (v ->> 'ok')::boolean then raise exception '8a: the reversal failed: %', v; end if;
  if platform.knob_resolve('custom', 'agent_context_reads_the_copy', c_ws) <> 'false'::jsonb then raise exception '8b: agents still read the copy after the reversal'; end if;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from platform.knob_override where feature = 'custom' and key = 'agent_context_reads_the_copy' and organization_id = c_ws) then
    raise exception '8c: the reversal left a setting behind that was not there before';
  end if;

  -- 9. The log is append-only and says who.
  select count(*) into v_n from platform.cutover_seam_press where organization_id = c_ws and seam_key = 'agent_context' and outcome = 'done' and pressed_by = c_admin;
  if v_n < 2 then raise exception '9a: the two presses are not recorded with the person'; end if;
  begin
    update platform.cutover_seam_press set says = 'edited' where organization_id = c_ws;
    raise exception '9b: a press row could be edited';
  exception when insufficient_privilege then null;
  end;

  -- 10. OLDER TABLES, staged and rolled back inside: admin's Workspace's moved tables made live
  --     again (as on production since 2026-09-23), the integration fact set, then flip and unflip.
  begin
    select array_agg(d.id order by d.id) into v_moved from workbench.udt_datasets d
     where d.organization_id = c_ws and d.deleted_at is not null and d.metadata #>> '{moved_to,table_id}' = d.id::text;
    perform workbench.udt_dataset_unarchive(x) from unnest(v_moved) x;
    select value into v_before from platform.knob_override where feature = 'data_tables' and key = 'older_tables_moved' and organization_id = c_ws;
    update platform.cutover_seam set prerequisites = jsonb_set(prerequisites, '{0,met}', 'true'::jsonb) where seam_key = 'older_tables';

    -- 10.0 A copy that fell behind its older table refuses the flip, naming the rows.
    perform set_config('role', 'authenticated', true);
    v := platform.cutover_seam_press('older_tables', c_ws, 'new', 'before the copies are current');
    if v ->> 'reason' = 'not_ready' and v ->> 'says' ~ 'edited in the older tables after they were copied' then
      raise notice '10.0: refused while copies were behind — %', v ->> 'says';
      -- Stage: put back in the archive the tables whose copies are behind (their rerun is the
      -- mover's job), so the flip is judged on the tables whose copies are current. Rolled back.
      perform set_config('role', 'postgres', true);
      perform workbench.udt_dataset_archive(d.id, d.id, 'flipseams_green: its copy is behind')
         from workbench.udt_datasets d
        where d.id = any (v_moved)
          and exists (select 1 from workbench.udt_dataset_rows w join custom.record r on r.organization_id = c_ws and r.id = w.id
                       where w.table_id = d.id and w.deleted_at is null and w.updated_at > r.updated_at);
      select array_agg(d.id order by d.id) into v_moved from workbench.udt_datasets d
       where d.id = any (v_moved) and d.deleted_at is null;
      raise notice '10.0: % tables with current copies stay live for the flip', cardinality(v_moved);
      perform set_config('role', 'authenticated', true);
    elsif (v ->> 'ok')::boolean then
      raise exception '10.0: the flip went through although the copies are behind';
    end if;

    v := platform.cutover_seams(c_ws);
    if not (select (s ->> 'may_flip')::boolean from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables') then
      raise exception '10a: older tables are not offered for flip: %', (select s -> 'readiness' from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables');
    end if;
    v := platform.cutover_seam_press('older_tables', c_ws, 'new', 'the owner validated the copies');
    if not (v ->> 'ok')::boolean then raise exception '10b: the tables flip failed: %', v; end if;
    select array_agg(x::uuid order by x::uuid) into v_archived from jsonb_array_elements_text(v -> 'did' -> 'archived') x;
    if v_archived is distinct from v_moved then raise exception '10c: the flip archived % tables, not the % it should', cardinality(v_archived), cardinality(v_moved); end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from workbench.udt_datasets d where d.organization_id = c_ws and d.deleted_at is null) then raise exception '10d: an older table stayed live'; end if;
    if platform.knob_resolve('data_tables', 'older_tables_moved', c_ws) <> 'true'::jsonb then raise exception '10e: the tables-moved setting is off after the flip'; end if;
    perform set_config('role', 'authenticated', true);

    v := platform.cutover_seam_press('older_tables', c_ws, 'old', 'undo');
    if not (v ->> 'ok')::boolean then raise exception '10f: the tables reversal failed: %', v; end if;
    perform set_config('role', 'postgres', true);
    if (select count(*) from workbench.udt_datasets d where d.id = any (v_moved) and d.deleted_at is null) <> cardinality(v_moved) then
      raise exception '10g: the reversal did not bring back every table it archived';
    end if;
    if (select value from platform.knob_override where feature = 'data_tables' and key = 'older_tables_moved' and organization_id = c_ws) is distinct from v_before then
      raise exception '10h: the reversal did not put the setting back to what it was (%)', v_before;
    end if;
    raise notice 'PART 10 PASSED — % older tables archived by one press and brought back by one press.', cardinality(v_moved);
    raise exception 'FLIPSEAMS_ROLLBACK_PART_10';
  exception when raise_exception then
    if sqlerrm <> 'FLIPSEAMS_ROLLBACK_PART_10' then raise; end if;
  end;

  raise notice 'flipseams_green PASSED — 1 read, 2 member, 3 not a person (x3), 4 unready refused, 5 platform-wide, 6 one writer, 7 flip, 8 unflip, 9 log, 10 tables flip and unflip.';
end
$t$;

\if :keep
commit;
\else
rollback;
\endif
