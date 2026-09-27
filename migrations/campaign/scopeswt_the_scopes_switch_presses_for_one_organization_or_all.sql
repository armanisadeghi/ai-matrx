-- chair-step: lane SCOPES-WRITE-THROUGH — the scopes switch (seam scopes_screens) gets its code. The seam becomes organization-level; platform._cutover_seam_apply sets custom/scopes_written_in_the_store (new: true; old: an explicit false); readiness asks the copy has every edit, the newest context parity run for the organization found no defect after its last change (platform.cutover_seam_measure, append-only, written only by platform.cutover_seam_measure_record over a server connection), and the scopes writers census fact; reverse readiness says both sides are equal at every save; the press and the read door take the state from custom.context_writer, and only a platform admin in the admin lane presses one organization (to test it). platform.cutover_seam_press_everyone presses every organization (or a named batch) at once through the same step, readiness and log, and undoes it. No organization is switched by this file.
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 238b739188fc1b305cdc9cbba3a4c1fcbd91f249f676c2eaf7f6db04a962f142
-- based-on: platform._cutover_seam_readiness(text, uuid) 8eeeb5c29d2c00950782ecd01b44dbc0d96dbe4ea7cfdb0d4634763d6d5a9a11
-- based-on: platform._cutover_seam_reverse_readiness(text, uuid) 5f74328377ad29b22285c3f2fd7efee614819200100603f3c79a90eab225cf17
-- based-on: platform.cutover_seam_press(text, uuid, text, text, boolean) cbc177e7a58f79f7f855f2eb73ee1165c85e0944d6589ab8e4b41cbb281a8855
-- based-on: platform.cutover_seams(uuid) f4a6922b1a02a2b69b5015f3647c7b029e61c7756f0c719cd9433d3a7f8d057f
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_the_scopes_switch_presses_for_one_organization_or_all_down.sql
-- window-class: function bodies, one new append-only table, new functions; one row of platform.cutover_seam updated. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. The final switch presses "Scope and context screens" for every organization in one
-- call and can undo it in one call; before that, a platform admin switches Harbor Dental Group alone
-- to test it, and the switch refuses until the context parity check has measured that organization.

-- ── 1. THE SEAM ROW: organization level, pressed for one organization (to test) or for all ────────
update platform.cutover_seam
   set per_organization = true,
       press_kind = 'owner_press',
       old_side = 'The current context tables (context.scope_types, scopes, context_items, context_item_values) are the writer; the record store keeps a copy that follows them.',
       new_side = 'The record store writes this organization''s scope types, scopes, context fields, values and tags; the current context tables are kept exact in the same step for every screen and server path that still reads them.',
       flip_does = 'Sets custom/scopes_written_in_the_store for the organization: every scope write goes into the record store in the same statement (its rules govern), values are written in the store first, and the copy stops following because there is nothing left to follow.',
       needs_first = 'The copy has every edit (no follow row waiting), the context parity check found no defect for this organization since its last change, and every place that writes scopes is listed.',
       reverse_does = 'Sets the switch back to off for the organization (never back to "not said", which for an organization born on the store would mean the store again). Nothing is lost: both sides are equal at every commit, and the copy follows the current tables again.',
       prerequisites = case when exists (select 1 from jsonb_array_elements(prerequisites) e where e ->> 'key' = 'writers_listed')
                            then prerequisites
                            else prerequisites || jsonb_build_array(jsonb_build_object(
                              'key', 'writers_listed', 'met', false, 'measured_by', 'census',
                              'says', 'Every place that writes scopes and context (web app, server, database) is listed and writes through the scope doors or the write-through.',
                              'evidence', 'Not measured yet: run the scopes writers census (matrx-frontend scripts/cutover-census/scopes-writers.ts --record).')) end
 where seam_key = 'scopes_screens';

-- ── 2. MEASUREMENTS PER ORGANIZATION (context parity), append-only ────────────────────────────────
create table if not exists platform.cutover_seam_measure (
  id uuid primary key default gen_random_uuid(),
  seam_key text not null,
  organization_id uuid not null,
  key text not null,
  met boolean not null,
  says text not null,
  detail jsonb not null default '{}'::jsonb,
  measured_by text not null,
  measured_at timestamptz not null default clock_timestamp()
);
create index if not exists cutover_seam_measure_latest on platform.cutover_seam_measure (seam_key, organization_id, key, measured_at desc);
comment on table platform.cutover_seam_measure is
  'SCOPES-WRITE-THROUGH: facts a script measures per organization for a switch (the context parity check for scopes_screens), append-only; the newest row per (seam, organization, key) is what readiness reads.';
