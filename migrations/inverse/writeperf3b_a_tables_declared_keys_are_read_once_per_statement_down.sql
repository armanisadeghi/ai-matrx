-- additive: yes
--
-- chair-step: the inverse of writeperf3b_a_tables_declared_keys_are_read_once_per_statement.sql —
--   it restores custom.undeclared_keys to the exact bytes that file replaced.

CREATE OR REPLACE FUNCTION custom.undeclared_keys(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys text[];
begin
  -- EVERY Field row of the Table, not custom.applicable_fields: a Value for a Field that
  -- does not apply to THIS record's type is a different question entirely, and
  -- custom._record_field_validation's retype path already answers it by moving the value
  -- into `_retired` with its reason. Asking applicable_fields here would call such a value
  -- undeclared and refuse a write that is perfectly legal.
  select coalesce(array_agg(k.key order by k.key), array[]::text[])
    into v_keys
    from jsonb_object_keys(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) k(key)
   where left(k.key, 1) <> '_'
     and not (k.key = any (custom.record_platform_keys()))
     and not exists (
           select 1
             from custom.record f
            where f.organization_id = p_organization_id
              and f.table_id = custom.field_kernel_id()
              and f.data_class = 'field'
              and f.deleted_at is null
              and f.data ->> 'entity_definition_id' = p_table_id::text
              and f.data ->> 'key' = k.key);
  return v_keys;
end;
$function$

;
