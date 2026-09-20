-- MIRROR-PERF, the inverse: `custom.record_table` back to the `v_found` form, where a SELECT
-- that finds nothing sets v_found to NULL and the 02000 arm never fires. Run it and an id that
-- is in no organization is refused at 42501 instead of being told it is not there.

CREATE OR REPLACE FUNCTION custom.record_table(p_organization_id uuid, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid;
  v_table  uuid;
  v_found  boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_table');

  select r.table_id, true into v_table, v_found
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not v_found then
    raise exception 'There is no record % in this organization, here or in the trash.', p_record_id
      using errcode = '02000',
            hint = 'The id belongs to another organization or to nothing at all — organizations are hard walls (REC-29).';
  end if;

  if not custom.query_is_store_owner() then
    v_me := custom.query_principal();
    if v_me is not null
       and not custom.has_visibility(v_me, 'record', p_record_id, 'viewer'::public.permission_level)
    then
      raise exception 'You do not have access to this record, so custom.record_table has nothing to show you.'
        using errcode = '42501',
              hint = 'DOOR-1 decides reading and writing with the SAME question: a record you may not open is a record you may not change. This needs the viewer level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.';
    end if;
  end if;

  return v_table;
end;
$function$;
