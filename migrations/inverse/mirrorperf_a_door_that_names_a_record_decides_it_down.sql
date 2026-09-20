-- MIRROR-PERF, the inverse: `custom.record_table` put back to the body APPROVAL-TAIL landed at
-- 07:20:21Z, taken from the live catalogue. Run it and census 1 of check:store-doors-decide
-- names this door again.

CREATE OR REPLACE FUNCTION custom.record_table(p_organization_id uuid, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_found boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_table',
                                        'viewer'::public.permission_level, 'record');

  select r.table_id, true into v_table, v_found
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not v_found then
    raise exception 'There is no record % in this organization, here or in the trash.', p_record_id
      using errcode = '02000',
            hint = 'The id belongs to another organization or to nothing at all — organizations are hard walls (REC-29).';
  end if;
  return v_table;
end
$function$;
