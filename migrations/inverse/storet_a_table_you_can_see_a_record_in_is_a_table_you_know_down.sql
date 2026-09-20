-- STORE-T file 2, the inverse: custom.assert_may_know_table back to the one question it
-- asked before this lane (may you open the Table record), byte-for-byte.

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- VIS-5, on the ONE ladder. A Table is a Record (REC-25), so this is `may I open this
  -- record` with the Table as the subject — never a second ladder, never a per-door rule.
  -- The `table` word is what makes the refusal read as a sentence about a table.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, p_door,
                                        'viewer'::public.permission_level, 'table');
end;
$function$

;
