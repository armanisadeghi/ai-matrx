-- chair-step: lane FINAL-SWITCH inverse of the second file — puts back the first file's readiness, press and undo, and removes the orphan-list and Copy again machinery.
-- based-on: platform._final_switch_readiness() 00cea977ab503eebf4bdb63475294502063d489178c021d37166f06b3f486423
-- based-on: platform.final_switch_press(text, jsonb) 7e24726a9f240e94bbfe3238991f098ad4b19ea2fb59ca07508e320dd937068a
-- based-on: platform.final_switch_undo(text, boolean) 11a0208e4a9e7f4aad1fc92a074b1fa69527b5e94dd4028dec6adc8eac117cba
-- INVERSE of migrations/campaign/finalswitch_b_the_press_resolves_orgless_lists_and_copy_again_is_its_own_step.sql (lane FINAL-SWITCH).
-- Refused while the final switch is on. The Copy again records stay (append-only history; the seam
-- row is retired when a record names it). A list Copy again gave its maker's organization keeps it.

do $$
declare
  v_state text;
begin
  if to_regprocedure('platform._final_switch_last()') is not null then
    execute 'select (platform._final_switch_last()).direction' into v_state;
    if coalesce(v_state, 'old') = 'new' then
      raise exception 'The final switch is on. Undo it from Administration → Database → Final switch before removing this.'
        using errcode = '55000';
    end if;
  end if;
end $$;

-- ground-standing-ok: b — this inverse runs BEFORE the first file's inverse (it undoes the second file only); the bodies it restores call functions the first file keeps, and the first file's inverse drops them together with these bodies.
-- ground-standing-ok: a — CASCADE drops the trigger with its function in this one statement; no trigger is left over a missing body.
drop function if exists platform._final_switch_keeps_no_owner_lists_archived() cascade;

-- The three bodies as the first file left them.
create or replace function platform._final_switch_readiness()
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_last platform.cutover_seam_press;
  v_state text;
  v_platform jsonb := '[]'::jsonb;
  v_orgs jsonb := '[]'::jsonb;
  v_blocking jsonb := '[]'::jsonb;
  v_need jsonb := '[]'::jsonb;
  v_undo jsonb := '[]'::jsonb;
  v_pre_keys text[];
  o record;
  c jsonb;
  r jsonb;
  rc jsonb;
  rs jsonb;
  v_clears jsonb;
  v_cannot jsonb;
  v_t_state text; v_c_state text;
  v_t_at timestamptz; v_c_at timestamptz;
  v_tl bigint; v_ll bigint; v_st bigint; v_lag bigint;
  v_n bigint; v_names text;
  v_scopes jsonb;
  v_scopes_code boolean;
  v_x jsonb;
  v_rr jsonb;
  v_now_press uuid;
  v_platform_ok boolean;
  v_orgs_blocked int := 0; v_orgs_need int := 0; v_orgs_ready int := 0;
