-- chair-step: lane MOVER-DELETIONS (chair brief 2026-09-26). Copying again (the mover rerun) never carried a REMOVAL from the older side into the copy: a row, a column or a pick-list choice deleted on the older table, a whole table or list archived there, or a share taken away stayed live on the copy and came back at the switch. ADDS platform.cutover_older_removal_rows(uuid,uuid[]), platform.cutover_older_removals(uuid,uuid[]) and platform.cutover_carry_removals(uuid,uuid[]) (the rerun's removal pass: the store's own archive doors, never a hard delete of a record); REPLACES platform._cutover_seam_readiness(text,uuid) (one more check, removals_carried, with copy_again_clears) and platform.cutover_copy_differences(uuid) (a copy-only share the mover carried and the older table took away is now cleared by the rerun). No row of any table is written by this file. No lock beyond the five function definitions.
-- based-on: platform._cutover_seam_readiness(text, uuid) 5f7297fcccfa3fb8784ce40c6bb4a04c8fb8e80b34a37a75631538f3f3ec1af6
-- based-on: platform.cutover_copy_differences(uuid) b033a0b3beee880e7185dda87f27ad904ad06d77eaa1c1f99904e15177c92241
-- lane: MOVER-DELETIONS
-- INVERSE: migrations/inverse/moverdeletions_copying_again_carries_what_the_older_side_removed_down.sql

