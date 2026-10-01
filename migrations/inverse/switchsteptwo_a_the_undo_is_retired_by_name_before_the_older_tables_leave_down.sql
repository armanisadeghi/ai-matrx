-- INVERSE of migrations/campaign/switchsteptwo_a_the_undo_is_retired_by_name_before_the_older_tables_leave.sql (lane SWITCH-STEP-TWO):
-- the undo works again. Puts back platform.final_switch_undo / final_switch_readiness / final_switch_state exactly as
-- they were (11a0208e… / 22283253… / 8f7cb2e9…), drops the three new functions (their door row follows the function,
-- event trigger door_follows_its_function) and marks the seam retired. Retirement rows already recorded stay in the
-- append-only press record as history; a later re-apply counts only retirements recorded after it.
-- 🚨 Apply ONLY after every older table is back in workbench (the move's inverses): the undo needs them.
-- lane: SWITCH-STEP-TWO

do $$ begin
  if to_regclass('workbench.udt_datasets') is null then
    raise exception 'refused: the older tables are still in the archive (graveyard). Move them back first (the step-two move inverses), then bring the undo back.';
  end if;
end $$;

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
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    if v_uid is not null then
      perform platform._final_switch_record('old', 'refused', v_refused ->> 'reason', v_refused ->> 'says', null, null, p_note, v_run);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
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
begin
  if auth.uid() is null then
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in as a platform administrator to see the final switch.');
    end if;
  elsif not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_platform_admin',
      'says', 'Only a platform administrator sees the final switch, from Administration.');
  end if;
  v_out := platform._final_switch_readiness();
  return v_out || jsonb_build_object(
    'may_press', auth.uid() is not null and (v_out ->> 'ready')::boolean,
    'may_undo', auth.uid() is not null and v_out ->> 'state' = 'new');
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
begin
  v_last := platform._final_switch_last();
  return jsonb_build_object(
    'state', coalesce(v_last.direction, 'old'),
    'at', v_last.pressed_at,
    'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text)
             from auth.users u where u.id = v_last.pressed_by),
    'run_id', v_last.id,
    'data_screen', coalesce((platform._cutover_seam_last_done('data_screen', v_org)).direction, 'old'),
    'scopes_screens', coalesce((platform._cutover_seam_last_done('scopes_screens', v_org)).direction, 'old'));
end;
$function$;

drop function if exists platform.final_switch_retire_undo(text);
drop function if exists platform._final_switch_undo_retired_says(platform.cutover_seam_press);
drop function if exists platform._final_switch_undo_retired();
update platform.cutover_seam set retired_at = clock_timestamp() where seam_key = 'final_switch_undo' and retired_at is null;
