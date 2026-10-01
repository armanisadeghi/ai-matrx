-- chair-step: lane SWITCH-STEP-TWO (2026-10-01). Step two's first, named step: RETIRE THE UNDO. After the press is proven
-- (safety nets green) and Arman says so, a platform administrator presses "Retire the undo" on the Final switch page. That
-- records ONE row (seam `final_switch_undo`, direction 'new' = retired) in the append-only press record. From then on
-- platform.final_switch_undo refuses with a people sentence (reason undo_retired), the Final switch page shows "Undo
-- retired" instead of the Undo button, and platform.final_switch_readiness answers the retired board WITHOUT reading the
-- older tables (its full body reads workbench.udt_*, which step two moves to the graveyard). Why a step and not a side
-- effect of the move: the undo restores older tables, older doors and older grants; once those tables are in the
-- graveyard its 89 bodies naming workbench.udt_* fail with "relation does not exist". A dead button is never left
-- on a page (THE DOOR LAW / a screen never lies), so the button goes away BEFORE the move, by a person, recorded.
--
-- Objects: 1 seam row (platform.cutover_seam 'final_switch_undo'); 3 new functions (platform._final_switch_undo_retired(),
-- platform._final_switch_undo_retired_says(platform.cutover_seam_press), platform.final_switch_retire_undo(text)) + its door
-- row; 3 replaced bodies (final_switch_undo, final_switch_readiness, final_switch_state; same signatures, grants kept).
-- Locks: pg_proc/pg_class row locks and one row insert each in platform.cutover_seam / platform.client_callable_door; no
-- relation lock above RowExclusive.
-- based-on: platform.final_switch_undo(text, boolean) 11a0208e4a9e7f4aad1fc92a074b1fa69527b5e94dd4028dec6adc8eac117cba
-- based-on: platform.final_switch_readiness() 22283253621705d3a81a305539b1b9718d2693f11f38cb77016c1c9b6e4124a5
-- based-on: platform.final_switch_state() 8f7cb2e94e8de8e61f0b6410d5d669f43945703557488161d5e7edbb1ab212cc
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_a_the_undo_is_retired_by_name_before_the_older_tables_leave_down.sql
-- TEST: scripts/campaign-tests/switchsteptwo_a_a_retired_undo_refuses_and_the_board_never_reads_the_older_tables_red_green.sql

insert into platform.cutover_seam (seam_key, sort_order, title, old_side, new_side, per_organization, press_kind,
                                   flip_does, needs_first, reverse_does, organization_id)
select 'final_switch_undo', 7, 'Retire the undo',
       'The final switch can be undone from the Final switch page',
       'The undo is retired; the older tables move to the archive and the switch is final',
       false, 'platform_switch',
       'Records that the undo is retired. The Undo button leaves the Final switch page and the undo refuses with a sentence. Step two then moves the older tables to the archive.',
       'The final switch is pressed, its tests are green after the press, and Arman says to retire the undo.',
       'Only the inverse file brings the undo back, and only after every older table has moved back out of the archive.',
       '39c38960-d30c-4840-b0c1-c9960de95582'
 where not exists (select 1 from platform.cutover_seam where seam_key = 'final_switch_undo');
-- Applied again after its inverse: the seam is live again and only retirements recorded from now count.
update platform.cutover_seam set retired_at = null, registered_at = clock_timestamp()
 where seam_key = 'final_switch_undo' and retired_at is not null;

-- The retirement, if recorded: the last DONE row of seam final_switch_undo, when it says 'new' (retired).
create or replace function platform._final_switch_undo_retired()
 returns platform.cutover_seam_press
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select r.* from (
    select p.* from platform.cutover_seam_press p
      join platform.cutover_seam s on s.seam_key = p.seam_key and s.retired_at is null
     where p.seam_key = 'final_switch_undo' and p.organization_id = platform._final_switch_platform_org()
       and p.outcome = 'done' and p.pressed_at >= s.registered_at
     order by p.pressed_at desc, p.id
     limit 1) r
   where r.direction = 'new';
$function$;
revoke all on function platform._final_switch_undo_retired() from public, anon, authenticated;

create or replace function platform._final_switch_undo_retired_says(p_row platform.cutover_seam_press)
 returns text
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select format('The undo was retired on %s%s; the switch is final.',
                to_char(p_row.pressed_at at time zone 'UTC', 'Mon FMDD, YYYY'),
                coalesce(' by ' || (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text)
                                      from auth.users u where u.id = p_row.pressed_by), ''));
$function$;
revoke all on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) from public, anon, authenticated;

