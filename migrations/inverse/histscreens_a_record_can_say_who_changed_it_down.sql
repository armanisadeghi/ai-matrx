-- chair-step: the inverse of histscreens_a_record_can_say_who_changed_it.sql. It DROPS the
-- eight functions that file created, deletes their platform.client_callable_door rows, and
-- puts custom.io_restore back to the merge-only body it had before that file ran — byte for
-- byte, the definition the forward file's `-- based-on:` line pins.
--
-- WHAT IT DOES NOT RESTORE, and this is the point of saying so: the versions written while
-- the new doors were live STAY. A restore performed through the corrected custom.io_restore
-- cleared keys the target version did not have, and running this inverse does not put those
-- values back — they are in history.row_versions like every other version, and the record's
-- own history is how somebody would go and get them. Nothing here rewrites a version,
-- because nothing in the forward file did.
-- lane: HISTORY-SCREENS

drop function if exists custom.record_restore_version(uuid, uuid, integer);
drop function if exists custom.value_restore(uuid, uuid, text, integer);
drop function if exists custom.record_restore_preview(uuid, uuid, integer, text);
drop function if exists custom.field_history(uuid, uuid, text, integer, integer, uuid);
drop function if exists custom.record_history(uuid, uuid, integer, integer);
drop function if exists custom.history_changes(uuid, uuid, jsonb, jsonb);
drop function if exists custom.history_actor(text, jsonb, uuid, jsonb);
drop function if exists custom.history_people(uuid, uuid[]);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('history_people', 'history_changes', 'history_restore_body',
                         'record_history', 'field_history', 'record_restore_preview',
                         'record_restore_version', 'value_restore');

-- `custom.history_restore_body` is dropped LAST because `custom.io_restore` below stops
-- referring to it in the same transaction.
drop function if exists custom.history_restore_body(jsonb, jsonb, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.io_restore, exactly as it was before this lane — the merge-only restore that
-- left every key added since the target version in place.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_restore(p_organization_id uuid, p_record_id uuid,
                                             p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user uuid := custom.query_principal();
  v_doc  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter
  -- who could restore would be able to change every value on the record without being
  -- allowed to change one.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.io_revisions(organization, record) lists them with a sentence each.'
      using errcode = '22004';
  end if;

  -- The store's own restore, NOT a second one. It rewrites through the record's normal write
  -- path, so the restore gets its own version, its own history row and its own outbox event —
  -- which is what makes a restore undoable by the same mechanism that made it possible.
  perform history.snapshot_restore(p_organization_id, p_record_id, p_version);

  -- Read back through THE ONE READ DOOR, not out of custom.record.
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- Same disagreement, same answer: the restore HAS happened (history.snapshot_restore ran
    -- and its own event is in the outbox), and the only thing unavailable is the new version
    -- NUMBER to hand back. Returning null says "done, and I cannot tell you which version" —
    -- never a second read of custom.record to produce a number.
    v_doc := null;
  end;
  return (v_doc ->> 'version')::integer;
end;
$function$;

