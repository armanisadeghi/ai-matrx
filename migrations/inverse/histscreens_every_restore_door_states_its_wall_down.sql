-- chair-step: the inverse of histscreens_every_restore_door_states_its_wall.sql. It takes the
-- one added line back out of custom.record_restore_preview, custom.record_restore_version and
-- custom.value_restore, returning all three to the bodies that file's three `-- based-on:`
-- lines pin — doors that never state the store's OFF switch themselves. Nothing is created,
-- dropped or revoked; no declaration row and no data is touched.
-- lane: HISTORY-SCREENS

create or replace function custom.record_restore_preview(p_organization_id uuid,
                                                         p_record_id uuid,
                                                         p_version integer,
                                                         p_field_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_target  jsonb;
  v_current jsonb;
  v_table   uuid;
  v_at      timestamptz;
  v_now     integer;
  v_before  jsonb;
  v_after   jsonb;
  v_changes jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_preview');
  perform custom.assert_client_may_change(p_organization_id, p_record_id,
                                          'custom.record_restore_preview');

  select v.row_data -> 'data', v.occurred_at into v_target, v_at
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned.';
  end if;

  select r.data, r.table_id, r.version into v_current, v_table, v_now
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- THE RECORD AS IT STANDS, and THE RECORD AS THIS WRITE WILL LEAVE IT. The envelope keys
  -- are stripped from both sides so the comparison is like for like: the store re-derives
  -- `_values`, `_sources`, `_computed`, `_derived` and `_retired` on the way in, and a key
  -- whose envelope exists on one side only is not a key that moved.
  v_before := coalesce(v_current, '{}'::jsonb)
                - '_values' - '_sources' - '_computed' - '_derived' - '_retired';
  v_after  := v_before || custom.history_restore_body(v_current, v_target, p_field_key);

  v_changes := custom.history_changes(p_organization_id, v_table, v_before, v_after);

  return jsonb_build_object(
    'record_id', p_record_id,
    'from_version', v_now,
    'to_version', p_version,
    'saved_at', v_at,
    'field_key', p_field_key,
    -- `before` is what the record says now; `after` is what it would say. A key that the
    -- target version did not have comes back with `after` of JSON null — the screen says
    -- "cleared", because that is what the write does to it.
    'changes', v_changes,
    'count', jsonb_array_length(v_changes));
end;
$$;

create or replace function custom.record_restore_version(p_organization_id uuid, p_record_id uuid,
                                              p_version integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_new     integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_version');
  -- The preview takes the EDITOR decision and refuses a missing version by name, so this
  -- door does not repeat either judgement in a second spelling.
  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version, null);
  v_new := custom.io_restore(p_organization_id, p_record_id, p_version);
  return jsonb_build_object(
    'record_id', p_record_id,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    -- Said out loud because it is the thing people fear about an undo button.
    'history_rewritten', false);
end;
$$;

create or replace function custom.value_restore(p_organization_id uuid, p_record_id uuid,
                                     p_field_key text, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_target  jsonb;
  v_current jsonb;
  v_new     integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.value_restore');
  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.value_restore: name the column to put back.'
      using errcode = '22004',
            hint = 'custom.record_history(organization, record) names the column on every change it lists.';
  end if;

  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version,
                                             p_field_key);

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_new := custom.record_update(
             p_organization_id, p_record_id,
             custom.history_restore_body(v_current, v_target, p_field_key));

  return jsonb_build_object(
    'record_id', p_record_id,
    'field_key', p_field_key,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    'history_rewritten', false);
end;
$$;