-- The step itself: the same person rules as the press (a platform administrator, signed in, from the page).
create or replace function platform.final_switch_retire_undo(p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_refused jsonb;
  v_last platform.cutover_seam_press;
  v_retired platform.cutover_seam_press;
  v_id uuid := gen_random_uuid();
  v_says text;
  v_reason text;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  v_retired := platform._final_switch_undo_retired();
  v_last := platform._final_switch_last();
  if v_retired.id is not null then
    v_reason := 'already_retired'; v_says := platform._final_switch_undo_retired_says(v_retired);
  elsif coalesce(v_last.direction, 'old') <> 'new' then
    v_reason := 'not_pressed'; v_says := 'The final switch is not pressed, so there is no undo to retire.';
  end if;
  if v_reason is not null then
    insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, did, note)
    values (v_id, 'final_switch_undo', platform._final_switch_platform_org(), 'new', 'refused', v_reason, v_says, auth.uid(), '{}'::jsonb, p_note);
    return jsonb_build_object('ok', false, 'reason', v_reason, 'says', v_says);
  end if;
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (v_id, 'final_switch_undo', platform._final_switch_platform_org(), 'new', 'done',
          'The undo is retired; the older tables move to the archive next.', auth.uid(),
          jsonb_build_object('final_switch_run', v_last.id), p_note);
  v_retired := platform._final_switch_undo_retired();
  return jsonb_build_object('ok', true, 'id', v_id, 'final_switch_run', v_last.id,
                            'says', platform._final_switch_undo_retired_says(v_retired));
end;
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
                                           signed_in_callers, anonymous_callers, argument_rules)