alter table platform.cutover_seam_measure enable row level security;
revoke all on table platform.cutover_seam_measure from public, anon, authenticated;
grant select on table platform.cutover_seam_measure to service_role;

create or replace function platform._cutover_seam_measure_is_append_only()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'A measurement is history: it is never changed or removed. Record a new one.' using errcode = '42501';
end;
$function$;
drop trigger if exists cutover_seam_measure_is_append_only on platform.cutover_seam_measure;
create trigger cutover_seam_measure_is_append_only before update or delete on platform.cutover_seam_measure
  for each row execute function platform._cutover_seam_measure_is_append_only();

-- The one door a measuring script writes through (a direct connection or the server key; never a
-- signed-in person, exactly as platform.cutover_census_record).
create or replace function platform.cutover_seam_measure_record(p_seam text, p_organization_id uuid, p_key text, p_met boolean, p_says text, p_detail jsonb, p_measured_by text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'a switch''s measurement is recorded by its measuring script over the server''s own connection, never by a signed-in person'
      using errcode = '42501';
  end if;
  if not exists (select 1 from platform.cutover_seam s where s.seam_key = p_seam and s.retired_at is null) then
    raise exception 'there is no switch called %', p_seam using errcode = '22023';
  end if;
  if p_organization_id is null or p_key is null or p_met is null or coalesce(p_says, '') = '' or coalesce(p_measured_by, '') = '' then
    raise exception 'a measurement names its organization, what it measured, whether it was met, the sentence, and who measured it'
      using errcode = '22004';
  end if;
  insert into platform.cutover_seam_measure (seam_key, organization_id, key, met, says, detail, measured_by)
  values (p_seam, p_organization_id, p_key, p_met, p_says, coalesce(p_detail, '{}'::jsonb), p_measured_by)
  returning id into v_id;
  return v_id;
end;
$function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'cutover_seam_measure_record',
        'p_seam text, p_organization_id uuid, p_key text, p_met boolean, p_says text, p_detail jsonb, p_measured_by text',
        array['text'::regtype, 'uuid'::regtype, 'text'::regtype, 'boolean'::regtype, 'text'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
        'p_organization_id names the organization a measuring script measured; it is only written into the append-only measurement row, never read to open anything, and a NULL is refused (22004). A signed-in caller is refused 42501.',
        'scopeswt_the_scopes_switch_presses_for_one_organization_or_all.sql',
        'server_only: aidream scripts/context_parity.py --record over the server''s own database connection records one parity run per organization; no client ever calls it.',
        false, false)
on conflict do nothing;
revoke all on function platform.cutover_seam_measure_record(text, uuid, text, boolean, text, jsonb, text) from public, anon, authenticated;
grant execute on function platform.cutover_seam_measure_record(text, uuid, text, boolean, text, jsonb, text) to service_role;

CREATE OR REPLACE FUNCTION platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_t record;
  v_rekeyed jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_resynced jsonb := '[]'::jsonb;
  v_lists uuid[] := '{}';
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  elsif p_seam = 'scopes_screens' then
    -- SCOPES-WRITE-THROUGH: which system writes this organization's scopes. Both sides are equal at
    -- every commit, so either direction is the setting and nothing else.
    v_feature := 'custom'; v_key := 'scopes_written_in_the_store';
    select o.value into v_before from platform.knob_override o
     where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
       and o.scope_id = p_org and o.organization_id = p_org;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         case when p_to = 'new' then 'true'::jsonb else 'false'::jsonb end, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb),
                              'setting_now', p_to = 'new',
                              'writer_now', custom.context_writer(p_org));
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      -- THE COPY IS RE-SYNCED FROM THE OLDER TABLE FIRST (COPY-WRITABLE, chair ruling 2026-09-25):
      -- the older table is the truth at this moment, so every test edit people made on a copy is
      -- put back and every row they added is archived, with a log row per table. Then the flip.
      v_resynced := platform._cutover_copy_resync(p_org, p_press, p_actor);
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      -- PICK LISTS MOVE WITH THE TABLES (lane OLDER-DOORS-AFTER-SWITCH). The mover copied each
      -- older list into the store as a Table of choices under the same id; the press archives
      -- the older list with the same pointer (its copy refused if it is not there), so an
      -- organization never has a live older list beside its copy. Switch back restores them.
      for v_id in
        select l.id from workbench.udt_structured_lists l
         where l.organization_id = p_org and l.deleted_at is null
         order by l.id
      loop
        perform workbench.udt_structured_list_archive(v_id, v_id, v_note);
        v_lists := v_lists || v_id;
      end loop;
      -- "WHEN A ROW CHANGES, RUN AN AGENT" FOLLOWS THE TABLE (CUTOVER-PLAN D8). An automation on
      -- an older table listens for older row events, which stop the moment the table is archived;
      -- it is re-keyed to the copy's record events (same table id, same column keys — the mover
      -- keeps them; row.deleted becomes record.archived, the store's own word). Its config before
      -- is kept on the press and on the automation, so Switch back puts it back exactly.
      for v_t in
        select t.id, t.config from scheduler.sch_trigger t
         where t.organization_id = p_org and t.deleted_at is null and t.type = 'event'
           and t.config ->> 'entity_type' = 'user_table_row'
           and (t.config ->> 'table_id')::uuid = any (v_ids)
         order by t.id
         for update
      loop
        v_cfg := v_t.config
          || jsonb_build_object('entity_type', 'record:' || (v_t.config ->> 'table_id'))
          || case when v_t.config ? 'actions' then jsonb_build_object('actions', (
               select coalesce(jsonb_agg(distinct case a when 'row.deleted' then 'record.archived'
                                                     else regexp_replace(a, '^row\.', 'record.') end), '[]'::jsonb)
                 from jsonb_array_elements_text(v_t.config -> 'actions') a)) else '{}'::jsonb end;
        update scheduler.sch_trigger
           set config = v_cfg,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cutover_rekeyed',
                 jsonb_build_object('press', p_press, 'at', clock_timestamp(), 'config_before', v_t.config)),
               updated_at = now(), updated_by = p_actor
         where id = v_t.id;
        v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.id, 'config_before', v_t.config, 'config_now', v_cfg);
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'archived_lists', to_jsonb(v_lists),
                              'rekeyed', v_rekeyed,
                              'resynced', v_resynced,
                              'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
    -- The pick lists that press archived come back with them (lane OLDER-DOORS-AFTER-SWITCH).
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived_lists', '[]'::jsonb)))::uuid loop
      perform workbench.udt_structured_list_unarchive(v_id);
      v_lists := v_lists || v_id;
    end loop;
    -- Every automation the switch re-keyed listens to its older table again, exactly as before.
    for v_t in select * from jsonb_array_elements(coalesce(v_last.did -> 'rekeyed', '[]'::jsonb)) as r(x) loop
      update scheduler.sch_trigger
         set config = v_t.x -> 'config_before',
             metadata = coalesce(metadata, '{}'::jsonb) - 'cutover_rekeyed',
             updated_at = now(), updated_by = p_actor
       where id = (v_t.x ->> 'id')::uuid and deleted_at is null;
      v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.x ->> 'id', 'config_now', v_t.x -> 'config_before');
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'unarchived_lists', to_jsonb(v_lists),
                            'rekeyed_back', v_rekeyed,
                            'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    select count(*), count(t.id),
           coalesce(sum(greatest(
             (select count(*) from workbench.udt_structured_list_items i where i.list_id = l.id and i.deleted_at is null)
             - coalesce((select count(*) from custom.record c
                          where c.organization_id = l.organization_id and c.table_id = l.id
                            and c.data_class = 'record' and c.deleted_at is null), 0), 0)), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;
    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
    -- (2) PARITY: the newest context parity run for this organization found no defect, and nothing
    -- changed in its scopes after that run.
    declare
      m platform.cutover_seam_measure;
      v_changed timestamptz;
    begin
      select * into m from platform.cutover_seam_measure x
       where x.seam_key = 'scopes_screens' and x.organization_id = p_org and x.key = 'parity'
       order by x.measured_at desc limit 1;
      select greatest(
               (select max(t.updated_at) from context.scope_types t where t.organization_id = p_org),
               (select max(sc.updated_at) from context.scopes sc where sc.organization_id = p_org),
               (select max(i.updated_at) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = p_org),
               (select max(v.created_at) from context.context_item_values v join context.scopes sc on sc.id = v.scope_id where sc.organization_id = p_org))
        into v_changed;
      v_checks := v_checks || jsonb_build_object(
        'key', 'parity', 'says', 'Agents are handed the same context by both systems',
        'met', m.id is not null and m.met and (v_changed is null or m.measured_at >= v_changed),
        'measured_at', m.measured_at,
        'detail', case when m.id is null
                         then 'Not measured yet for this organization: uv run python scripts/context_parity.py --organization ' || p_org::text || ' --record (aidream).'
                       when not m.met then m.says
                       when v_changed is not null and m.measured_at < v_changed
                         then format('Measured %s, but this organization''s scopes changed after that (%s); measure again.', m.measured_at, v_changed)
                       else m.says end);
    end;
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_seam_reverse_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SWITCH-BACK-CARRIES: Switch back carries what the new tables gained since the switch into the
-- older tables itself (platform._cutover_carry_back, inside the press), so it no longer waits for
-- an operator's copy-back. This answers the PLAN — what will be carried and what cannot be — for
-- the dialog, and says when the person must first confirm leaving something behind.
declare
  v_last platform.cutover_seam_press;
  v_plan jsonb;
begin
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'scopes_screens' and custom.context_writer(p_org) <> 'store' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'on_new', 'says', 'This is on the new system', 'met', false,
                         'detail', 'There is nothing to switch back.')));
  end if;
  if p_seam <> 'scopes_screens' and (v_last.id is null or v_last.direction <> 'new') then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'on_new', 'says', 'This is on the new system', 'met', false,
                         'detail', 'There is nothing to switch back.')));
  end if;

  if p_seam = 'older_tables' then
    v_plan := platform._cutover_carry_back(p_org, v_last, false);
    return jsonb_build_object('ready', true, 'checked_at', now(),
      'carries', v_plan -> 'says', 'not_carried', v_plan -> 'not_carried',
      'needs_confirm', v_plan -> 'needs_confirm', 'born', v_plan -> 'born', 'plan', v_plan,
      'checks', jsonb_build_array(
        jsonb_build_object('key', 'carried_back', 'says', 'Switching back carries everything written in the new tables since the switch into the older tables',
          'met', true,
          'detail', (select string_agg(x, ' ') from jsonb_array_elements_text(v_plan -> 'says') x)))
        || case when (v_plan ->> 'needs_confirm')::boolean then jsonb_build_array(
             jsonb_build_object('key', 'not_carried', 'says', 'Some things made in the new system are not carried back',
               'met', true,
               'detail', (select string_agg(x, ' ') from jsonb_array_elements_text(v_plan -> 'not_carried') x)
                         || ' Switching back asks you to confirm leaving them in the new system.'))
           else '[]'::jsonb end);
  end if;

  if p_seam = 'scopes_screens' then
    return jsonb_build_object('ready', true, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'both_sides_equal', 'says', 'Both systems hold the same scopes at every save', 'met', true,
                         'detail', 'While the record store writes this organization''s scopes, the current context tables are written in the same step, so switching back loses nothing and the copy simply follows the current tables again.')));
  end if;

  return jsonb_build_object('ready', true, 'checked_at', now(), 'checks', jsonb_build_array(
    jsonb_build_object('key', 'nothing_written', 'says', 'Nothing is written on the new side of this switch', 'met', true,
                       'detail', 'Switching back leaves nothing behind.')));
