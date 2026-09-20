-- chair-step: the inverse of histscreens_the_preview_names_exactly_what_moves.sql. It puts
-- custom.record_restore_preview and custom.io_restore back to the bodies that file replaced
-- — the preview that diffed the restore body against the record (so it read backwards and
-- called every key changed) and the restore that returned null to every caller. Both are the
-- definitions that file's two `-- based-on:` lines pin. Nothing is created, dropped or
-- revoked; no declaration row and no data is touched.
-- lane: HISTORY-SCREENS

create or replace function custom.record_restore_preview(p_organization_id uuid, p_record_id uuid,
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

  v_changes := custom.history_changes(p_organization_id, v_table,
                                      custom.history_restore_body(v_current, v_target,
                                                                  p_field_key),
                                      coalesce(v_current, '{}'::jsonb));

  return jsonb_build_object(
    'record_id', p_record_id,
    'from_version', v_now,
    'to_version', p_version,
    'saved_at', v_at,
    'field_key', p_field_key,
    'changes', v_changes,
    'count', jsonb_array_length(v_changes));
end;
$$;

create or replace function custom.io_restore(p_organization_id uuid, p_record_id uuid,
                                             p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user    uuid := custom.query_principal();
  v_doc     jsonb;
  v_target  jsonb;
  v_current jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.record_history(organization, record) lists them with who changed what.'
      using errcode = '22004';
  end if;

  select v.row_data -> 'data' into v_target
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
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned — the two most recent are always kept.';
  end if;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  perform custom.record_update(p_organization_id, p_record_id,
                               custom.history_restore_body(v_current, v_target, null));

  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    v_doc := null;
  end;
  return (v_doc ->> 'version')::integer;
end;
$$;
