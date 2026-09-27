-- draft: FINAL-SWITCH (Claude Opus 5.5) rehearsal on the clone pending
-- chair-step: lane FINAL-SWITCH (chair brief 2026-09-26 night, from Arman's ruling: "I don't want to do this one org at a time. We will switch everything over once we know it works and it's done. Old gone, new in place."). ADDS the final switch: platform._final_switch_readiness / platform.final_switch_readiness (every organization's readiness, measured now, one answer), platform.final_switch_press (one platform-admin press: Data tables for every organization, the leftovers of already-switched organizations, agent context for every organization, the platform values new organizations are born with, the scope screens (their lane's step), the Data page for everyone, the older write doors closed to clients through the door registry, the older row-history trim paused; one press record), platform.final_switch_undo (ONE undo, the same steps backwards, Switch back carrying what the new system wrote), platform.final_switch_state (what every screen reads). REPLACES platform.cutover_seams (platform switches say their real state; the per-organization buttons step aside while the final switch is on), platform.cutover_seam_press (refuses a per-organization press while the final switch is on, except from the final switch itself) and platform.older_tables_switched (true everywhere while the final switch is on: nothing new is born in the older store). One new seam row. Door rows for the four doors. Never presses anything.
-- based-on: platform.cutover_seams(uuid) f4a6922b1a02a2b69b5015f3647c7b029e61c7756f0c719cd9433d3a7f8d057f
-- based-on: platform.older_tables_switched(uuid) 2575b56a084dbdb294f723b3dfe5235248cea62d6f9df3a7ae2f7a74619d5fb6
-- based-on: platform.cutover_seam_press(text, uuid, text, text, boolean) cbc177e7a58f79f7f855f2eb73ee1165c85e0944d6589ab8e4b41cbb281a8855
-- lane: FINAL-SWITCH
-- INVERSE: migrations/inverse/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it_down.sql
--
-- WHAT A PERSON NOTICES. A platform administrator opens Administration → Database → Final switch.
-- One table lists every organization that still has anything old: its tables and pick lists, what
-- copying again would clear, what it cannot clear (named: organization, table, difference, what to
-- do), whether its agents read the new copy of its scopes, and how many scope edits wait for the copy.
-- The press is disabled, with the reason, until every row is green. Pressed, it copies again where
-- that clears something (the server door), then switches EVERY organization in one transaction and
-- writes ONE press record with counts per organization and per thing. Undo reverses exactly that
-- run, in the same order backwards; Switch back carries what the new system wrote back into the
-- older tables, as each organization's own Switch back does (lane SWITCH-BACK-CARRIES).
--
-- THE ORDER (the undo runs it backwards):
--   1. Data tables, every organization on the old side that still has an older table or pick list,
--      oldest organization first — each through platform.cutover_seam_press, the same press its
--      owner would make (copy re-synced, tables and lists archived with their pointers,
--      automations re-keyed, the organization's setting set, a press row per organization).
--   2. Organizations already switched that still have live older tables or lists (Arman's Org
--      switched before lists joined the press): each is archived with the same pointer.
--   3. Where agents get their context, every organization with scopes on the old side.
--   4. The platform values of both settings turn on, so an organization made later is born on
--      the new side.
--   5. Scope and context screens: lane SCOPES-WRITE-THROUGH's step,
--      platform._final_switch_scopes_step(p_to text, p_actor uuid, p_run uuid) returns jsonb.
--      Until that function exists the final switch refuses: "the scope and context screens switch
--      has no code yet". (Optional: platform._final_switch_scopes_readiness() returns jsonb
--      {checks: [{key, says, met, detail}]}, read into the platform checks.)
--   6. The Data page for everyone (seam data_screen) and the scope screens (seam scopes_screens)
--      are recorded as done on the platform organization, where every screen reads their state.
--   7. The older WRITE doors are closed to clients through the door registry (a row says no client
--      may open it; EXECUTE taken back from PUBLIC, anon, authenticated; service_role kept). The
--      older READ doors stay open: the table pickers, the /data home and the reference resolver
--      still call them and they answer every moved table with its pointer. They close in the
--      retirement window once check:old-system-unreachable shows no caller (CUTOVER-PLAN §3 step 4).
--   8. The weekly trim of older row history is paused, so the undo is lossless.
--   9. One press record: platform.cutover_seam_press, seam final_switch, the platform organization.
--
-- WHY NO NEW TABLE. A new table's RLS enable took ACCESS EXCLUSIVE on 22 auth/storage/realtime
-- relations in lane SWITCH-BACK-CARRIES' measure pass. The press record is a row in the existing
-- append-only platform.cutover_seam_press, under a new seam row.
--
-- WHY ONE TRANSACTION. All or nothing: a refusal anywhere rolls every organization back and the
-- refusal is recorded naming the organization and what refused. The press is long (every
-- organization's readiness twice, the copy re-sync), longer than a browser request may run (8 s),
-- so the page presses through aidream's final-switch door, which acts as the person (their own
-- verified token, the admin lane, the page's origin) with a longer statement timeout. The database
-- still decides: a platform administrator, signed in, from a page, or nothing.

-- ── 0. THE SEAM ROW ─────────────────────────────────────────────────────────────────────────────
insert into platform.cutover_seam
  (seam_key, sort_order, title, old_side, new_side, per_organization, press_kind,
   flip_does, needs_first, reverse_does, prerequisites, organization_id)
values
  ('final_switch', 5, 'The final switch',
   'Organizations switch one at a time on their settings pages',
   'Every organization is on the new system at once; the older tables, lists and write doors are gone from the browser''s reach',
   false, 'platform_switch',
   'Copies again where that clears something, then switches every organization''s Data tables and agent context, turns the Data page and the scope screens over for everyone, closes the older write doors to clients and pauses the older row-history trim. One press record with counts per organization.',
   'Every organization is ready (nothing copying again cannot clear), every older table and pick list belongs to an organization, the cutover census is green, and the scope and context screens switch has its code.',
   'One undo reverses exactly that run in the same order backwards; each organization''s Switch back carries what the new system wrote back into its older tables.',
   '[]'::jsonb,
   (select s.organization_id from platform.cutover_seam s where s.seam_key = 'older_tables'))
on conflict (seam_key) do update set retired_at = null;

-- ── 1. SMALL READS ───────────────────────────────────────────────────────────────────────────────
-- The platform organization: where the platform switches' presses are recorded.
create or replace function platform._final_switch_platform_org()
returns uuid
language sql
stable
set search_path to 'pg_catalog'
as $$
  select s.organization_id from platform.cutover_seam s where s.seam_key = 'final_switch';
$$;

-- The last DONE run of the final switch (either direction), or null.
create or replace function platform._final_switch_last()
returns platform.cutover_seam_press
language sql
stable
set search_path to 'pg_catalog'
as $$
  select p.* from platform.cutover_seam_press p
   where p.seam_key = 'final_switch' and p.organization_id = platform._final_switch_platform_org()
     and p.outcome = 'done'
   order by p.pressed_at desc, p.id
   limit 1;
$$;

-- Is the final switch on? False inside the final undo itself (transaction-local), so the steps it
-- reverses behave as they did before the run.
create or replace function platform._final_switch_is_on()
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $$
  select coalesce(current_setting('app.final_switch_undoing', true), '') <> 'on'
     and coalesce((platform._final_switch_last()).direction, 'old') = 'new';
$$;

-- THE OLDER WRITE DOORS the press closes to clients (the guard check:old-system-unreachable reads
-- this list between the two markers; keep one door per line).
create or replace function platform._final_switch_old_write_doors()
returns regprocedure[]
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select array[
    -- OLD-WRITE-DOORS-BEGIN
    'public.add_column_to_user_table(uuid, text, text, text, integer, boolean, jsonb, jsonb)',
    'public.add_data_row_to_user_table(uuid, jsonb)',
    'public.append_rows_to_user_table(uuid, jsonb)',
    'public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb)',
    'public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb)',
    'public.delete_data_row_from_user_table(uuid)',
    'public.delete_user_table(uuid)',
    'public.udt_backfill_autonumber(uuid, uuid)',
    'public.udt_bulk_write(uuid, jsonb)',
    'public.udt_change_field_type(uuid, uuid, public.field_data_type, text)',
    'public.udt_delete_field(uuid, uuid)',
    'public.udt_set_field_format(uuid, uuid, jsonb)',
    'public.udt_set_table_row_actions(uuid, jsonb)',
    'public.udt_set_table_row_label(uuid, jsonb)',
    'public.udt_set_table_style(uuid, text[], jsonb)',
    'public.udt_upsert_cell(uuid, uuid, text, jsonb)',
    'public.udt_upsert_row(uuid, uuid, jsonb)',
    'public.update_data_row_in_user_table(uuid, jsonb)',
    'public.update_field_metadata(uuid, text, boolean, integer, jsonb)',
    'public.update_user_table_config(uuid, jsonb, jsonb)',
    'public.update_user_table_default_sort(uuid, text, text)',
    'public.update_user_table_metadata(uuid, text, text, boolean, boolean)',
    'public.update_user_table_row_ordering(uuid, boolean, jsonb, text)'
    -- OLD-WRITE-DOORS-END
  ]::regprocedure[];
$$;

-- What every screen reads: is everything on the new system, since when, by whom.
create or replace function platform.final_switch_state()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
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
$$;

-- ── 2. READINESS OF EVERY ORGANIZATION, MEASURED NOW ────────────────────────────────────────────
-- One answer for the page and for the press. For every organization that still has an older table
-- or pick list, scopes, or a switch pressed: each unmet check of its own switches, sorted into what
-- copying again clears and what it cannot (named, so a person fixes it first). Plus the platform's
-- own checks: the cutover census, older things that belong to no organization, the scope screens
-- switch's code. And, after a run, the undo's plan per organization (what Switch back carries and
-- what it cannot).
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
  v_scopes_code := to_regprocedure('platform._final_switch_scopes_step(text, uuid, uuid)') is not null;
  v_platform := v_platform || jsonb_build_object(
    'key', 'scopes_seam_has_code', 'says', 'The scope and context screens switch has its code',
    'met', v_scopes_code,
    'detail', case when v_scopes_code
                   then 'The scope and context screens switch has its step; the final switch runs it for everyone.'
                   else 'The scope and context screens switch has no code yet: every scope screen, picker, tag and template still writes the current tables, and the agents'' write-back still goes to them. Lane SCOPES-WRITE-THROUGH is building it; the final switch waits for it.' end,
    'fix', 'Lane SCOPES-WRITE-THROUGH lands platform._final_switch_scopes_step.');
  if v_scopes_code and to_regprocedure('platform._final_switch_scopes_readiness()') is not null then
    execute 'select platform._final_switch_scopes_readiness()' into v_scopes;
    for c in select x from jsonb_array_elements(coalesce(v_scopes -> 'checks', '[]'::jsonb)) x loop
      v_platform := v_platform || jsonb_build_object(
        'key', 'scopes_' || coalesce(c ->> 'key', 'check'), 'says', c ->> 'says',
        'met', coalesce((c ->> 'met')::boolean, false), 'detail', c ->> 'detail',
        'fix', coalesce(c ->> 'fix', 'Lane SCOPES-WRITE-THROUGH.'));
    end loop;
  end if;

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

-- The door: platform administrators (in the admin lane) and the server read it.
create or replace function platform.final_switch_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
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
$$;

-- ── 3. THE PRESS ─────────────────────────────────────────────────────────────────────────────────
create or replace function platform._final_switch_person_refusal()
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  if auth.uid() is null or v_claims is null then
    return jsonb_build_object('reason', 'not_a_person',
      'says', 'The final switch is pressed by a platform administrator signed in on the Final switch page. A server, a script or a database connection cannot press it.');
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    return jsonb_build_object('reason', 'not_a_person',
      'says', 'The final switch is pressed by a platform administrator signed in on the Final switch page, not with a service key or a minted token.');
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    return jsonb_build_object('reason', 'not_from_the_screen',
      'says', 'The final switch is pressed from the Final switch page in a browser. This request did not come from a page.');
  elsif not public.is_admin() then
    return jsonb_build_object('reason', 'not_a_platform_admin',
      'says', 'Only a platform administrator presses the final switch, from Administration → Database → Final switch.');
  end if;
  return null;
end;
$$;

create or replace function platform._final_switch_record(
  p_direction text, p_outcome text, p_refusal text, p_says text, p_readiness jsonb, p_did jsonb, p_note text, p_id uuid)
returns void
language sql
set search_path to 'pg_catalog'
as $$
  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, did, note)
  values
    (p_id, 'final_switch', platform._final_switch_platform_org(), p_direction, p_outcome, p_refusal, p_says,
     auth.uid(), p_readiness, coalesce(p_did, '{}'::jsonb), p_note);
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

    -- 5. Scope and context screens (lane SCOPES-WRITE-THROUGH's step). Readiness refused without it.
    v_ts := clock_timestamp();
    if to_regprocedure('platform._final_switch_scopes_step(text, uuid, uuid)') is null then
      raise exception 'The scope and context screens switch has no code yet (lane SCOPES-WRITE-THROUGH).' using errcode = 'P0001';
    end if;
    execute 'select platform._final_switch_scopes_step($1, $2, $3)' into v_scopes using 'new', v_uid, v_run;
    v_timings := v_timings || jsonb_build_object('scopes_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6. The Data page for everyone, and the scope screens, on the platform organization.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'new', 'done', 'The Data page opens the new tables for everyone.', v_uid,
            jsonb_build_object('final_switch_run', v_run), v_note),
           ('scopes_screens', v_platform, 'new', 'done', 'The scope and context screens are on the new system for everyone.', v_uid,
            jsonb_build_object('final_switch_run', v_run, 'step', v_scopes), v_note);

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
    v_says := 'Nothing was changed: the final switch stopped part way and every organization was rolled back. ' || sqlerrm;
    perform platform._final_switch_record('new', 'refused', 'the_step_failed', v_says, v_ready,
      jsonb_build_object('copy_again', p_copy_again), p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

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

-- ── 4. THE ONE UNDO ──────────────────────────────────────────────────────────────────────────────
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
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x loop
      select string_agg(r, ', ') into v_roles
        from (values ('public', (v_d ->> 'public')::boolean), ('anon', (v_d ->> 'anon')::boolean),
                     ('authenticated', (v_d ->> 'authenticated')::boolean)) as t(r, had)
       where had;
      if v_roles is not null then
        execute format('grant execute on function %s to %s', v_d ->> 'door', v_roles);
      end if;
      if coalesce((v_d ->> 'service_role_added')::boolean, false) then
        execute format('revoke execute on function %s from service_role', v_d ->> 'door');
      end if;
    end loop;
    v_timings := v_timings || jsonb_build_object('doors_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6'. The Data page and the scope screens go back.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'old', 'done', 'The Data page opens the older list again.', v_uid,
            jsonb_build_object('final_switch_run', v_run, 'undoes', v_last.id), v_note),
           ('scopes_screens', v_platform, 'old', 'done', 'The scope and context screens are on the current system again.', v_uid,
            jsonb_build_object('final_switch_run', v_run, 'undoes', v_last.id), v_note);

    -- 5'. Scope and context screens back (their lane's step).
    if to_regprocedure('platform._final_switch_scopes_step(text, uuid, uuid)') is not null then
      execute 'select platform._final_switch_scopes_step($1, $2, $3)' using 'old', v_uid, v_run;
    end if;

    -- 4'. The platform values as they were.
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'values', '[]'::jsonb)) x loop
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
    v_says := 'Nothing was changed: the undo stopped part way and was rolled back whole. ' || sqlerrm;
    perform platform._final_switch_record('old', 'refused', 'the_step_failed', v_says, v_ready, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

  v_counts := jsonb_build_object(
    'data_tables_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'tables_unarchived'),
    'tables_unarchived', (select coalesce(sum((e ->> 'tables_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_tables', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'lists_unarchived', (select coalesce(sum((e ->> 'lists_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_lists', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'agent_context_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'context_press'),
    'doors_opened', jsonb_array_length(coalesce(v_last.did -> 'doors', '[]'::jsonb)),
    'carried_back', (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_array_elements(v_orgs) e, jsonb_array_elements_text(coalesce(e -> 'carried_back', '[]'::jsonb)) s));
  v_timings := v_timings || jsonb_build_object('total_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  v_says := format('Undid the final switch: %s organizations back on their older tables (%s tables and %s pick lists restored), agent context back for %s, %s older write doors open again, the Data page and the scope screens back.',
                   v_counts ->> 'data_tables_switched_back', v_counts ->> 'tables_unarchived', v_counts ->> 'lists_unarchived',
                   v_counts ->> 'agent_context_switched_back', v_counts ->> 'doors_opened')
            || coalesce(' ' || (select string_agg(s, ' ') from jsonb_array_elements_text(v_counts -> 'carried_back') s), '');

  perform platform._final_switch_record('old', 'done', null, v_says, v_ready,
    jsonb_build_object('undoes', v_last.id, 'organizations', v_orgs, 'counts', v_counts, 'timings', v_timings,
                       'accepted_not_carried', case when jsonb_array_length(v_not) > 0 then v_not end),
    p_note, v_run);
  return jsonb_build_object('ok', true, 'press_id', v_run, 'state', 'old', 'undoes', v_last.id, 'says', v_says,
                            'counts', v_counts, 'timings', v_timings);
end;
$$;

-- ── 5. THE PER-ORGANIZATION PRESS STEPS ASIDE WHILE THE FINAL SWITCH IS ON ──────────────────────
-- Everything switched at once goes back at once: an owner's Switch back on one organization would
-- leave it on the older tables while the platform says everything is new (and nothing may be born
-- older anywhere). Refused, with the sentence, unless the final switch itself is pressing or undoing.
CREATE OR REPLACE FUNCTION platform.cutover_seam_press(p_seam_key text, p_organization_id uuid, p_to text, p_note text DEFAULT NULL::text, p_accept_not_carried boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_role text;
  v_is_admin boolean;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_state text;
  v_back jsonb;
  v_ready jsonb;
  v_press uuid := gen_random_uuid();
  v_did jsonb;
  v_carry jsonb;
  v_refusal text;
  v_says text;
  v_done text;
begin
  -- Refusals that name no organization of the caller's are answered, never recorded.
  if p_organization_id is null or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null or v_claims is null then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page. A server, a script or a database connection cannot press it.';
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page, not with a service key or a minted token.';
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    v_refusal := 'not_from_the_screen';
    v_says := 'A switch is pressed from the organization''s settings page in a browser. This request did not come from a page.';
  end if;

  if v_refusal is null then
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
    end if;
    if v_role is distinct from 'owner' and not v_is_admin then
      v_refusal := 'not_an_owner';
      v_says := 'Only an owner of this organization can press this switch.';
    end if;
  end if;

  -- FINAL-SWITCH: while everything is switched at once, it goes back at once.
  if v_refusal is null and platform._final_switch_is_on()
     and coalesce(current_setting('app.final_switch_step', true), '') <> 'on' then
    v_refusal := 'final_switch_on';
    v_says := 'Every organization switched to the new system together with the final switch, so they switch back together too: Administration → Database → Final switch → Undo.';
  end if;

  if v_refusal is null then
    select * into s from platform.cutover_seam where seam_key = p_seam_key and retired_at is null;
    if s.seam_key is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_switch', 'says', format('There is no switch called %s.', p_seam_key));
    elsif p_to is null or p_to not in ('new', 'old') then
      v_refusal := 'bad_direction';
      v_says := 'A switch goes to the new system or back to the old one.';
    elsif s.press_kind <> 'owner_press' then
      v_refusal := 'not_pressed_here';
      v_says := case s.press_kind when 'already_switched' then 'This one is already on the new system.'
                  else 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.' end;
    end if;
  end if;

  if v_refusal is null then
    -- One press per seam per organization at a time.
    perform pg_advisory_xact_lock(hashtextextended('cutover_seam:' || p_seam_key || ':' || p_organization_id::text, 0));
    v_last := platform._cutover_seam_last_done(p_seam_key, p_organization_id);
    v_state := coalesce(v_last.direction, 'old');
    if v_state = p_to then
      v_refusal := 'already_there';
      v_says := case p_to when 'new' then 'This organization is already on the new system here.'
                          else 'This organization is already on the old system here.' end;
    elsif p_to = 'new' then
      v_ready := platform._cutover_seam_readiness(p_seam_key, p_organization_id);
      if not (v_ready ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready yet: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_ready -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      end if;
    else
      -- SWITCH BACK CARRIES (SWITCH-BACK-CARRIES): what the new tables gained since the switch goes
      -- into the older tables inside this press. What cannot go is named, and the press waits for the
      -- person to confirm leaving it in the new system.
      v_back := platform._cutover_seam_reverse_readiness(p_seam_key, p_organization_id);
      v_ready := v_back;
      if not (v_back ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready to switch back: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_back -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      elsif coalesce((v_back ->> 'needs_confirm')::boolean, false) and not coalesce(p_accept_not_carried, false) then
        v_refusal := 'confirm_not_carried';
        v_says := 'Switching back leaves these in the new system: '
          || (select string_agg(x, ' ') from jsonb_array_elements_text(v_back -> 'not_carried') x)
          || ' Confirm that they stay behind, then switch back.';
      end if;
    end if;
  end if;

  if v_refusal is not null then
    if p_seam_key in (select seam_key from platform.cutover_seam) then
      insert into platform.cutover_seam_press
        (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
      values
        (v_press, p_seam_key, p_organization_id,
         case when p_to in ('new', 'old') then p_to else 'new' end,
         'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press, 'readiness', v_ready);
  end if;

  begin
    v_did := platform._cutover_seam_apply(p_seam_key, p_organization_id, p_to, v_uid, v_press);
    if p_to = 'old' and p_seam_key = 'older_tables' then
      -- The older tables are back (unarchived above); now they take what the new ones gained.
      v_carry := platform._cutover_carry_back(p_organization_id, v_last, true, v_press, v_uid,
                                              coalesce(p_accept_not_carried, false));
      v_did := v_did || jsonb_build_object('carried_back', v_carry);
    end if;
  exception when others then
    v_refusal := 'the_step_failed';
    v_says := 'Nothing was changed: the switch stopped part way and was rolled back whole. ' || sqlerrm;
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
    values
      (v_press, p_seam_key, p_organization_id, p_to, 'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press);
  end;

  v_done := case p_to when 'new' then 'Switched to the new system.'
                 else concat_ws(' ', 'Switched back to the old system.',
                                (select string_agg(x, ' ') from jsonb_array_elements_text(v_carry -> 'says') x)) end;

  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
  values
    (v_press, p_seam_key, p_organization_id, p_to, 'done', v_done, v_uid, v_ready, v_did, p_note);

  return jsonb_build_object('ok', true, 'press_id', v_press, 'state', p_to, 'did', v_did, 'says', v_done);
end;
$function$;

-- ── 6. NOTHING NEW IS BORN IN THE OLDER STORE WHILE THE FINAL SWITCH IS ON ──────────────────────
CREATE OR REPLACE FUNCTION platform.older_tables_switched(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- FINAL-SWITCH: true for every organization while the final switch is on (an organization with no
  -- older table of its own, or one made after the press, makes its tables and lists in the store).
  select p_organization_id is not null
     and (coalesce((platform._cutover_seam_last_done('older_tables', p_organization_id)).direction, 'old') = 'new'
          or platform._final_switch_is_on());
$function$;

-- ── 7. THE SETTINGS CARD SAYS THE PLATFORM SWITCHES' REAL STATE ─────────────────────────────────
CREATE OR REPLACE FUNCTION platform.cutover_seams(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_is_admin boolean := false;
  v_role text;
  v_may boolean := false;
  v_may_detail text;
  v_out jsonb := '[]'::jsonb;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_latest platform.cutover_seam_press;
  v_ready jsonb;
  v_state text;
  v_back jsonb;
  v_final platform.cutover_seam_press;
  v_final_on boolean;
begin
  if p_organization_id is null
     or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours',
      'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null then
    -- No person: only the server's own key or a direct database connection may read.
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in to see this organization''s switches.');
    end if;
    v_may_detail := 'Only an owner of this organization, signed in on its settings page, can press a switch.';
  else
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours',
        'says', 'There is no organization with that id that you belong to.');
    end if;
    v_may := v_role = 'owner' or v_is_admin;
    v_may_detail := case when v_role = 'owner' then 'You are an owner of this organization.'
                         when v_is_admin then 'You are a platform admin.'
                         else 'Only an owner of this organization can press a switch.' end;
  end if;

  -- FINAL-SWITCH: while everything is switched at once, nothing here is pressed on its own.
  v_final := platform._final_switch_last();
  v_final_on := coalesce(v_final.direction, 'old') = 'new';
  if v_final_on then
    v_may_detail := 'Every organization switched to the new system together with the final switch; they switch back together from Administration → Database → Final switch.';
  end if;

  for s in select * from platform.cutover_seam where retired_at is null and seam_key <> 'final_switch' order by sort_order loop
    -- A platform switch's state lives on the platform organization, where the final switch records it.
    v_last := platform._cutover_seam_last_done(s.seam_key,
                case when s.press_kind = 'platform_switch' then s.organization_id else p_organization_id end);
    select p.* into v_latest from platform.cutover_seam_press p
     where p.seam_key = s.seam_key
       and p.organization_id = case when s.press_kind = 'platform_switch' then s.organization_id else p_organization_id end
     order by p.pressed_at desc, p.id limit 1;
    v_state := case when s.press_kind = 'already_switched' then 'new'
                    when v_last.id is null then 'old'
                    else v_last.direction end;
    v_ready := platform._cutover_seam_readiness(s.seam_key, p_organization_id);
    v_back := case when v_state = 'new' and s.press_kind = 'owner_press'
                   then platform._cutover_seam_reverse_readiness(s.seam_key, p_organization_id) end;

    v_out := v_out || jsonb_build_object(
      'key', s.seam_key,
      'title', s.title,
      'old_side', s.old_side,
      'new_side', s.new_side,
      'per_organization', s.per_organization,
      'press_kind', s.press_kind,
      'state', v_state,
      'flip_does', s.flip_does,
      'needs_first', s.needs_first,
      'reverse_does', s.reverse_does,
      'readiness', v_ready,
      'reverse_readiness', v_back,
      'may_flip', v_may and not v_final_on and s.press_kind = 'owner_press' and v_state = 'old' and (v_ready ->> 'ready')::boolean,
      'may_reverse', v_may and not v_final_on and s.press_kind = 'owner_press' and v_state = 'new'
                     and coalesce((v_back ->> 'ready')::boolean, false),
      'switched', case when v_last.id is null then null else jsonb_build_object(
          'direction', v_last.direction, 'at', v_last.pressed_at,
          'by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email) from auth.users u where u.id = v_last.pressed_by),
          'did', v_last.did) end,
      'last_press', case when v_latest.id is null then null else jsonb_build_object(
          'direction', v_latest.direction, 'outcome', v_latest.outcome, 'at', v_latest.pressed_at,
          'refusal', v_latest.refusal, 'says', v_latest.says) end);
  end loop;

  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'checked_at', now(),
                            'may_press', v_may, 'may_press_detail', v_may_detail, 'seams', v_out,
                            'final_switch', jsonb_build_object(
                              'state', coalesce(v_final.direction, 'old'), 'at', v_final.pressed_at,
                              'by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email) from auth.users u where u.id = v_final.pressed_by)));
end;
$function$;

-- ── 8. THE DOORS ─────────────────────────────────────────────────────────────────────────────────
-- Four doors a signed-in person calls; each takes no id (the platform's own state and switch).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, argument_rules)
select 'platform', x.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH)',
       x.reason, true, x.rules
  from (values
    ('platform.final_switch_state()', 'final_switch_state',
     'Takes no argument. Answers whether the final switch is on (the platform''s one state, when and by whom) and the two platform switches it turns; every screen that must land on the new page reads it (the /data home, the older list managers). Nothing about any row.',
     null::jsonb),
    ('platform.final_switch_readiness()', 'final_switch_readiness',
     'Takes no argument. Platform administrators only (public.is_admin(), the admin lane) or the server: every organization''s readiness for the final switch, with its names and counts. Anyone else is told not_a_platform_admin and sees nothing.',
     null::jsonb),
    ('platform.final_switch_press(text, jsonb)', 'final_switch_press',
     'Takes no id. The final switch itself: a platform administrator, signed in (authenticated with a session), from a page (an Origin), in the admin lane; everyone else is refused and the refusal recorded. It measures every organization''s readiness first and refuses while anything is not ready.',
     '{"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the press record", "position": 1}, "p_copy_again": {"type": "jsonb", "check": "the page''s Copy again report, kept on the press record as reported; the press measures readiness itself", "position": 2}}}'::jsonb),
    ('platform.final_switch_undo(text, boolean)', 'final_switch_undo',
     'Takes no id. The one undo of the final switch: the same person rules as the press; it reverses exactly the last run, in the same order backwards, and refuses while something cannot be carried back unless p_accept_not_carried confirms it.',
     '{"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the undo record", "position": 1}, "p_accept_not_carried": {"type": "boolean", "check": "true confirms what Switch back leaves in the new system; otherwise the undo is refused as confirm_not_carried, naming each thing", "position": 2}}}'::jsonb)
  ) as x(sig, fn, reason, rules)
  join pg_proc p on p.oid = x.sig::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- (anon never had these: the guard clears PUBLIC at a definer's birth.)
grant execute on function platform.final_switch_state() to authenticated;
grant execute on function platform.final_switch_readiness() to authenticated;
grant execute on function platform.final_switch_press(text, jsonb) to authenticated;
grant execute on function platform.final_switch_undo(text, boolean) to authenticated;
-- The private steps: no client reaches them.
revoke all on function platform._final_switch_readiness() from public, anon, authenticated;
revoke all on function platform._final_switch_person_refusal() from public, anon, authenticated;
revoke all on function platform._final_switch_record(text, text, text, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function platform._final_switch_last() from public, anon, authenticated;
revoke all on function platform._final_switch_is_on() from public, anon, authenticated;
revoke all on function platform._final_switch_platform_org() from public, anon, authenticated;
revoke all on function platform._final_switch_old_write_doors() from public, anon, authenticated;
