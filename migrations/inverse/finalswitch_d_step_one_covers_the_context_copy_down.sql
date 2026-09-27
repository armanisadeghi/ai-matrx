-- chair-step: lane FINAL-SWITCH inverse of the fourth file — puts back the third file's readiness body (Step 1 = Copy again only; the context copy's checks read as "cannot clear" again).
-- based-on: platform._final_switch_readiness() 4a30c98c55f363aaef082ab5bec0f0515c93d23b98b12f4cfe77cfe1ca9010b0
-- ground-standing-ok: b — this inverse runs before the third, second and first files' inverses (it undoes the fourth file only); the body it restores calls functions those files keep, and their inverses drop them together.
-- INVERSE of migrations/campaign/finalswitch_d_step_one_covers_the_context_copy.sql (lane FINAL-SWITCH).

CREATE OR REPLACE FUNCTION platform._final_switch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_copy_pending boolean := false;
  v_orphans jsonb;
  v_adopt int := 0;
  v_noowner int := 0;
  v_copy jsonb;
  v_orgs_blocked int := 0; v_orgs_need int := 0; v_orgs_ready int := 0; v_orgs_switch int := 0;
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
  -- FINAL-SWITCH (b): the press resolves them itself (coordinator ruling 2026-09-27). A list whose maker
  -- belongs to exactly one organization goes to that organization at Copy again (then it is copied and
  -- archived like the rest); every other one is archived by the press with no owner organization,
  -- named in its record and restorable by the Undo.
  v_orphans := platform._final_switch_orphan_lists();
  select count(*) filter (where x ->> 'resolution' = 'organization'), count(*) filter (where x ->> 'resolution' = 'no_owner')
    into v_adopt, v_noowner from jsonb_array_elements(v_orphans) x;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_lists', 'says', 'Every older pick list with no organization has somewhere to go',
    'met', v_adopt = 0, 'copy_again_clears', true,
    'detail', case when jsonb_array_length(v_orphans) = 0 then 'No older pick list is outside an organization.'
                   else concat_ws(' ',
                     case when v_adopt > 0 then format('%s %s to %s maker''s one organization at Copy again: %s.',
                       v_adopt, case when v_adopt = 1 then 'goes' else 'go' end, case when v_adopt = 1 then 'its' else 'their' end,
                       (select string_agg(format('%s → %s', x ->> 'name', x ->> 'organization_name'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'organization')) end,
                     case when v_noowner > 0 then format('%s %s archived by the press with no owner organization, restorable by Undo: %s.',
                       v_noowner, case when v_noowner = 1 then 'is' else 'are' end,
                       (select string_agg(format('%s (%s)', x ->> 'name', x ->> 'why'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'no_owner')) end) end,
    'fix', 'Copy again on this page gives each its maker''s organization; the press archives the rest.');
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

  -- (d) The last Copy again (its own step on the page, never inside the press) finished green.
  v_copy := platform._final_switch_copy_again_state();
  v_platform := v_platform || jsonb_build_object(
    'key', 'copy_again_finished', 'says', 'The last Copy again finished green',
    'met', v_copy is null or ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean),
    'copy_again_clears', true,
    'detail', case when v_copy is null then 'Copy again has not run from this page yet; it runs when something below needs it.'
                   when not (v_copy ->> 'finished')::boolean then
                     format('The Copy again started %s by %s has not finished (%s of its organizations done). Resume it.',
                            to_char((v_copy ->> 'started_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
                            coalesce(v_copy ->> 'by', 'someone'), v_copy ->> 'organizations_done')
                   when not (v_copy ->> 'ok')::boolean then
                     format('The last Copy again finished with refusals: %s. Run Copy again again.',
                            coalesce((select string_agg(x ->> 'name' || ' — ' || coalesce(x ->> 'says', ''), '; ')
                                        from jsonb_array_elements(v_copy -> 'organizations') x where not (x ->> 'ok')::boolean), 'see its record'))
                   else format('The last Copy again finished green at %s.',
                               to_char((v_copy ->> 'finished_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) end,
    'fix', 'Copy again on this page (it resumes where it stopped).');

  -- A platform check Copy again clears holds the press but is not a blocker a person must fix.
  v_platform_ok := not exists (select 1 from jsonb_array_elements(v_platform) p
                                where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false));
  v_copy_pending := exists (select 1 from jsonb_array_elements(v_platform) p
                             where not (p ->> 'met')::boolean and coalesce((p ->> 'copy_again_clears')::boolean, false));
  for c in select p from jsonb_array_elements(v_platform) p
            where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false) loop
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
    -- FINAL-SWITCH (c): the organizations the press itself switches (its plan names a step for them).
    if (v_t_state = 'old' and v_tl + v_ll > 0) or (v_t_state = 'new' and v_tl + v_ll > 0) or (v_c_state = 'old' and v_st > 0) then
      v_orgs_switch := v_orgs_switch + 1;
    end if;

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
    -- ONE SET OF COUNTS, EACH NAMED (VERIFIER-27): 'organizations' is every organization listed (it has
    -- anything old, or a switch pressed); 'to_switch' is the ones the press itself switches;
    -- 'nothing_to_switch' the rest (already on the new system, or nothing old left); 'need_copy_again'
    -- and 'blocked' are subsets of the listed ones. 'ready' is kept for older readers: listed
    -- organizations with no difference at all.
    'totals', jsonb_build_object('organizations', jsonb_array_length(v_orgs), 'ready', v_orgs_ready,
                                 'to_switch', v_orgs_switch, 'nothing_to_switch', jsonb_array_length(v_orgs) - v_orgs_switch,
                                 'need_copy_again', v_orgs_need, 'blocked', v_orgs_blocked),
    'needs_copy_again', v_need,
    'blocking', v_blocking,
    'orphans', v_orphans,
    'adopt_orphans', v_adopt,
    'copy_again', v_copy,
    'copy_again_needed', v_orgs_need > 0 or v_adopt > 0 or (v_copy is not null and not ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean)),
    'no_owner_archived', case when v_state = 'new' then coalesce(v_last.did -> 'orphans' -> 'no_owner', '[]'::jsonb) end,
    'ready', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and not v_copy_pending,
    'ready_after_copy_again', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0,
    'says', case when v_state = 'new' then 'Everything is on the new system (the final switch).'
                 when v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and not v_copy_pending then
                   format('Ready: pressing switches %s %s at once.', v_orgs_switch,
                          case when v_orgs_switch = 1 then 'organization' else 'organizations' end)
                 when v_platform_ok and v_orgs_blocked = 0 then
                   case when v_orgs_need > 0 or v_adopt > 0
                        then format('Ready once Copy again has run%s%s. Run it first; the press stays off until it finishes green.',
                               case when v_orgs_need > 0 then format(' for %s %s', v_orgs_need, case when v_orgs_need = 1 then 'organization' else 'organizations' end) else '' end,
                               case when v_adopt > 0 then format(' and given %s older pick %s %s maker''s organization', v_adopt,
                                                                  case when v_adopt = 1 then 'list' else 'lists' end, case when v_adopt = 1 then 'its' else 'their' end) else '' end)
                        else 'Ready once Copy again finishes green: ' || coalesce((select p ->> 'detail' from jsonb_array_elements(v_platform) p
                                                                                    where p ->> 'key' = 'copy_again_finished'), 'run it first.') end
                 else format('Not ready: %s %s must be fixed first. Copying again cannot fix %s.',
                             jsonb_array_length(v_blocking), case when jsonb_array_length(v_blocking) = 1 then 'thing' else 'things' end,
                             case when jsonb_array_length(v_blocking) = 1 then 'it' else 'them' end) end,
    'undo', case when v_state = 'new' then jsonb_build_object(
        'plan', v_undo,
        'needs_confirm', exists (select 1 from jsonb_array_elements(v_undo) u where coalesce((u ->> 'needs_confirm')::boolean, false))) end);
end;
$function$;