begin
  v_last := platform._final_switch_last();
  v_state := coalesce(v_last.direction, 'old');

  -- ── the platform's own checks ─────────────────────────────────────────────────────────────────
  -- (a) The Data tables switch's measured facts (the cutover census): the same for every
  -- organization, so said once here and left out of each organization's list.
  select coalesce(array_agg(p ->> 'key'), '{}'::text[]) into v_pre_keys
    from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
   where s.seam_key = 'older_tables';
  for c in select p from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
            where s.seam_key = 'older_tables' loop
    v_platform := v_platform || jsonb_build_object(
      'key', c ->> 'key', 'says', c ->> 'says', 'met', coalesce((c ->> 'met')::boolean, false),
      'detail', c ->> 'evidence', 'measured_at', c ->> 'measured_at',
      'fix', 'The cutover census re-measures with every release (census.ts --record); it turns green when every place it names reads the switch.');
  end loop;

  -- (b) Older tables and pick lists that belong to no organization: no organization's switch
  -- reaches them, so they would stay live in the older store.
  select count(*), string_agg(format('%s (made by %s)', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
                                     coalesce((select u.email::text from auth.users u where u.id = l.user_id), 'nobody')), '; ' order by l.list_name)
    into v_n, v_names
    from workbench.udt_structured_lists l
   where l.organization_id is null and l.deleted_at is null;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_lists', 'says', 'Every older pick list belongs to an organization',
    'met', v_n = 0,
    'detail', case when v_n = 0 then 'No older pick list is outside an organization.'
                   else format('%s older pick %s no organization, so no organization''s switch reaches %s: %s.',
                               v_n, case when v_n = 1 then 'list belongs to' else 'lists belong to' end,
                               case when v_n = 1 then 'it' else 'them' end, v_names) end,
    'fix', 'Give each an organization (its maker''s) or archive it; then Copy again copies it.');
  select count(*), string_agg(coalesce(nullif(btrim(d.table_name), ''), 'Untitled table'), '; ' order by d.table_name)
    into v_n, v_names
    from workbench.udt_datasets d
   where d.organization_id is null and d.deleted_at is null;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_tables', 'says', 'Every older table belongs to an organization',
    'met', v_n = 0,
    'detail', case when v_n = 0 then 'No older table is outside an organization.'
                   else format('%s older %s no organization: %s.', v_n,
                               case when v_n = 1 then 'table belongs to' else 'tables belong to' end, v_names) end,
    'fix', 'Give each an organization or archive it.');

  -- (c) The scope and context screens switch (lane SCOPES-WRITE-THROUGH) has its code.
  v_scopes_code := platform._final_switch_scopes_code() <> 'none';
  v_platform := v_platform || jsonb_build_object(
    'key', 'scopes_seam_has_code', 'says', 'The scope and context screens switch has its code',
    'met', v_scopes_code,
    'detail', case platform._final_switch_scopes_code()
                   when 'landed' then 'The scope and context screens switch is pressed for every organization, through its own door; each organization''s scopes readiness is below.'
                   when 'rehearsal_stand_in' then 'Rehearsal on the dev clone: the scope and context screens switch is stood in for.'
                   else 'The scope and context screens switch has no code yet: every scope screen, picker, tag and template still writes the current tables, and the agents'' write-back still goes to them. Lane SCOPES-WRITE-THROUGH is building it; the final switch waits for it.' end,
    'fix', 'Lane SCOPES-WRITE-THROUGH lands its switch (the seam per organization, platform.cutover_seam_press_everyone).');

  v_platform_ok := not exists (select 1 from jsonb_array_elements(v_platform) p where not (p ->> 'met')::boolean);
  for c in select p from jsonb_array_elements(v_platform) p where not (p ->> 'met')::boolean loop
    v_blocking := v_blocking || to_jsonb(format('The platform — %s: %s', c ->> 'says', rtrim(coalesce(c ->> 'detail', ''), '.')));
  end loop;

  -- ── every organization with anything old, or a switch pressed ─────────────────────────────────
  for o in
    select x.id, x.name::text as name, x.created_at, x.archived_at
      from iam.organizations x
     where exists (select 1 from workbench.udt_datasets d where d.organization_id = x.id and d.deleted_at is null)
        or exists (select 1 from workbench.udt_structured_lists l where l.organization_id = x.id and l.deleted_at is null)
        or exists (select 1 from context.scope_types t where t.organization_id = x.id and t.deleted_at is null)
        or exists (select 1 from platform.cutover_seam_press p
                    where p.organization_id = x.id and p.outcome = 'done'
                      and p.seam_key in ('older_tables', 'agent_context'))
     order by x.created_at, x.id
  loop
    select p.direction, p.pressed_at into v_t_state, v_t_at from platform._cutover_seam_last_done('older_tables', o.id) p;
    select p.direction, p.pressed_at into v_c_state, v_c_at from platform._cutover_seam_last_done('agent_context', o.id) p;
    v_t_state := coalesce(v_t_state, 'old');
    v_c_state := coalesce(v_c_state, 'old');
    select count(*) into v_tl from workbench.udt_datasets d where d.organization_id = o.id and d.deleted_at is null;
    select count(*) into v_ll from workbench.udt_structured_lists l where l.organization_id = o.id and l.deleted_at is null;
    select count(*) into v_st from context.scope_types t where t.organization_id = o.id and t.deleted_at is null;
    select count(*) into v_lag from custom.io_outbox x
     where x.organization_id = o.id and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;
    v_clears := '[]'::jsonb; v_cannot := '[]'::jsonb; r := null; rc := null;

    if v_tl + v_ll > 0 then
      r := platform._cutover_seam_readiness('older_tables', o.id);
      for c in select x from jsonb_array_elements(r -> 'checks') x
                where not (x ->> 'met')::boolean and not ((x ->> 'key') = any (v_pre_keys)) loop
        if coalesce((c ->> 'copy_again_clears')::bigint, 0) > 0 and coalesce((c ->> 'copy_again_leaves')::bigint, 0) = 0 then
          v_clears := v_clears || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail', 'clears', (c ->> 'copy_again_clears')::bigint);
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail',
                                                     'clears', coalesce((c ->> 'copy_again_clears')::bigint, 0),
                                                     'leaves', coalesce((c ->> 'copy_again_leaves')::bigint, 1));
        end if;
      end loop;
    end if;

    if v_c_state = 'old' and v_st > 0 then
      rc := platform._cutover_seam_readiness('agent_context', o.id);
      for c in select x from jsonb_array_elements(rc -> 'checks') x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        v_cannot := v_cannot || jsonb_build_object('switch', 'Where agents get their context', 'key', c ->> 'key',
                                                   'says', c ->> 'says', 'detail', c ->> 'detail', 'clears', 0, 'leaves', 1);
      end loop;
    end if;
    -- The scope screens, once their switch has landed: each organization's own readiness.
    if platform._final_switch_scopes_code() = 'landed' and v_st > 0 then
      execute 'select case custom.context_writer($1) when ''store'' then null else platform._cutover_seam_readiness(''scopes_screens'', $1) end'
         into rs using o.id;
      for c in select x from jsonb_array_elements(coalesce(rs -> 'checks', '[]'::jsonb)) x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        v_cannot := v_cannot || jsonb_build_object('switch', 'Scope and context screens', 'key', c ->> 'key',
                                                   'says', c ->> 'says', 'detail', c ->> 'detail', 'clears', 0, 'leaves', 1);
      end loop;
    end if;
    -- Edits waiting for the context copy hold everything: after the final switch every agent reads
    -- the copy, so a waiting edit is a wrong answer. Whichever side the organization is on.
    if v_lag > 0 then
      v_cannot := v_cannot || jsonb_build_object('switch', 'Where agents get their context', 'key', 'follow_current',
        'says', 'No scope edit is waiting to be copied',
        'detail', format('%s %s made in the current scope screens %s waiting for the copy (the oldest since %s). Copying the tables again does not carry them; the context follow does.',
                         v_lag, case when v_lag = 1 then 'edit' else 'edits' end, case when v_lag = 1 then 'is' else 'are' end,
                         (select to_char(min(x.created_at) at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') from custom.io_outbox x
                           where x.organization_id = o.id and x.event_key = 'context.follow'
                             and x.consumed_at is null and x.deleted_at is null)),
        'clears', 0, 'leaves', v_lag);
    end if;

    for c in select x from jsonb_array_elements(v_cannot) x loop
      v_blocking := v_blocking || to_jsonb(format('%s — %s: %s: %s', o.name, c ->> 'switch', c ->> 'says', rtrim(coalesce(c ->> 'detail', ''), '.')));
    end loop;
    if jsonb_array_length(v_cannot) > 0 then v_orgs_blocked := v_orgs_blocked + 1; end if;
    if jsonb_array_length(v_clears) > 0 then
      v_need := v_need || to_jsonb(o.id);
      v_orgs_need := v_orgs_need + 1;
    end if;
    if jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0 then v_orgs_ready := v_orgs_ready + 1; end if;

    v_orgs := v_orgs || jsonb_build_object(
      'id', o.id, 'name', o.name, 'created_at', o.created_at, 'archived', o.archived_at is not null,
      'tables', jsonb_build_object(
          'live', v_tl,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail') end,
          'state', v_t_state, 'switched_at', case when v_t_state = 'new' then v_t_at end),
      'lists', jsonb_build_object(
          'live', v_ll,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'lists_copied' limit 1) ->> 'detail') end),
      'scopes', jsonb_build_object(
          'types', v_st, 'state', v_c_state, 'switched_at', case when v_c_state = 'new' then v_c_at end,
          'parity', case when rc is not null then ((select x from jsonb_array_elements(rc -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail')
                         when v_c_state = 'new' then 'Agents read the copy.'
                         when v_st = 0 then 'No scopes.' end),
      'follow_lag', v_lag,
      'rerun_clears', v_clears,
      'cannot_clear', v_cannot,
      'needs_copy_again', jsonb_array_length(v_clears) > 0,
      'ready', jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0,
      'plan', jsonb_build_object(
          'press_tables', v_t_state = 'old' and v_tl + v_ll > 0,
          'sweep_tables', case when v_t_state = 'new' then v_tl else 0 end,
          'sweep_lists', case when v_t_state = 'new' then v_ll else 0 end,
          'press_context', v_c_state = 'old' and v_st > 0));
  end loop;

  -- ── after a run: the undo's plan ──────────────────────────────────────────────────────────────
  if v_state = 'new' then
    for v_x in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ->> 'tables_press' is not null loop
      v_now_press := (platform._cutover_seam_last_done('older_tables', (v_x ->> 'id')::uuid)).id;
      if v_now_press is distinct from (v_x ->> 'tables_press')::uuid then
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'skipped', 'Its Data tables were pressed again after the final switch, so the undo leaves them as they are.');
      else
        v_rr := platform._cutover_seam_reverse_readiness('older_tables', (v_x ->> 'id')::uuid);
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'carries', coalesce(v_rr -> 'carries', '[]'::jsonb),
          'not_carried', coalesce(v_rr -> 'not_carried', '[]'::jsonb),
          'needs_confirm', coalesce((v_rr ->> 'needs_confirm')::boolean, false));
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked_at', clock_timestamp(),
    'state', v_state,
    'last_run', case when v_last.id is null then null else jsonb_build_object(
        'id', v_last.id, 'direction', v_last.direction, 'at', v_last.pressed_at, 'says', v_last.says,
        'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_last.pressed_by),
        'counts', v_last.did -> 'counts') end,
    'platform', v_platform,
    'organizations', v_orgs,
    'totals', jsonb_build_object('organizations', jsonb_array_length(v_orgs), 'ready', v_orgs_ready,
                                 'need_copy_again', v_orgs_need, 'blocked', v_orgs_blocked),
    'needs_copy_again', v_need,
    'blocking', v_blocking,
    'ready', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0,
    'ready_after_copy_again', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0,
    'says', case when v_state = 'new' then 'Everything is on the new system (the final switch).'
                 when v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 then
                   format('Every organization is ready. Pressing switches %s organizations at once.', jsonb_array_length(v_orgs))
                 when v_platform_ok and v_orgs_blocked = 0 then
                   format('Ready once the older tables are copied again for %s %s; the press does that first.',
                          v_orgs_need, case when v_orgs_need = 1 then 'organization' else 'organizations' end)
                 else format('Not ready: %s %s must be fixed first. Copying again cannot fix %s.',
                             jsonb_array_length(v_blocking), case when jsonb_array_length(v_blocking) = 1 then 'thing' else 'things' end,
                             case when jsonb_array_length(v_blocking) = 1 then 'it' else 'them' end) end,
    'undo', case when v_state = 'new' then jsonb_build_object(
        'plan', v_undo,
        'needs_confirm', exists (select 1 from jsonb_array_elements(v_undo) u where coalesce((u ->> 'needs_confirm')::boolean, false))) end);
