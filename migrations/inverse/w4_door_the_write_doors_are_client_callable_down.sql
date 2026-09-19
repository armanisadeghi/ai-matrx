-- chair-step: the DOWN migration for w4_door_the_write_doors_are_client_callable.sql. It puts the eight doors back to the bodies they had before W4-DOOR-WRITE (SECURITY INVOKER where they were invoker, and no membership decision), removes custom.assert_client_may_reach, and deletes the four door rows this lane inserted. It is a REPLACE of live function bodies and a DELETE from a registry table, which is why it is a chair step and not an ordinary file.
--
-- Run the grants' inverse (w4_door_the_write_client_grants_down.sql) FIRST: leaving a client
-- EXECUTE on a function whose body no longer decides membership is the hole this lane closed.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  -- THE DOOR, and it is the same ONE predicate every other door in this schema calls. This
  -- is SECURITY DEFINER, so `current_user` in here is already the definer;
  -- `custom.assert_store_door` judges `custom.caller_role()` instead.
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins. The contract is explicit that this must stay
  -- byte-identical, because version moves on every background stamp too.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    return v_new;
  end if;

  -- 0 ROWS: classify by a committed re-read on the key alone, exactly as the contract says.
  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  -- THE DECISION PACKAGE: the CURRENT values of ONLY the keys this write attempted.
  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at timestamptz;
begin
  -- THE DOOR, and it is the same ONE predicate every other door in this schema calls. This
  -- is SECURITY DEFINER, so `current_user` in here is already the definer;
  -- `custom.assert_store_door` judges `custom.caller_role()` instead.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    -- Nothing fails silently, and the two ways to match no row are told apart rather than
    -- reported as one shrug.
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;
  return v_at;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.record_restore(p_organization_id uuid, p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rows bigint;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.';
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.table_declare(p_organization_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select f.*
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
          or (p_record_type is not null
              and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type));
$function$

;

CREATE OR REPLACE FUNCTION custom.table_capacity(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_records bigint;
  v_ceiling integer := custom.table_record_ceiling(p_organization_id);
begin
  select count(*) into v_records
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null;

  return jsonb_build_object(
    'records',   v_records,
    'ceiling',   v_ceiling,
    'remaining', greatest(v_ceiling - v_records, 0),
    'over',      v_records > v_ceiling,
    'knob',      'custom/table_record_ceiling',
    'says',      case
                   when v_records > v_ceiling then
                     format('this table holds %s records, which is more than the %s it is set up for', v_records, v_ceiling)
                   else
                     format('this table holds %s of the %s records it is set up for', v_records, v_ceiling)
                 end);
end $function$

;

CREATE OR REPLACE FUNCTION custom.promote_table(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_moved  bigint;
  v_before bigint;
  v_after  bigint;
  v_was    text;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  v_was := custom.table_storage(p_organization_id, p_table_id);
  -- V1-STORE-FIXES finding 3, the FIRST half: ASK BEFORE BUILDING. `custom.table_storage`
  -- answers NULL when this organization has no live Table of that id at all, which is the
  -- cheap, honest refusal - and it comes before a single index is built, so a caller who
  -- named the wrong Table is told instead of paying for work that is then thrown away.
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to move.'
      using errcode = '23503',
            hint = 'REC-4: promoting a Table is per Table and per organization. The store is keyed (organization_id, id), so a Table of another organization is not found by this one - and a Table that was deleted is not found either.';
  end if;
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();
  -- V1-STORE-FIXES finding 3, the SECOND half: A SUCCESS SENTENCE COUNTS ITS ROWS.
  -- `V1-STORE` measured this UPDATE matching ZERO rows under RLS while the function still
  -- answered {"now":"heavy"} - a no-op wearing a success. The row count is the only thing
  -- that knows, so it is read, and a promotion that moved nothing RAISES rather than
  -- reports. Raising also unwinds the indexes built above, so a half-promoted Table is not
  -- a state this function can leave behind.
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'Nothing was changed, so this table was not moved to fast storage.'
      using errcode = '42501',
            hint = 'REC-4: the table is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Nothing was built and nothing was left half-done. Ask somebody who can edit that table to move it.';
  end if;

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built,
                            'table_rows_changed', v_moved);
end $function$

;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'W4-DOOR-WRITE'
   and function_name in ('table_declare', 'applicable_fields', 'table_capacity', 'promote_table');

drop function if exists custom.assert_client_may_reach(uuid, text);