end;
$function$;

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
    if p_seam_key = 'scopes_screens' then
      -- SCOPES-WRITE-THROUGH: the state is which system writes, never press history — an
      -- organization born after the switch was installed writes in the store with no press at all.
      v_state := case custom.context_writer(p_organization_id) when 'store' then 'new' else 'old' end;
      -- ONE ORGANIZATION IS SWITCHED HERE ONLY TO TEST IT (Arman, 2026-09-27: no organization-by-
      -- organization pressing; the final switch presses every organization at once).
      if not v_is_admin then
        v_refusal := 'not_pressed_here';
        v_says := 'The scope and context screens switch for every organization at once, in the final switch. A platform admin can switch one organization to test it.';
      end if;
    end if;
    if v_refusal is not null then
      null;
    elsif v_state = p_to then
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

  for s in select * from platform.cutover_seam where retired_at is null order by sort_order loop
    v_last := platform._cutover_seam_last_done(s.seam_key, p_organization_id);
    select p.* into v_latest from platform.cutover_seam_press p
     where p.seam_key = s.seam_key and p.organization_id = p_organization_id
     order by p.pressed_at desc, p.id limit 1;
    v_state := case when s.press_kind = 'already_switched' then 'new'
                    -- SCOPES-WRITE-THROUGH: which system writes, never press history.
                    when s.seam_key = 'scopes_screens'
                      then case custom.context_writer(p_organization_id) when 'store' then 'new' else 'old' end
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
      -- The scopes switch is pressed for everyone at once by the final switch; one organization is
      -- switched here only by a platform admin, to test it (Arman, 2026-09-27).
      'may_flip', v_may and s.press_kind = 'owner_press' and v_state = 'old' and (v_ready ->> 'ready')::boolean
                  and (s.seam_key <> 'scopes_screens' or v_is_admin),
      'may_reverse', v_may and s.press_kind = 'owner_press' and v_state = 'new'
                     and coalesce((v_back ->> 'ready')::boolean, false)
                     and (s.seam_key <> 'scopes_screens' or v_is_admin),
      'pressed_for_everyone', s.seam_key = 'scopes_screens',
      'switched', case when v_last.id is null then null else jsonb_build_object(
          'direction', v_last.direction, 'at', v_last.pressed_at,
          'by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email) from auth.users u where u.id = v_last.pressed_by),
          'did', v_last.did) end,
      'last_press', case when v_latest.id is null then null else jsonb_build_object(
          'direction', v_latest.direction, 'outcome', v_latest.outcome, 'at', v_latest.pressed_at,
          'refusal', v_latest.refusal, 'says', v_latest.says) end);
  end loop;

  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'checked_at', now(),
                            'may_press', v_may, 'may_press_detail', v_may_detail, 'seams', v_out);
