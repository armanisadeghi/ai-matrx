-- UDT: the missing delete-column path, plus the single write path for a
-- column's display format.
--
-- Why delete_field is new: `remove_column_from_user_table` was dropped in
-- `udt_v2_drop_legacy_unused_rpcs.sql` and nothing replaced it, so a user could
-- add columns forever and never remove one. This is the replacement, and it
-- also purges the now-orphaned JSONB key from every row (an orphan key would
-- otherwise resurrect itself the moment a column of the same name is re-added).
-- Row history is preserved by the existing udt_log_row_version trigger.
--
-- Why set_field_format is a dedicated RPC: `update_user_table_config` has a
-- frozen signature with several live callers; a format is a small, additive,
-- non-destructive write that deserves its own greppable path.

create or replace function public.udt_delete_field(
  p_table_id uuid,
  p_field_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_field_name text;
  v_display_name text;
  v_remaining int;
  v_rows_cleared int := 0;
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = auth.uid())
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name, display_name into v_field_name, v_display_name
  from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id;

  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  select count(*) into v_remaining
  from workbench.udt_dataset_fields
  where table_id = p_table_id;

  if v_remaining <= 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'A table must keep at least one column. Add another column before removing this one.'
    );
  end if;

  -- Purge the key from every row that carries it. The row-version trigger
  -- records the prior shape, so the values remain recoverable from history.
  with cleared as (
    update workbench.udt_dataset_rows
    set data = data - v_field_name, updated_at = now()
    where table_id = p_table_id and data ? v_field_name
    returning 1
  )
  select count(*) into v_rows_cleared from cleared;

  delete from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id;

  -- Close the gap in field_order so the remaining columns stay 1..n.
  with ordered as (
    select id, row_number() over (order by field_order, created_at) as rn
    from workbench.udt_dataset_fields
    where table_id = p_table_id
  )
  update workbench.udt_dataset_fields f
  set field_order = ordered.rn
  from ordered
  where f.id = ordered.id and f.field_order is distinct from ordered.rn;

  -- Never leave the table pointing at a column that no longer exists.
  update workbench.udt_datasets
  set row_ordering_config = case
        when row_ordering_config->'default_sort'->>'field' = v_field_name
          then row_ordering_config - 'default_sort'
        else row_ordering_config
      end,
      version = version + 1,
      updated_at = now()
  where id = p_table_id;

  update workbench.udt_datasets
  set row_ordering_config = row_ordering_config - 'label_field'
  where id = p_table_id
    and row_ordering_config->>'label_field' = v_field_name;

  return jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'field_id', p_field_id,
    'field_name', v_field_name,
    'display_name', v_display_name,
    'rows_cleared', v_rows_cleared
  );
end;
$function$;

comment on function public.udt_delete_field(uuid, uuid) is
  'Removes a column from a user data table and purges its key from every row. Refuses to delete the last remaining column. Requires owner or editor access.';

-- ── field format (UI-layer semantic type over the storage type) ──────────────

create or replace function public.udt_set_field_format(
  p_table_id uuid,
  p_field_id uuid,
  p_format jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_metadata jsonb;
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = auth.uid())
    or coalesce(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  -- p_format null clears the format; the column then renders with its storage
  -- type's identity format, exactly as it did before formats existed.
  update workbench.udt_dataset_fields
  set metadata = case
        when p_format is null or p_format = 'null'::jsonb
          then coalesce(metadata, '{}'::jsonb) - 'format'
        else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('format', p_format)
      end,
      updated_at = now()
  where id = p_field_id and table_id = p_table_id
  returning metadata into v_metadata;

  if v_metadata is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  return jsonb_build_object(
    'success', true,
    'field_id', p_field_id,
    'metadata', v_metadata
  );
end;
$function$;

comment on function public.udt_set_field_format(uuid, uuid, jsonb) is
  'Sets (or clears, with null) the display format on a user-table column: udt_dataset_fields.metadata.format = {id, options}. Purely additive — the stored data_type and values are untouched.';

grant execute on function public.udt_delete_field(uuid, uuid) to authenticated, service_role;
grant execute on function public.udt_set_field_format(uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