select n.nspname, p.proname, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/switchsteptwo_a_the_undo_is_retired_by_name_before_the_older_tables_leave.sql (lane SWITCH-STEP-TWO)',
       'Takes no id. Retires the final switch''s undo: the same person rules as the press (a platform administrator, signed in, from the Final switch page); refuses unless the switch is pressed and the undo is not already retired; one row in the append-only press record.',
       true, false,
       '{"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the retirement record", "position": 1}}}'::jsonb
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.oid = 'platform.final_switch_retire_undo(text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'platform' and d.function_name = 'final_switch_retire_undo');
grant execute on function platform.final_switch_retire_undo(text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION platform.final_switch_undo(p_note text DEFAULT NULL::text, p_accept_not_carried boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_refused jsonb;
  v_run uuid := gen_random_uuid();
  v_note text;
  v_last platform.cutover_seam_press;
  v_ready jsonb;
  v_o jsonb;
  v_r jsonb;
  v_d jsonb;
  v_org uuid;
  v_id uuid;
  v_orgs jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_not jsonb := '[]'::jsonb;
  v_says text;
  v_platform uuid := platform._final_switch_platform_org();
  v_roles text;
  v_t0 timestamptz := clock_timestamp();
  v_ts timestamptz;
  v_timings jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_back_noowner int := 0;
  v_retired platform.cutover_seam_press;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    if v_uid is not null then
      perform platform._final_switch_record('old', 'refused', v_refused ->> 'reason', v_refused ->> 'says', null, null, p_note, v_run);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  -- SWITCH-STEP-TWO: once the undo is retired the older tables leave the app; nothing is undone.
  v_retired := platform._final_switch_undo_retired();
  if v_retired.id is not null then
    v_says := platform._final_switch_undo_retired_says(v_retired);
    perform platform._final_switch_record('old', 'refused', 'undo_retired', v_says, null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'undo_retired', 'says', v_says);
  end if;
  v_last := platform._final_switch_last();
  if coalesce(v_last.direction, 'old') <> 'new' then
    perform platform._final_switch_record('old', 'refused', 'nothing_to_undo',
      'The final switch has not been pressed, so there is nothing to undo.', null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_undo', 'says', 'The final switch has not been pressed, so there is nothing to undo.');
  end if;

  v_ready := platform._final_switch_readiness();
  -- What cannot be carried back is named first; the undo waits for the person to confirm it.
  for v_o in select x from jsonb_array_elements(coalesce(v_ready -> 'undo' -> 'plan', '[]'::jsonb)) x
              where coalesce((x ->> 'needs_confirm')::boolean, false) loop
    v_not := v_not || to_jsonb(format('%s: %s', v_o ->> 'name',
                                      (select string_agg(t, ' ') from jsonb_array_elements_text(v_o -> 'not_carried') t)));
  end loop;
  if jsonb_array_length(v_not) > 0 and not coalesce(p_accept_not_carried, false) then
    v_says := 'Undoing leaves these in the new system: ' || (select string_agg(x, ' ') from jsonb_array_elements_text(v_not) x)
              || ' Confirm that they stay behind, then undo.';
    perform platform._final_switch_record('old', 'refused', 'confirm_not_carried', v_says, v_ready, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'confirm_not_carried', 'says', v_says, 'not_carried', v_not);
  end if;

  v_note := format('the final switch undone (run %s undoes %s)', v_run, v_last.id) || coalesce(': ' || nullif(btrim(p_note), ''), '');
  perform set_config('app.final_switch_step', 'on', true);
  perform set_config('app.final_switch_undoing', 'on', true);

  begin
    -- 8'. The trim runs again as it did.
    if coalesce((v_last.did -> 'cron' ->> 'jobid'), '') <> '' then
      perform cron.alter_job((v_last.did -> 'cron' ->> 'jobid')::bigint, active := (v_last.did -> 'cron' ->> 'active_before')::boolean);
    end if;

    -- 7'. The older write doors open again exactly as they were: the row first, then the grant.
    v_ts := clock_timestamp();
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x loop
      if v_d ? 'row_added' then
        delete from platform.client_callable_door where id = (v_d ->> 'row_added')::uuid;
      elsif v_d -> 'row' is not null and jsonb_typeof(v_d -> 'row') = 'object' then
        update platform.client_callable_door
           set signed_in_callers = (v_d -> 'row' ->> 'signed_in_callers')::boolean,
               anonymous_callers = (v_d -> 'row' ->> 'anonymous_callers')::boolean,
               anonymous_purpose = v_d -> 'row' ->> 'anonymous_purpose',
               non_client_lane = v_d -> 'row' ->> 'non_client_lane'
         where id = (v_d -> 'row' ->> 'id')::uuid;
      end if;
    end loop;
    -- One GRANT per set of roles (each GRANT is a DDL statement every event trigger reads).
    for v_roles, v_d in
      select g.roles, jsonb_agg(g.door)
        from (select x ->> 'door' as door,
                     (select string_agg(r, ', ') from (values ('public', (x ->> 'public')::boolean), ('anon', (x ->> 'anon')::boolean),
                                                              ('authenticated', (x ->> 'authenticated')::boolean)) as t(r, had) where had) as roles
                from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x) g
       where g.roles is not null
       group by g.roles
    loop
      execute format('grant execute on function %s to %s',
                     (select string_agg(d, ', ') from jsonb_array_elements_text(v_d) d), v_roles);
    end loop;
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x
                where coalesce((x ->> 'service_role_added')::boolean, false) loop
      execute format('revoke execute on function %s from service_role', v_d ->> 'door');
    end loop;
    v_timings := v_timings || jsonb_build_object('doors_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6'. The Data page goes back.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'old', 'done', 'The Data page opens the older list again.', v_uid,
            jsonb_build_object('final_switch_run', v_run, 'undoes', v_last.id), v_note);

    -- 5b'. The scopes setting's platform value back first (it was set after the scopes press).
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'values', '[]'::jsonb)) x
                where coalesce((x ->> 'after_scopes')::boolean, false) loop
      perform platform.feature_knob_set(v_d ->> 'feature', v_d ->> 'key', v_d -> 'before');
    end loop;

    -- 5'. Scope and context screens back, for exactly the organizations the run pressed.
    if jsonb_typeof(v_last.did -> 'scopes' -> 'pressed') = 'array' then
      perform platform._final_switch_scopes('old', v_uid, v_note,
        (select coalesce(array_agg((x ->> 'organization_id')::uuid), '{}'::uuid[])
           from jsonb_array_elements(v_last.did -> 'scopes' -> 'pressed') x));
    end if;

    -- 4'. The platform values as they were.
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'values', '[]'::jsonb)) x
                where not coalesce((x ->> 'after_scopes')::boolean, false) loop
      perform platform.feature_knob_set(v_d ->> 'feature', v_d ->> 'key', v_d -> 'before');
    end loop;

    -- 3'. Agent context back, for exactly the organizations the run pressed.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ? 'context_press' loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (platform._cutover_seam_last_done('agent_context', v_org)).id is distinct from (v_o ->> 'context_press')::uuid then
        v_entry := v_entry || jsonb_build_object('context_skipped', 'pressed again after the final switch');
      else
        v_r := platform.cutover_seam_press('agent_context', v_org, 'old', v_note);
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Where agents get their context: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object('context_press', v_r ->> 'press_id');
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('agent_context_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 2b'. The pick lists the run archived with no owner organization come back.
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'orphans' -> 'no_owner', '[]'::jsonb)) x loop
      update workbench.udt_structured_lists
         set deleted_at = null, metadata = (metadata - 'final_switch_no_owner') - 'moved_to'
       where id = (v_d ->> 'id')::uuid and metadata ? 'final_switch_no_owner';
      v_back_noowner := v_back_noowner + 1;
    end loop;

    -- 2'. The leftovers of already-switched organizations come back.
    for v_o in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ? 'swept_tables' or x ? 'swept_lists' loop
      for v_id in select (jsonb_array_elements_text(coalesce(v_o -> 'swept_tables', '[]'::jsonb)))::uuid loop
        perform workbench.udt_dataset_unarchive(v_id);
      end loop;
      for v_id in select (jsonb_array_elements_text(coalesce(v_o -> 'swept_lists', '[]'::jsonb)))::uuid loop
        perform workbench.udt_structured_list_unarchive(v_id);
      end loop;
      v_orgs := v_orgs || jsonb_build_object('id', v_o ->> 'id', 'name', v_o ->> 'name',
        'unswept_tables', coalesce(v_o -> 'swept_tables', '[]'::jsonb), 'unswept_lists', coalesce(v_o -> 'swept_lists', '[]'::jsonb));
    end loop;

    -- 1'. Data tables back, newest organization first; each Switch back carries what the new
    -- system wrote into its older tables (lane SWITCH-BACK-CARRIES).
    v_ts := clock_timestamp();
    for v_o in select t.x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) with ordinality as t(x, i)
                where t.x ? 'tables_press'
                order by t.i desc loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (platform._cutover_seam_last_done('older_tables', v_org)).id is distinct from (v_o ->> 'tables_press')::uuid then
        v_entry := v_entry || jsonb_build_object('tables_skipped', 'pressed again after the final switch');
      else
        v_r := platform.cutover_seam_press('older_tables', v_org, 'old', v_note, coalesce(p_accept_not_carried, false));
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Data tables: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object(
          'tables_press', v_r ->> 'press_id',
          'tables_unarchived', jsonb_array_length(coalesce(v_r -> 'did' -> 'unarchived', '[]'::jsonb)),
          'lists_unarchived', jsonb_array_length(coalesce(v_r -> 'did' -> 'unarchived_lists', '[]'::jsonb)),
          'automations_back', jsonb_array_length(coalesce(v_r -> 'did' -> 'rekeyed_back', '[]'::jsonb)),
          'carried_back', v_r -> 'did' -> 'carried_back' -> 'says');
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('data_tables_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));
  exception when others then
    perform set_config('app.final_switch_step', '', true);
    perform set_config('app.final_switch_undoing', '', true);
    v_says := 'Nothing was changed: the undo stopped part way and was rolled back whole. ' || sqlerrm;
    perform platform._final_switch_record('old', 'refused', 'the_step_failed', v_says, v_ready, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

  perform set_config('app.final_switch_step', '', true);
  perform set_config('app.final_switch_undoing', '', true);
  v_counts := jsonb_build_object(
    'data_tables_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'tables_unarchived'),
    'tables_unarchived', (select coalesce(sum((e ->> 'tables_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_tables', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'lists_unarchived', (select coalesce(sum((e ->> 'lists_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_lists', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'agent_context_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'context_press'),
    'doors_opened', jsonb_array_length(coalesce(v_last.did -> 'doors', '[]'::jsonb)),
    'no_owner_lists_restored', v_back_noowner,
    'carried_back', (select coalesce(jsonb_agg(e ->> 'name' || ': ' || s), '[]'::jsonb)
                       from jsonb_array_elements(v_orgs) e, jsonb_array_elements_text(coalesce(e -> 'carried_back', '[]'::jsonb)) s
                      where s not like 'Nothing was written in the new tables since the switch%'),
    'nothing_to_carry', (select count(*) from jsonb_array_elements(v_orgs) e
                          where e ? 'tables_unarchived'
                            and not exists (select 1 from jsonb_array_elements_text(coalesce(e -> 'carried_back', '[]'::jsonb)) s
                                             where s not like 'Nothing was written in the new tables since the switch%')));
  v_timings := v_timings || jsonb_build_object('total_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  v_says := format('Undid the final switch: %s organizations back on their older tables (%s tables and %s pick lists restored), agent context back for %s, %s older write doors open again, the Data page and the scope screens back.',
                   v_counts ->> 'data_tables_switched_back', v_counts ->> 'tables_unarchived', v_counts ->> 'lists_unarchived',
                   v_counts ->> 'agent_context_switched_back', v_counts ->> 'doors_opened')
            || case when v_back_noowner > 0 then format(' %s pick %s with no owner organization restored.', v_back_noowner,
                                                         case when v_back_noowner = 1 then 'list' else 'lists' end) else '' end
            || coalesce(' Carried back from the new system: ' || (select string_agg(s, ' ') from jsonb_array_elements_text(v_counts -> 'carried_back') s), '')
            || case when (v_counts ->> 'nothing_to_carry')::int > 0
                    then format(' %s %s had nothing written in the new system to carry back.', v_counts ->> 'nothing_to_carry',
                                case when (v_counts ->> 'nothing_to_carry')::int = 1 then 'organization' else 'organizations' end)
                    else '' end;

  perform platform._final_switch_record('old', 'done', null, v_says, v_ready,
    jsonb_build_object('undoes', v_last.id, 'organizations', v_orgs, 'counts', v_counts, 'timings', v_timings,
                       'accepted_not_carried', case when jsonb_array_length(v_not) > 0 then v_not end),
    p_note, v_run);
  return jsonb_build_object('ok', true, 'press_id', v_run, 'state', 'old', 'undoes', v_last.id, 'says', v_says,
                            'counts', v_counts, 'timings', v_timings);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.final_switch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_out jsonb;
  v_retired platform.cutover_seam_press;
  v_last platform.cutover_seam_press;
begin
  if auth.uid() is null then
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in as a platform administrator to see the final switch.');
    end if;
  elsif not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_platform_admin',
      'says', 'Only a platform administrator sees the final switch, from Administration.');
  end if;
  -- SWITCH-STEP-TWO: a retired undo answers the retired board and never measures the older tables
  -- (they are in the archive once step two runs).
  v_retired := platform._final_switch_undo_retired();
  if v_retired.id is not null then
    v_last := platform._final_switch_last();
    return jsonb_build_object(
      'ok', true, 'checked_at', clock_timestamp(), 'state', 'new',
      'last_run', case when v_last.id is null then null else jsonb_build_object(
          'id', v_last.id, 'direction', v_last.direction, 'at', v_last.pressed_at, 'says', v_last.says,
          'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_last.pressed_by),
          'counts', v_last.did -> 'counts') end,
      'platform', '[]'::jsonb, 'organizations', '[]'::jsonb,
      'totals', jsonb_build_object('organizations', 0, 'ready', 0, 'to_switch', 0, 'nothing_to_switch', 0,
                                   'need_copy_again', 0, 'need_context_copy', 0, 'blocked', 0),
      'needs_copy_again', '[]'::jsonb, 'needs_context_copy', '[]'::jsonb, 'blocking', '[]'::jsonb,
      'orphans', '[]'::jsonb, 'copy_again', null, 'copy_again_needed', false,
      'ready', false, 'ready_after_copy_again', false,
      'says', 'Everything is on the new system. ' || platform._final_switch_undo_retired_says(v_retired),
      'undo', null,
      'undo_retired', jsonb_build_object('at', v_retired.pressed_at,
                                         'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_retired.pressed_by),
                                         'says', platform._final_switch_undo_retired_says(v_retired)),
      'may_press', false, 'may_undo', false, 'may_retire_undo', false);
  end if;
  v_out := platform._final_switch_readiness();
  return v_out || jsonb_build_object(
    'may_press', auth.uid() is not null and (v_out ->> 'ready')::boolean,
    'may_undo', auth.uid() is not null and v_out ->> 'state' = 'new',
    'may_retire_undo', auth.uid() is not null and v_out ->> 'state' = 'new',
    'undo_retired', null);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.final_switch_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_last platform.cutover_seam_press;
  v_org uuid := platform._final_switch_platform_org();
  v_retired platform.cutover_seam_press;
begin
  v_last := platform._final_switch_last();
  v_retired := platform._final_switch_undo_retired();
  return jsonb_build_object(
    'state', coalesce(v_last.direction, 'old'),
    'at', v_last.pressed_at,
    'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text)
             from auth.users u where u.id = v_last.pressed_by),
    'run_id', v_last.id,
    'data_screen', coalesce((platform._cutover_seam_last_done('data_screen', v_org)).direction, 'old'),
    'scopes_screens', coalesce((platform._cutover_seam_last_done('scopes_screens', v_org)).direction, 'old'),
    -- SWITCH-STEP-TWO: when the undo was retired (null while it still works).
    'undo_retired_at', v_retired.pressed_at);
end;
$function$;
