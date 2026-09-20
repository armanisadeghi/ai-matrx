-- INVERSE of migrations/campaign/import_a_file_lands_once.sql (lane IMPORT).
--
-- It puts `custom.io_import_open` back to the LIVE bytes it had before that file ran (read out
-- of the catalogue at 2026-09-20, not retyped), drops `custom.io_import_begin` and its door
-- row, and takes the seven columns and the index off `custom.io_import`.
--
-- WHAT IT DOES NOT RESTORE, AND SAYS SO: the data in those seven columns. Dropping a column
-- destroys what is in it, so every run's file hash, duplicate key, policy and kept duplicate
-- rows are gone after this. The IMPORTED RECORDS are untouched — they are rows of the store,
-- written through the one write door, and nothing here reaches them.

begin;

drop function if exists custom.io_import_begin(uuid, uuid, text, text, jsonb, text, jsonb, text, bigint, boolean);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'io_import_begin';

CREATE OR REPLACE FUNCTION custom.io_import_open(p_organization_id uuid, p_table_id uuid, p_format text DEFAULT 'csv'::text, p_source_name text DEFAULT NULL::text, p_source_columns jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_open');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_open', 'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_open');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.io_import_open: an import belongs to one organization and one Table; both are required'
      using errcode = '22004';
  end if;
  if coalesce(p_format, '') not in ('csv', 'xlsx') then
    raise exception 'custom.io_import_open: format is csv or xlsx, not "%". The parse differs; nothing after it does.', p_format
      using errcode = '22023';
  end if;
  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb), 'open')
  returning id into v_id;
  return v_id;
end;
$function$

;

drop index if exists custom.io_import_file_hash_idx;

alter table custom.io_import drop column if exists file_hash;
alter table custom.io_import drop column if exists file_bytes;
alter table custom.io_import drop column if exists dedupe_key;
alter table custom.io_import drop column if exists policy;
alter table custom.io_import drop column if exists duplicates;
alter table custom.io_import drop column if exists rows_duplicate;
alter table custom.io_import drop column if exists finished_at;

commit;