end;
$$;

create or replace function platform.final_switch_press(p_note text default null, p_copy_again jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_refused jsonb;
  v_run uuid := gen_random_uuid();
  v_note text;
  v_ready jsonb;
  v_last platform.cutover_seam_press;
  v_o jsonb;
  v_r jsonb;
  v_org uuid;
  v_orgs jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_ids uuid[];
  v_lists uuid[];
  v_id uuid;
  v_values jsonb := '[]'::jsonb;
  v_scopes jsonb;
  v_doors jsonb := '[]'::jsonb;
  v_sig regprocedure;
  v_door record;
  v_before jsonb;
  v_sr_added boolean;
  v_cron jsonb;
  v_job bigint; v_active boolean;
  v_says text;
  v_t0 timestamptz := clock_timestamp();
  v_ts timestamptz;
  v_timings jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_platform uuid := platform._final_switch_platform_org();
  v_list_door text;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    if v_uid is not null then
      perform platform._final_switch_record('new', 'refused', v_refused ->> 'reason', v_refused ->> 'says', null, null, p_note, v_run);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;

  -- One final switch at a time.
  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  v_last := platform._final_switch_last();
  if coalesce(v_last.direction, 'old') = 'new' then
    perform platform._final_switch_record('new', 'refused', 'already_there',
      'Everything is already on the new system (the final switch). Undo is on the same page.', null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'already_there', 'says', 'Everything is already on the new system (the final switch).');
  end if;

  v_ts := clock_timestamp();
  v_ready := platform._final_switch_readiness();
  v_timings := v_timings || jsonb_build_object('readiness_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));
  if not (v_ready ->> 'ready')::boolean then
    v_says := case when (v_ready ->> 'ready_after_copy_again')::boolean
                   then format('Not ready yet: the older tables of %s must be copied again first (the Final switch page does that before it presses).',
                               (select string_agg(x ->> 'name', ', ') from jsonb_array_elements(v_ready -> 'organizations') x where (x ->> 'needs_copy_again')::boolean))
                   else 'Not ready yet: ' || (select string_agg(x, '; ') from jsonb_array_elements_text(v_ready -> 'blocking') x) || '.' end;
    perform platform._final_switch_record('new', 'refused', 'not_ready', v_says, v_ready,
      jsonb_build_object('copy_again', p_copy_again), p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'not_ready', 'says', v_says, 'press_id', v_run, 'readiness', v_ready);
  end if;

  v_note := format('the final switch (run %s)', v_run) || coalesce(': ' || nullif(btrim(p_note), ''), '');
  -- The per-organization press recognises its caller (it refuses anyone else while the final switch is on).
  perform set_config('app.final_switch_step', 'on', true);

  begin
    -- 1. Data tables, every organization on the old side with anything older, oldest first.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x order by x ->> 'created_at', x ->> 'id' loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (v_o -> 'plan' ->> 'press_tables')::boolean then
        v_r := platform.cutover_seam_press('older_tables', v_org, 'new', v_note);
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Data tables: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object(
          'tables_press', v_r ->> 'press_id',
          'tables_archived', jsonb_array_length(coalesce(v_r -> 'did' -> 'archived', '[]'::jsonb)),
          'lists_archived', jsonb_array_length(coalesce(v_r -> 'did' -> 'archived_lists', '[]'::jsonb)),
          'automations_rekeyed', jsonb_array_length(coalesce(v_r -> 'did' -> 'rekeyed', '[]'::jsonb)),
          'test_edits_replaced', jsonb_array_length(coalesce(v_r -> 'did' -> 'resynced', '[]'::jsonb)));
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('data_tables_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 2. Organizations already switched that still hold live older tables or lists: archived with
    -- the same pointer, recorded here so the undo brings back exactly these.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x
                where (x -> 'plan' ->> 'sweep_tables')::int + (x -> 'plan' ->> 'sweep_lists')::int > 0 loop
      v_org := (v_o ->> 'id')::uuid;
      v_ids := '{}'; v_lists := '{}';
      for v_id in select d.id from workbench.udt_datasets d where d.organization_id = v_org and d.deleted_at is null order by d.id loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      for v_id in select l.id from workbench.udt_structured_lists l where l.organization_id = v_org and l.deleted_at is null order by l.id loop
        perform workbench.udt_structured_list_archive(v_id, v_id, v_note);
        v_lists := v_lists || v_id;
      end loop;
      v_orgs := (select jsonb_agg(case when t.e ->> 'id' = v_org::text
                                       then t.e || jsonb_build_object('swept_tables', to_jsonb(v_ids), 'swept_lists', to_jsonb(v_lists))
                                       else t.e end order by t.i)
                   from jsonb_array_elements(v_orgs) with ordinality as t(e, i));
    end loop;
    v_timings := v_timings || jsonb_build_object('leftovers_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 3. Where agents get their context, every organization with scopes on the old side.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x
                where (x -> 'plan' ->> 'press_context')::boolean order by x ->> 'created_at', x ->> 'id' loop
      v_org := (v_o ->> 'id')::uuid;
      v_r := platform.cutover_seam_press('agent_context', v_org, 'new', v_note);
      if not coalesce((v_r ->> 'ok')::boolean, false) then
        raise exception '%', format('%s — Where agents get their context: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
      end if;
      v_orgs := (select jsonb_agg(case when t.e ->> 'id' = v_org::text
                                       then t.e || jsonb_build_object('context_press', v_r ->> 'press_id')
                                       else t.e end order by t.i)
                   from jsonb_array_elements(v_orgs) with ordinality as t(e, i));
    end loop;
    v_timings := v_timings || jsonb_build_object('agent_context_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 4. The platform values: an organization made from now on is born on the new side.
    for v_o in select jsonb_build_object('feature', f, 'key', k) from (values
                  ('data_tables', 'older_tables_moved'), ('custom', 'agent_context_reads_the_copy')) as t(f, k) loop
      select k.value into v_before from platform.feature_knob k where k.feature = v_o ->> 'feature' and k.key = v_o ->> 'key';
      perform platform.feature_knob_set(v_o ->> 'feature', v_o ->> 'key', 'true'::jsonb);
      v_values := v_values || (v_o || jsonb_build_object('before', v_before, 'now', true));
    end loop;

    -- 5. Scope and context screens, every organization (lane SCOPES-WRITE-THROUGH's own door).
    v_ts := clock_timestamp();
    -- Every organization that holds scopes; the rest write in the store through the platform value (4).
    v_scopes := platform._final_switch_scopes('new', v_uid, v_note,
      (select coalesce(array_agg((x ->> 'id')::uuid), '{}'::uuid[]) from jsonb_array_elements(v_ready -> 'organizations') x
        where (x -> 'scopes' ->> 'types')::int > 0));
    -- 5b. Lane SCOPES-WRITE-THROUGH's setting's platform value, AFTER its press (the press reads each
    -- organization's writer from it): an organization with no scopes yet writes its first ones in the store.
    if platform._final_switch_scopes_code() = 'landed'
       and exists (select 1 from platform.feature_knob fk where fk.feature = 'custom' and fk.key = 'scopes_written_in_the_store') then
      select k.value into v_before from platform.feature_knob k where k.feature = 'custom' and k.key = 'scopes_written_in_the_store';
      perform platform.feature_knob_set('custom', 'scopes_written_in_the_store', 'true'::jsonb);
      v_values := v_values || jsonb_build_object('feature', 'custom', 'key', 'scopes_written_in_the_store',
                                                 'before', v_before, 'now', true, 'after_scopes', true);
    end if;
    v_timings := v_timings || jsonb_build_object('scopes_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6. The Data page for everyone, recorded on the platform organization.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'new', 'done', 'The Data page opens the new tables for everyone.', v_uid,
            jsonb_build_object('final_switch_run', v_run), v_note);

    -- 7. The older WRITE doors leave the browser's reach, through the door registry.
    v_ts := clock_timestamp();
    foreach v_sig in array platform._final_switch_old_write_doors() loop
      select d.id, d.signed_in_callers, d.anonymous_callers, d.anonymous_purpose, d.non_client_lane, d.reason
        into v_door
        from platform.client_callable_door d
        join pg_proc p on p.oid = v_sig
        join pg_namespace n on n.oid = p.pronamespace
       where d.schema_name = n.nspname and d.function_name = p.proname
         and d.identity_argtypes = platform.door_argtypes(p.proargtypes);
      v_before := jsonb_build_object(
        'door', v_sig::text,
        'row', case when v_door.id is null then null else jsonb_build_object(
                 'id', v_door.id, 'signed_in_callers', v_door.signed_in_callers, 'anonymous_callers', v_door.anonymous_callers,
                 'anonymous_purpose', v_door.anonymous_purpose, 'non_client_lane', v_door.non_client_lane) end,
        'public', has_function_privilege('public', v_sig, 'EXECUTE'),
        'anon', has_function_privilege('anon', v_sig, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', v_sig, 'EXECUTE'),
        'service_role', has_function_privilege('service_role', v_sig, 'EXECUTE'));
      v_list_door := format('Closed to clients by the final switch (run %s): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.', v_run);
      if v_door.id is not null then
        update platform.client_callable_door
           set signed_in_callers = false, anonymous_callers = false, anonymous_purpose = null,
               non_client_lane = v_list_door
         where id = v_door.id;
      else
        insert into platform.client_callable_door
          (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
           signed_in_callers, anonymous_callers, non_client_lane)
        select n.nspname, p.proname, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
               'platform.final_switch_press (lane FINAL-SWITCH)',
               'An older-table write door, recorded here so no client may open it while the final switch is on.',
               false, false, v_list_door
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = v_sig
        returning id into v_id;
        v_before := v_before || jsonb_build_object('row_added', v_id);
      end if;
      v_doors := v_doors || v_before;
    end loop;
    execute 'revoke execute on function ' || (select string_agg(x::text, ', ') from unnest(platform._final_switch_old_write_doors()) x)
         || ' from public, anon, authenticated';
    -- service_role keeps what it had, even when it had it only through PUBLIC.
    v_doors := (select jsonb_agg(case when (t.d ->> 'service_role')::boolean
                                           and not has_function_privilege('service_role', (t.d ->> 'door')::regprocedure, 'EXECUTE')
                                      then t.d || jsonb_build_object('service_role_added', true) else t.d end order by t.i)
                  from jsonb_array_elements(v_doors) with ordinality as t(d, i));
    for v_before in select d from jsonb_array_elements(v_doors) d where coalesce((d ->> 'service_role_added')::boolean, false) loop
      execute format('grant execute on function %s to service_role', v_before ->> 'door');
    end loop;
    v_timings := v_timings || jsonb_build_object('doors_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 8. The weekly trim of older row history pauses, so the undo is lossless.
    select j.jobid, j.active into v_job, v_active from cron.job j where j.jobname = 'udt_dataset_row_versions_trim_weekly';
    if v_job is not null then
      perform cron.alter_job(v_job, active := false);
      v_cron := jsonb_build_object('job', 'udt_dataset_row_versions_trim_weekly', 'jobid', v_job, 'active_before', v_active, 'active_now', false);
    else
      v_cron := jsonb_build_object('job', 'udt_dataset_row_versions_trim_weekly', 'absent', true);
    end if;
  exception when others then
    perform set_config('app.final_switch_step', '', true);
    v_says := 'Nothing was changed: the final switch stopped part way and every organization was rolled back. ' || sqlerrm;
    perform platform._final_switch_record('new', 'refused', 'the_step_failed', v_says, v_ready,
      jsonb_build_object('copy_again', p_copy_again), p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

  -- The press's own mark ends with the press: nothing else in this transaction passes as the final switch.
  perform set_config('app.final_switch_step', '', true);
  v_counts := jsonb_build_object(
    'organizations', jsonb_array_length(v_orgs),
    'data_tables_pressed', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'tables_press'),
    'tables_archived', (select coalesce(sum((e ->> 'tables_archived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'swept_tables', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'lists_archived', (select coalesce(sum((e ->> 'lists_archived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'swept_lists', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'automations_rekeyed', (select coalesce(sum((e ->> 'automations_rekeyed')::int), 0) from jsonb_array_elements(v_orgs) e),
    'agent_context_pressed', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'context_press'),
    'doors_closed', jsonb_array_length(v_doors));
  v_timings := v_timings || jsonb_build_object('total_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  v_says := format('Switched everything to the new system: %s organizations (Data tables %s, agent context %s), %s older tables and %s pick lists archived with their pointers, %s automations re-keyed, %s older write doors closed to clients.',
                   v_counts ->> 'organizations', v_counts ->> 'data_tables_pressed', v_counts ->> 'agent_context_pressed',
                   v_counts ->> 'tables_archived', v_counts ->> 'lists_archived', v_counts ->> 'automations_rekeyed', v_counts ->> 'doors_closed');

  perform platform._final_switch_record('new', 'done', null, v_says, v_ready,
    jsonb_build_object('organizations', v_orgs, 'values', v_values, 'scopes', v_scopes, 'doors', v_doors,
                       'cron', v_cron, 'copy_again', p_copy_again, 'counts', v_counts, 'timings', v_timings),
    p_note, v_run);
  return jsonb_build_object('ok', true, 'press_id', v_run, 'state', 'new', 'says', v_says, 'counts', v_counts, 'timings', v_timings);
end;
$$;

create or replace function platform.final_switch_undo(p_note text default null, p_accept_not_carried boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
$$;

drop function if exists platform.final_switch_copy_again_record(uuid, text, uuid, boolean, jsonb);
drop function if exists platform.final_switch_adopt_orphan_lists(uuid);
drop function if exists platform._final_switch_copy_again_state();
drop function if exists platform._final_switch_orphan_lists();

update platform.cutover_seam set retired_at = now()
 where seam_key = 'final_switch_copy_again'
   and exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch_copy_again');
delete from platform.cutover_seam s
 where s.seam_key = 'final_switch_copy_again'
   and not exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch_copy_again');