end;
$function$;

-- ── 3. EVERY ORGANIZATION AT ONCE — the final switch's press, and its undo ─────────────────────────
-- A direct database connection (the final switch's window operator) or a signed-in platform admin.
-- Each organization is pressed through the same step, readiness and log as one press; the first
-- refusal stops the run and is named, and everything pressed before it stays pressed (each press is
-- its own recorded, reversible step). p_to = 'old' is the undo.
create or replace function platform.cutover_seam_press_everyone(p_seam_key text, p_to text, p_note text default null, p_dry_run boolean default false, p_organization_ids uuid[] default null, p_pressed_for uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := coalesce(auth.uid(), p_pressed_for);
  s platform.cutover_seam;
  o record;
  v_state text;
  v_ready jsonb;
  v_did jsonb;
  v_press uuid;
  v_done jsonb := '[]'::jsonb;
  v_already int := 0;
begin
  -- EVERY PRESS NAMES WHO. Over a direct connection the final switch names the person it runs for
  -- (a platform admin), exactly as a press from a page names the person signed in.
  if auth.uid() is null and (p_pressed_for is null or not exists (select 1 from admin.admins a where a.user_id = p_pressed_for)) then
    raise exception 'Switching every organization at once from a database connection names the platform admin it is pressed for (p_pressed_for).'
      using errcode = '22004';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only a platform admin, or the final switch over a direct database connection, switches every organization at once.'
      using errcode = '42501';
  end if;
  if v_uid is null and nullif(current_setting('request.jwt.claims', true), '') is not null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Switching every organization at once needs a signed-in platform admin or a direct database connection.'
      using errcode = '42501';
  end if;
  select * into s from platform.cutover_seam where seam_key = p_seam_key and retired_at is null;
  if s.seam_key is null then
    raise exception 'There is no switch called %.', p_seam_key using errcode = '22023';
  end if;
  if not s.per_organization or s.press_kind <> 'owner_press' then
    raise exception 'The switch % is not switched organization by organization.', p_seam_key using errcode = '22023';
  end if;
  if p_to is null or p_to not in ('new', 'old') then
    raise exception 'A switch goes to the new system or back to the old one.' using errcode = '22023';
  end if;

  -- Every organization, or the batch named (the final switch may press in batches; a suite names its own).
  for o in select x.id, x.name from iam.organizations x
            where p_organization_ids is null or x.id = any (p_organization_ids)
            order by x.created_at, x.id loop
    perform pg_advisory_xact_lock(hashtextextended('cutover_seam:' || p_seam_key || ':' || o.id::text, 0));
    v_state := case when p_seam_key = 'scopes_screens'
                      then case custom.context_writer(o.id) when 'store' then 'new' else 'old' end
                    else coalesce((platform._cutover_seam_last_done(p_seam_key, o.id)).direction, 'old') end;
    if v_state = p_to then
      v_already := v_already + 1;
      continue;
    end if;
    -- An organization whose record store is off stays on the old system, and says so.
    if p_seam_key = 'scopes_screens' and p_to = 'new' and not custom.store_is_open(o.id) then
      return jsonb_build_object('ok', false, 'stopped_at', o.id, 'organization', o.name,
        'says', format('%s has its record store switched off, so its scopes cannot be written there. Nothing after it was pressed.', o.name),
        'pressed', v_done, 'already', v_already);
    end if;
    v_ready := case when p_to = 'new' then platform._cutover_seam_readiness(p_seam_key, o.id)
                    else platform._cutover_seam_reverse_readiness(p_seam_key, o.id) end;
    if not coalesce((v_ready ->> 'ready')::boolean, false) then
      return jsonb_build_object('ok', false, 'stopped_at', o.id, 'organization', o.name,
        'says', format('%s is not ready: %s. Nothing after it was pressed.', o.name,
          (select string_agg(c ->> 'says' || ' — ' || coalesce(c ->> 'detail', ''), '; ')
             from jsonb_array_elements(v_ready -> 'checks') c where not (c ->> 'met')::boolean)),
        'readiness', v_ready, 'pressed', v_done, 'already', v_already);
    end if;
    if p_dry_run then
      v_done := v_done || jsonb_build_object('organization_id', o.id, 'organization', o.name, 'would', p_to);
      continue;
    end if;
    v_press := gen_random_uuid();
    v_did := platform._cutover_seam_apply(p_seam_key, o.id, p_to, v_uid, v_press);
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
    values (v_press, p_seam_key, o.id, p_to, 'done',
            case p_to when 'new' then 'Switched to the new system, with every organization at once.'
                      else 'Switched back to the old system, with every organization at once.' end,
            v_uid, v_ready, v_did || jsonb_build_object('everyone', true),
            coalesce(p_note, 'pressed for every organization at once'));
    v_done := v_done || jsonb_build_object('organization_id', o.id, 'organization', o.name, 'press_id', v_press);
  end loop;
  return jsonb_build_object('ok', true, 'seam', p_seam_key, 'to', p_to, 'dry_run', p_dry_run,
                            'pressed', v_done, 'pressed_count', jsonb_array_length(v_done), 'already', v_already);
end;
$function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, argument_rules)
values ('platform', 'cutover_seam_press_everyone', 'p_seam_key text, p_to text, p_note text, p_dry_run boolean, p_organization_ids uuid[], p_pressed_for uuid',
        array['text'::regtype, 'text'::regtype, 'text'::regtype, 'boolean'::regtype, 'uuid[]'::regtype, 'uuid'::regtype]::oid[],
        'The final switch: presses one per-organization switch for every organization at once (or undoes it), through the same step, readiness and log as platform.cutover_seam_press. A signed-in caller must be a platform admin (public.is_admin), refused 42501 otherwise; over a direct connection p_pressed_for must name a platform admin (admin.admins), who is recorded as the presser. p_organization_ids only narrows which organizations are pressed.',
        'scopeswt_the_scopes_switch_presses_for_one_organization_or_all.sql', true, false,
        jsonb_build_object('arguments', jsonb_build_object(
          'p_organization_ids', jsonb_build_object('foreign', jsonb_build_object('bounded', true, 'note', 'only narrows the batch; every caller is a platform admin, who may switch any organization')),
          'p_pressed_for', jsonb_build_object('foreign', jsonb_build_object('bounded', true, 'note', 'read only on a direct connection, and must be a platform admin (admin.admins); a signed-in caller is always recorded as themself')))))
on conflict do nothing;
grant execute on function platform.cutover_seam_press_everyone(text, text, text, boolean, uuid[], uuid) to authenticated, service_role;