-- ── 1. WHAT THE OLDER SIDE REMOVED THAT ITS COPY STILL HOLDS — one answer for the card, the press
-- and the mover. While an organization's Data tables switch is off the older tables are the truth,
-- and the older store removes things by deleting the row: a row (delete_data_row_from_user_table,
-- udt_bulk_write), a column (udt_delete_field), a list's choices (update_user_list rewrites every
-- choice under new ids), a share (the Share dialog). It archives a whole table or list. The mover's
-- rerun only ever ADDED, so every one of those stayed live on the copy and came back at the switch.
-- Each kind below is judged AS THE SWITCH WILL LEAVE THE COPY: a row a person touched while testing
-- is judged by the image the switch puts back (COPY-WRITABLE), a row a person made on the copy
-- while testing is the switch's to archive and is not counted.
--
--   row      a live copy row of a copied table whose older row is gone or archived
--   column   a live copy column of a copied table whose older column is gone or archived
--   choice   a live choice of a live older list's copy whose older choice is gone or archived
--            (an off-list value the mover ADDED as an option is not an older choice and is kept)
--   table    a live copy of an older table a person archived (not the switch)
--   list     a live copy of an older pick list a person archived or deleted (not the switch)
--   share    a person or the organization the mover shared the copy with (it records whom:
--            metadata.older_shares_seen) whose share on the older table is gone
--   *_back   the other direction: the rerun archived the copy's row / column / choice / table /
--            list because the older one was gone, and the older one is live again
create or replace function platform.cutover_older_removal_rows(p_org uuid, p_tables uuid[] default null)
 returns table (kind text, record_id uuid, table_id uuid, table_name text, what text, principal_kind text, kept_image boolean)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with truth as (
    -- The older tables are the truth only until the organization presses its switch.
    select (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new' as older_is_truth
  ), ev as (
    select e.record_id, e.created, e.pre_image
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), copied as (
    select d.id, coalesce(nullif(d.table_name, ''), 'Untitled table') as table_name
      from workbench.udt_datasets d
      join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table'
                          and t.deleted_at is null
                          and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and (p_tables is null or d.id = any (p_tables))
       and (select older_is_truth from truth)
  ), lists as (
    -- The live older lists whose copy is in the store: every one with a whole-organization run, and
    -- with a table run the lists its columns choose from.
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as table_name
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null
       and (select older_is_truth from truth)
       and (p_tables is null
            or exists (select 1 from custom.record f
                        where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                          and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                          and f.data -> 'config' ->> 'options_table_id' = l.id::text))
  )
  -- rows
  select 'row', r.id, c.id, c.table_name, 'row ' || left(r.id::text, 8), null::text,
         (ev.record_id is not null)
    from copied c
    join custom.record r on r.organization_id = p_org and r.table_id = c.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and not exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
  union all
  -- columns
  select 'column', f.id, c.id, c.table_name, 'the column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), null, false
    from copied c
    join custom.record f on f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = c.id::text
   where not exists (select 1 from ev where ev.record_id = f.id and ev.created)
     and not exists (select 1 from workbench.udt_dataset_fields o where o.id = f.id and o.deleted_at is null)
  union all
  -- choices
  select 'choice', r.id, l.id, l.table_name, 'the choice ' || coalesce(nullif(r.data ->> 'name', ''), left(r.id::text, 8)), null,
         (ev.record_id is not null)
    from lists l
    join custom.record r on r.organization_id = p_org and r.table_id = l.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and coalesce(r.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
     and not exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
  union all
  -- whole tables a person archived on the older side
  select 'table', t.id, t.id, coalesce(nullif(d.table_name, ''), 'Untitled table'), 'the whole table', null, false
    from workbench.udt_datasets d
    join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
   where p_tables is null and (select older_is_truth from truth)
     and d.organization_id = p_org and d.deleted_at is not null and not (coalesce(d.metadata, '{}'::jsonb) ? 'moved_to')
  union all
  -- whole lists a person archived or deleted on the older side
  select 'list', t.id, t.id, coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'), 'the whole list', null, false
    from custom.record t
   where p_tables is null and (select older_is_truth from truth)
     and t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     and not exists (select 1 from workbench.udt_structured_lists l
                      where l.id = t.id and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id)))
  union all
  -- shares the mover carried whose older share is gone
  select 'share', p.id, c.id, c.table_name,
         coalesce((select u.email from auth.users u where u.id = p.granted_to_user_id),
                  (select g.name from iam.organizations g where g.id = p.granted_to_organization_id), 'someone')
           || '''s share', case when p.granted_to_user_id is not null then 'person' else 'organization' end, false
    from copied c
    join custom.record t on t.organization_id = p_org and t.id = c.id and t.data_class = 'table'
    join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
                          and not coalesce(p.is_public, false)
   where jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'
     and t.metadata -> 'older_shares_seen' ? coalesce(p.granted_to_user_id, p.granted_to_organization_id)::text
     and not exists (select 1 from iam.permissions q
                      where q.resource_type = 'dataset' and q.resource_id = c.id and q.status = 'active'
                        and coalesce(q.granted_to_user_id, q.granted_to_organization_id)
                            = coalesce(p.granted_to_user_id, p.granted_to_organization_id))
  union all
  -- THE OTHER DIRECTION: what the rerun archived because the older one was gone, now live again.
  select r.metadata #>> '{removed_on_older,kind}' || '_back', r.id,
         case when r.data_class in ('table') then r.id
              when r.data_class = 'field' then nullif(r.data ->> 'entity_definition_id', '')::uuid
              else r.table_id end,
         null, coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''), left(r.id::text, 8)), null, false
    from custom.record r
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.deleted_at is not null
     and jsonb_typeof(r.metadata -> 'removed_on_older') = 'object'
     and (case r.metadata #>> '{removed_on_older,kind}'
            when 'row'    then exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
                               and (p_tables is null or r.table_id = any (p_tables))
                               and exists (select 1 from workbench.udt_datasets d where d.id = r.table_id and d.deleted_at is null)
            when 'column' then exists (select 1 from workbench.udt_dataset_fields o where o.id = r.id and o.deleted_at is null)
                               and (p_tables is null or r.data ->> 'entity_definition_id' = any (p_tables::text[]))
                               and exists (select 1 from workbench.udt_datasets d where d.id::text = r.data ->> 'entity_definition_id' and d.deleted_at is null)
            when 'choice' then exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
                               and exists (select 1 from workbench.udt_structured_lists l where l.id = r.table_id and l.deleted_at is null)
            when 'table'  then p_tables is null and exists (select 1 from workbench.udt_datasets d where d.id = r.id and d.deleted_at is null)
            when 'list'   then p_tables is null and exists (select 1 from workbench.udt_structured_lists l where l.id = r.id and l.deleted_at is null)
            else false end);
$function$;

comment on function platform.cutover_older_removal_rows(uuid, uuid[]) is
  'MOVER-DELETIONS: every removal on an older table or list (row, column, choice, whole table, whole list, a share the mover carried) that its copy in the store still holds, and every copy the rerun archived whose older original is live again (*_back). One answer for the Data tables card, the press and the mover rerun (platform.cutover_carry_removals).';

create or replace function platform.cutover_older_removals(p_org uuid, p_tables uuid[] default null)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with x as (select * from platform.cutover_older_removal_rows(p_org, p_tables))
  select jsonb_build_object(
    'count',   (select count(*) from x where kind <> 'share'),
    'clears',  (select count(*) from x where kind <> 'share'),
    'shares',  (select count(*) from x where kind = 'share'),
    'by_kind', coalesce((select jsonb_object_agg(k, n) from (select kind as k, count(*) as n from x group by kind) g), '{}'::jsonb),
    'examples', coalesce((select jsonb_agg(e.says) from (
        select format('%s: %s', coalesce(x.table_name, 'a table'),
                      case when x.kind like '%\_back' escape '\'
                           then x.what || ' is back on the older side and archived on the copy'
                           when x.kind in ('table', 'list') then x.what || ' is archived on the older side and live on the copy'
                           else x.what || ' was removed on the older side and is still on the copy' end) as says
          from x where x.kind <> 'share' order by x.table_name, x.kind, x.what limit 5) e), '[]'::jsonb));
$function$;

comment on function platform.cutover_older_removals(uuid, uuid[]) is
  'MOVER-DELETIONS: the count, per kind, of platform.cutover_older_removal_rows (shares apart: the shares check counts those), with five examples in words. Read by platform._cutover_seam_readiness (check removals_carried).';

-- ── 2. THE RERUN CARRIES THEM, THROUGH THE STORE'S OWN DOORS, NEVER A HARD DELETE OF A RECORD.
-- A row or choice: custom.record_delete (the store's archive; restorable). A column:
-- custom.field_retire. A whole table or list: custom.record_delete of the Table (its rows, fields and
-- views go with it as one archive event, restorable as one). A row a person touched while testing:
-- only the image the switch puts back is archived; what they see stays until the switch.
-- A share: custom.share_revoke, the Share dialog's own door, which removes the grant row — the
-- permission rows have no archived state the access ladder honours (iam.accessible_entity_ids and
-- custom.share_access admit any status but 'rejected'), so an "archived" grant would still open the
-- copy. What was taken back is kept on the copy's Table record (metadata.shares_taken_back), in full.
-- The *_back kinds restore (custom.record_restore / custom.field_restore).
-- Every step runs under its own savepoint; a refusal is named in the store's words and the rest go on.
-- Finally each copied table records whom its older table shares with (metadata.older_shares_seen),
-- so the next run can tell a share the older table took away from one a person added on the copy.
-- Runs as the store owner (the mover's connection): the copy fence lets that writer, and only it,
-- write a copy while its older table is the truth.
create or replace function platform.cutover_carry_removals(p_org uuid, p_tables uuid[] default null)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_r       record;
  v_done    jsonb := '{}'::jsonb;
  v_refused text[] := '{}';
  v_at      timestamptz := clock_timestamp();
  v_mark    jsonb;
  v_grant   jsonb;
  v_n       integer := 0;
begin
  for v_r in select * from platform.cutover_older_removal_rows(p_org, p_tables)
              order by case when kind like '%\_back' escape '\' then 1 when kind in ('table', 'list') then 2 else 3 end, table_name, kind, record_id
  loop
    begin
      v_mark := jsonb_build_object('removed_on_older', jsonb_build_object(
                  'kind', v_r.kind, 'at', v_at,
                  'why', 'removed on the older side while it was the truth; copying again archived it here (lane MOVER-DELETIONS)'));
      if v_r.kind in ('row', 'choice') and v_r.kept_image then
        update platform.cutover_evaluation_write e
           set pre_image = jsonb_set(jsonb_set(e.pre_image, '{deleted_at}', to_jsonb(v_at)),
                                     '{metadata}', coalesce(e.pre_image -> 'metadata', '{}'::jsonb) || v_mark)
         where e.organization_id = p_org and e.record_id = v_r.record_id and e.replaced_at is null and not e.created;
      elsif v_r.kind in ('row', 'choice', 'table', 'list') then
        -- A table or list that is somebody's home is archived with what it holds, as one event.
        if exists (select 1 from custom.record x where x.organization_id = p_org and x.id = v_r.record_id and x.deleted_at is null) then
          perform custom.record_delete(p_org, v_r.record_id);
        end if;
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind = 'column' then
        perform custom.field_retire(p_org, v_r.record_id);
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind = 'share' then
        select to_jsonb(p) into v_grant from iam.permissions p where p.id = v_r.record_id;
        perform custom.share_revoke(p_org, v_r.table_id, v_r.principal_kind,
                                    coalesce((v_grant ->> 'granted_to_user_id')::uuid, (v_grant ->> 'granted_to_organization_id')::uuid));
        update custom.record
           set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{shares_taken_back}',
                                    coalesce(metadata -> 'shares_taken_back', '[]'::jsonb)
                                    || jsonb_build_array(v_grant || jsonb_build_object('taken_back_at', v_at,
                                         'why', 'the older table no longer shares with them (lane MOVER-DELETIONS)')))
         where organization_id = p_org and id = v_r.table_id and data_class = 'table';
      elsif v_r.kind = 'column_back' then
        perform custom.field_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind like '%\_back' escape '\' then
        perform custom.record_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      end if;
      v_done := jsonb_set(v_done, array[v_r.kind], to_jsonb(coalesce((v_done ->> v_r.kind)::int, 0) + 1));
    exception when others then
      v_refused := v_refused || format('%s — %s: %s', coalesce(v_r.table_name, 'a table'), v_r.what, sqlerrm);
    end;
  end loop;

  -- Whom each copied table's older table shares with, now: what the next run compares against.
  update custom.record t
     set metadata = jsonb_set(coalesce(t.metadata, '{}'::jsonb), '{older_shares_seen}', coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb))
    from workbench.udt_datasets d
   where t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
     and d.organization_id = p_org and d.deleted_at is null
     and (p_tables is null or d.id = any (p_tables))
     and (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new'
     and t.metadata -> 'older_shares_seen' is distinct from coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb);
  get diagnostics v_n = row_count;

  return jsonb_build_object('carried', v_done, 'refused', to_jsonb(v_refused), 'share_marks', v_n, 'at', v_at);
end;
$function$;

comment on function platform.cutover_carry_removals(uuid, uuid[]) is
  'MOVER-DELETIONS: the mover rerun''s removal pass. Archives on the copy, through the store''s own doors, everything platform.cutover_older_removal_rows names (restores the *_back kinds), keeps a person''s test image instead of their visible row, takes back a share the mover carried whose older share is gone (custom.share_revoke; the grant kept on the Table record), and records whom each older table shares with. Store-owner connection only.';

revoke all on function platform.cutover_older_removal_rows(uuid, uuid[]) from public, anon, authenticated;
revoke all on function platform.cutover_older_removals(uuid, uuid[]) from public, anon, authenticated;
revoke all on function platform.cutover_carry_removals(uuid, uuid[]) from public, anon, authenticated;
grant execute on function platform.cutover_older_removal_rows(uuid, uuid[]) to service_role;
grant execute on function platform.cutover_older_removals(uuid, uuid[]) to service_role;
grant execute on function platform.cutover_carry_removals(uuid, uuid[]) to service_role;

-- ── 3. THE CARD AND THE PRESS COUNT THEM (readiness check removals_carried).
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
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too.'
                     else format('%s %s removed on the older side %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
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

-- ── 4. A SHARE THE MOVER CARRIED AND THE OLDER TABLE TOOK AWAY IS CLEARED BY THE RERUN.
CREATE OR REPLACE FUNCTION platform.cutover_copy_differences(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_palette  text[] := custom.decoration_colors();
  v_colours  jsonb;
  v_formats  jsonb;
  v_shares   jsonb;
  v_checks   jsonb := '[]'::jsonb;
  v_judged   integer := 0;
  v_cap      constant integer := 400;
  v_t        record;
  v_w        record;
  v_fields   custom.record[];
  v_judge    custom.record[];
  v_doc      jsonb;
  v_msg      text;
  v_seen     text[] := '{}';
  v_perm     boolean;
  v_relaxed  custom.record[];
  v_lists    text[];
  v_clears   boolean;
begin
  -- A. COLOURS — every colour the older SCREEN paints (the store's seven; the older grid's
  -- isStyleColor drops any other word, so a stored "purple" was never shown and is not compared),
  -- keyed as the store keys them (Field id for a column), against every colour the copy paints.
  with copies as (
    select d.id, d.table_name, d.metadata -> 'style' as style,
           coalesce(ev.pre_image -> 'data' -> 'decorations', r.data -> 'decorations', '{}'::jsonb) as deco
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = d.id
                          and ev.replaced_at is null and not ev.created
     where d.organization_id = p_org and d.deleted_at is null
  ), cols as (
    select f.table_id, f.field_name, f.display_name, f.id::text as fid, cf.data ->> 'key' as key
      from workbench.udt_dataset_fields f
      join copies c on c.id = f.table_id
      left join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.deleted_at is null
  ), older_leaves as (
    select c.id as t, 'row ' || left(x.key, 8) as what, array['rows', x.key] as path, to_jsonb(x.value) as val
      from copies c cross join lateral jsonb_each_text(case when jsonb_typeof(c.style -> 'rows') = 'object' then c.style -> 'rows' else '{}' end) x
     where x.value = any (v_palette)
    union all
    select c.id, 'column ' || coalesce(k.display_name, x.key), array['columns', k.fid], to_jsonb(x.value)
      from copies c cross join lateral jsonb_each_text(case when jsonb_typeof(c.style -> 'columns') = 'object' then c.style -> 'columns' else '{}' end) x
      join cols k on k.table_id = c.id and (k.field_name = x.key or k.key = x.key)
     where x.value = any (v_palette)
    union all
    select c.id, 'cell ' || left(rw.key, 8) || ' · ' || coalesce(k.display_name, x.key), array['cells', rw.key, k.fid], to_jsonb(x.value)
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.style -> 'cells') = 'object' then c.style -> 'cells' else '{}' end) rw
           cross join lateral jsonb_each_text(case when jsonb_typeof(rw.value) = 'object' then rw.value else '{}' end) x
      join cols k on k.table_id = c.id and (k.field_name = x.key or k.key = x.key)
     where x.value = any (v_palette)
    union all
    select c.id, 'colour by', array['color_by'],
           jsonb_build_object('field', k.fid, 'target', coalesce(coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'target', 'row'))
      from copies c
      join cols k on k.table_id = c.id
                 and (k.field_name = coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'field'
                      or k.key = coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'field')
    union all
    select c.id, 'colour rules', array['rules'],
           jsonb_agg(ru.value || jsonb_build_object('field', k.fid) order by ru.ordinality)
      from copies c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.style -> 'rules') = 'array' then c.style -> 'rules' else '[]' end) with ordinality ru
      join cols k on k.table_id = c.id and (k.field_name = ru.value ->> 'field' or k.key = ru.value ->> 'field')
     group by c.id
  ), copy_leaves as (
    select c.id as t, array['rows', x.key] as path, x.value as val
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'rows') = 'object' then c.deco -> 'rows' else '{}' end) x
    union all
    select c.id, array['columns', x.key], x.value
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'columns') = 'object' then c.deco -> 'columns' else '{}' end) x
    union all
    select c.id, array['cells', rw.key, x.key], x.value
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'cells') = 'object' then c.deco -> 'cells' else '{}' end) rw
           cross join lateral jsonb_each(case when jsonb_typeof(rw.value) = 'object' then rw.value else '{}' end) x
    union all
    select c.id, array['color_by'], c.deco -> 'color_by' from copies c
     where jsonb_typeof(c.deco -> 'color_by') = 'object'
    union all
    select c.id, array['rules'], c.deco -> 'rules' from copies c
     where jsonb_typeof(c.deco -> 'rules') = 'array' and jsonb_array_length(c.deco -> 'rules') > 0
  ), diff as (
    select coalesce(o.t, cl.t) as t,
           coalesce(o.what, case cl.path[1] when 'rows' then 'row ' || left(cl.path[2], 8)
                                            when 'columns' then 'column ' || coalesce((select k.display_name from cols k where k.fid = cl.path[2]), 'a column')
                                            when 'cells' then 'cell ' || left(cl.path[2], 8) || ' · ' || coalesce((select k.display_name from cols k where k.fid = cl.path[3]), 'a column')
                                            when 'color_by' then 'colour by' else 'colour rules' end) as what,
           o.val as older, cl.val as copy
      from older_leaves o
      full join copy_leaves cl on cl.t = o.t and cl.path = o.path
     where o.val is distinct from cl.val
  )
  select jsonb_build_object(
           'count', count(*),
           -- MOVER-CARRY-TAILS: while the older table is the truth a rerun makes the copy paint what the
           -- older table paints (attributes._carry_decorations), so every colour difference clears.
           'clears', count(*),
           'leaves', '[]'::jsonb,
           'tables', count(distinct d.t),
           'examples', coalesce((select jsonb_agg(e.says) from (
               select format('%s: %s is %s on the older table and %s on the copy',
                             c.table_name, d2.what,
                             case when d2.older is null then 'not coloured' when jsonb_typeof(d2.older) = 'string' then d2.older #>> '{}' else 'set' end,
                             case when d2.copy is null then 'not coloured' when jsonb_typeof(d2.copy) = 'string' then d2.copy #>> '{}' else 'set differently' end) as says
                 from diff d2 join copies c on c.id = d2.t
                order by c.table_name, d2.what limit 5) e), '[]'::jsonb))
    into v_colours
    from diff d;

  -- B. FORMATS — what each older column MEANS (metadata.format) is what its copy enforces
  -- (`format`) or draws (`display_format`). A column with no copy at all is named too.
  with copies as (
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
  ), diff as (
    select c.table_name, coalesce(f.display_name, f.field_name) as col, f.metadata -> 'format' ->> 'id' as older,
           case when cf.id is null then null
                else coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'format',
                              coalesce(ev.pre_image -> 'data', cf.data) -> 'display_format' ->> 'id') end as copy,
           cf.id is null as missing,
           -- MOVER-CARRY-TAILS: the rerun follows the older column's format only where the column keeps
           -- its KIND (attributes._follow_the_older_format: the store type the older column declares
           -- equals the copy's); a format that changes the kind would convert every cell and is left.
           cf.id is null
             or case f.metadata -> 'format' ->> 'id'
                  when 'choice' then 'list' when 'multi_choice' then 'list'
                  when 'relation' then 'relation' when 'person' then 'relation' when 'attachment' then 'relation'
                  when 'formula' then 'formula'
                  else case f.data_type::text when 'number' then 'range' when 'integer' then 'range'
                                              when 'date' then 'range' when 'datetime' then 'range'
                                              when 'boolean' then 'boolean' else 'text' end
                end = coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'type', '') as clears
      from workbench.udt_dataset_fields f
      join copies c on c.id = f.table_id
      left join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field' and cf.deleted_at is null
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = f.id
                          and ev.replaced_at is null and not ev.created
     where f.deleted_at is null
       and (cf.id is null
            or (nullif(f.metadata -> 'format' ->> 'id', '') is not null
                and f.metadata -> 'format' ->> 'id' is distinct from coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'format', '')
                and f.metadata -> 'format' ->> 'id' is distinct from coalesce(coalesce(ev.pre_image -> 'data', cf.data) -> 'display_format' ->> 'id', '')))
  )
  select jsonb_build_object(
           'count', count(*),
           'clears', count(*) filter (where clears),
           'examples', coalesce((select jsonb_agg(e.says) from (
               select case when d2.missing then format('%s: the column %s is not on the copy', d2.table_name, d2.col)
                           else format('%s: %s is formatted as %s on the older table and %s on the copy', d2.table_name, d2.col,
                                       d2.older, coalesce('as ' || d2.copy, 'has no format')) end as says
                 from diff d2 order by d2.table_name, d2.col limit 5) e), '[]'::jsonb),
           'leaves', coalesce((select jsonb_agg(e.says) from (
               select format('%s: %s is formatted as %s on the older table and %s on the copy, a different kind of column — set the format back on the older table, or set it on the copy after the switch',
                             d2.table_name, d2.col, d2.older, coalesce('as ' || d2.copy, 'has no format')) as says
                 from diff d2 where not d2.clears order by d2.table_name, d2.col limit 5) e), '[]'::jsonb))
    into v_formats
    from diff;

  -- C. SHARES — each older share (iam.permissions on the dataset) is the same person or
  -- organization at the same level on the copy (a record grant, or for someone outside the
  -- organization an outside invitation they hold); a public older share has no copy (a public
  -- link is its own product); and nobody holds the copy who does not hold the older table.
  with copies as (
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
  ), older as (
    select c.id, c.table_name, p.is_public, p.permission_level::text as lvl,
           coalesce(p.granted_to_user_id, p.granted_to_organization_id) as who, p.granted_to_user_id as person
      from copies c
      join iam.permissions p on p.resource_type = 'dataset' and p.resource_id = c.id and p.status = 'active'
  ), newer as (
    select c.id, c.table_name, p.permission_level::text as lvl,
           coalesce(p.granted_to_user_id, p.granted_to_organization_id) as who
      from copies c
      join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
     where not coalesce(p.is_public, false)
  ), diff as (
    -- MOVER-CARRY-TAILS: each difference says whether copying again clears it and, where it does not,
    -- what does (attributes._carry_shares: a missing share for a member or the organization itself is
    -- granted; a public link, a level that differs, a share only the copy has, a person outside the
    -- organization — the grant would contact them — and another organization are not).
    select o.table_name, format('it is shared publicly on the older table, and a public link does not carry to the copy') as says,
           false as clears, 'make a share link for the copy on its Share if it should stay public' as instead
      from older o where coalesce(o.is_public, false)
    union all
    select o.table_name,
           format('%s holds the older table as %s and %s on the copy',
                  coalesce((select u.email from auth.users u where u.id = o.who),
                           (select g.name from iam.organizations g where g.id = o.who), 'someone'),
                  o.lvl, coalesce('as ' || n.lvl, 'nothing')),
           n.lvl is null and (o.who = p_org
                              or (o.person is not null and exists (select 1 from iam.organization_member m
                                                                    where m.organization_id = p_org and m.user_id = o.person))),
           case when n.lvl is not null then 'set their level on the copy''s Share'
                when o.person is not null then 'share the copy with them from its Share — that sends them an email, so copying again does not'
                else 'another organization cannot hold the copy; share it with that organization''s people from the copy''s Share' end
      from older o
      left join newer n on n.id = o.id and n.who = o.who
     where not coalesce(o.is_public, false)
       and n.lvl is distinct from o.lvl
       and not exists (select 1 from iam.invitations i
                        where i.target_type = 'custom_table' and i.target_id = o.id and i.deleted_at is null
                          and i.status in ('pending', 'accepted') and i.role = o.lvl
                          and (i.invited_user_id = o.person
                               or lower(i.email) = (select lower(u.email) from auth.users u where u.id = o.person)))
    union all
    select n.table_name,
           format('%s holds the copy as %s and has no share on the older table',
                  coalesce((select u.email from auth.users u where u.id = n.who),
                           (select g.name from iam.organizations g where g.id = n.who), 'someone'), n.lvl),
           -- MOVER-DELETIONS: a share the mover carried (the copy's Table records whom its older table
           -- shared with, metadata.older_shares_seen) that the older table has since taken away is taken
           -- back by the rerun (platform.cutover_carry_removals); one a person added on the copy is not.
           coalesce((select t.metadata -> 'older_shares_seen' ? n.who::text
                       from custom.record t
                      where t.organization_id = p_org and t.id = n.id and t.data_class = 'table'
                        and jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'), false),
           'take it off the copy''s Share, or share the older table the same way'
      from newer n
     where not exists (select 1 from older o where o.id = n.id and o.who = n.who)
  )
  select jsonb_build_object(
           'count', count(*),
           'clears', count(*) filter (where clears),
           'examples', coalesce((select jsonb_agg(e.x) from (
               select d2.table_name || ': ' || d2.says as x from diff d2 order by 1 limit 5) e), '[]'::jsonb),
           'leaves', coalesce((select jsonb_agg(e.x) from (
               select d2.table_name || ': ' || d2.says || ' — ' || d2.instead as x from diff d2 where not d2.clears order by 1 limit 5) e), '[]'::jsonb))
    into v_shares
    from diff;

  -- D. CHECKS — would the copy REFUSE what the older table takes? The older table's writes of the
  -- last 30 days (its history) and every row edited after its copy are put, as the writer sent
  -- them, through the copy's own judge (custom.validate_values) — after the conversions the mover
  -- makes (a number held as numeric text, a one-item list, a yes/no word, a number in a words
  -- column), so only a value no conversion rescues is named: words in a date column, a technician
  -- "R" under "at least 2 characters", a blank in a required column, a choice off a closed list.
  -- Formula and relation columns are the store's to compute and to resolve and are not judged.
  for v_t in
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
     order by d.table_name
  loop
    exit when v_judged >= v_cap;
    select coalesce(d.validation_mode::text, 'permissive') <> 'strict' into v_perm
      from workbench.udt_datasets d where d.id = v_t.id;
    select array_agg(case when ev.pre_image is not null
                          then jsonb_populate_record(null::custom.record, to_jsonb(cf) || jsonb_build_object('data', ev.pre_image -> 'data'))
                          else cf end)
      into v_fields
      from custom.record cf
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = cf.id
                          and ev.replaced_at is null and not ev.created
     where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
       and cf.data ->> 'entity_definition_id' = v_t.id::text
       and coalesce(cf.data ->> 'type', '') not in ('formula', 'relation');
    continue when v_fields is null;

    for v_w in
      (select x.data, x.prior, x.whole, x.at from (
         -- A row edited in the older table after its copy: the rerun must land it WHOLE.
         select w.data, null::jsonb as prior, true as whole, w.updated_at as at
           from workbench.udt_dataset_rows w
           left join custom.record r on r.organization_id = p_org and r.id = w.id
          where w.table_id = v_t.id and w.deleted_at is null
            and (r.id is null or w.updated_at > r.updated_at)
         union all
         -- A write of the last 30 days: only what the writer CHANGED is judged, as it was sent.
         select v.data, coalesce(v.prior_data, '{}'::jsonb), false, v.changed_at
           from workbench.udt_dataset_row_versions v
          where v.table_id = v_t.id and v.changed_at > now() - interval '30 days' and v.data is not null
       ) x order by x.at desc limit greatest(v_cap - v_judged, 0))
    loop
      v_judged := v_judged + 1;
      select coalesce(array_agg(cf), '{}'::custom.record[]),
             coalesce(jsonb_object_agg(cf.data ->> 'key',
               case
                 when val is null or jsonb_typeof(val) = 'null' then val
                 when cf.data ->> 'type' = 'text' and jsonb_typeof(val) in ('object', 'array') and not coalesce((cf.data ->> 'multi')::boolean, false)
                   then to_jsonb(val::text)
                 when coalesce((cf.data ->> 'multi')::boolean, false) and jsonb_typeof(val) <> 'array' then jsonb_build_array(val)
                 when not coalesce((cf.data ->> 'multi')::boolean, false) and jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 1 then val -> 0
                 when cf.data ->> 'type' = 'range' and coalesce(cf.data -> 'config' ->> 'kind', 'number') not in ('date', 'datetime')
                      and jsonb_typeof(val) = 'string' and btrim(val #>> '{}') ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$|^-?\.[0-9]+$'
                   then to_jsonb(replace(btrim(val #>> '{}'), ',', '')::numeric)
                 when cf.data ->> 'type' = 'boolean' and jsonb_typeof(val) = 'string' and lower(btrim(val #>> '{}')) in ('true', 'false')
                   then to_jsonb(lower(btrim(val #>> '{}')) = 'true')
                 when cf.data ->> 'type' = 'text' and jsonb_typeof(val) in ('number', 'boolean') then to_jsonb(val #>> '{}')
                 else val end) filter (where cf.id is not null), '{}'::jsonb)
        into v_judge, v_doc
        from unnest(v_fields) cf
        join workbench.udt_dataset_fields f on f.id = cf.id
        cross join lateral (select v_w.data -> f.field_name as val) z
       where v_w.whole or (v_w.data -> f.field_name) is distinct from (v_w.prior -> f.field_name);
      continue when cardinality(v_judge) = 0;
      begin
        perform custom.validate_values(p_org, v_judge, v_doc, null);
      exception when sqlstate '23514' then
        get stacked diagnostics v_msg = message_text;
        if not ((v_t.table_name || ': ' || v_msg) = any (v_seen)) then
          v_seen := v_seen || (v_t.table_name || ': ' || v_msg);
          -- MOVER-CARRY-TAILS: would copying again clear it? Judge the same write again as the rerun
          -- leaves the copy: on a permissive older table a check its own values break comes off
          -- (attributes._take_off_unenforced_checks), and every choice the older table holds becomes
          -- an option of the column (user_tables: off-list cells are ADDED to the option set). A
          -- required blank, words in a date column and the rest are still refused: not cleared.
          v_relaxed := null; v_lists := null;
          select array_agg(case when v_perm
                                then jsonb_populate_record(null::custom.record, to_jsonb(j) || jsonb_build_object('data', j.data || jsonb_build_object('rules', '[]'::jsonb)))
                                else j end) filter (where coalesce(j.data ->> 'type', '') <> 'list'),
                 array_agg(j.data ->> 'key') filter (where coalesce(j.data ->> 'type', '') = 'list')
            into v_relaxed, v_lists
            from unnest(v_judge) j;
          v_clears := true;
          if cardinality(coalesce(v_relaxed, '{}'::custom.record[])) > 0 then
            begin
              perform custom.validate_values(p_org, v_relaxed, v_doc - coalesce(v_lists, '{}'::text[]), null);
            exception when sqlstate '23514' then
              v_clears := false;
            end;
          end if;
          v_checks := v_checks || jsonb_build_object('table', v_t.table_name, 'says', v_msg, 'at', v_w.at, 'clears', v_clears);
        end if;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'organization_id', p_org,
    'colours',  v_colours,
    'formats',  v_formats,
    'shares',   v_shares,
    'checks',   jsonb_build_object(
                  'count', jsonb_array_length(v_checks),
                  'clears', (select count(*) from jsonb_array_elements(v_checks) c where (c ->> 'clears')::boolean),
                  'leaves', coalesce((select jsonb_agg(e.x) from (
                      select (c ->> 'table') || ': ' || (c ->> 'says') || ' — change the value on the older table, or change the column on the copy after the switch' as x
                        from jsonb_array_elements(v_checks) c where not (c ->> 'clears')::boolean order by 1 limit 5) e), '[]'::jsonb),
                  'judged', v_judged,
                  'capped', v_judged >= v_cap,
                  'examples', coalesce((select jsonb_agg(e.x) from (
                      select (c ->> 'table') || ': ' || (c ->> 'says') as x
                        from jsonb_array_elements(v_checks) c order by 1 limit 5) e), '[]'::jsonb)),
    'compared_at', now());
end;
$function$;
