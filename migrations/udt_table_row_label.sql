-- chair-step: the only non-additive statement is REVOKE EXECUTE on the one function THIS FILE CREATES (default PUBLIC execute removed before the explicit grant, per db-rules 6d-4); nothing existing loses a privilege, nothing is dropped
-- ============================================================================
-- udt_table_row_label — the ROW LABEL of a user data table
-- ============================================================================
-- Airtable's "primary field", Notion's title: the value that names a row
-- wherever the row is referred to — a reference, a copy, a link from another
-- table, an agent's sentence. Stored on the dataset as
--   metadata->'row_label' = {"kind":"field","field":"<field_name>"}
--                         | {"kind":"formula","expression":"{First} & \" \" & {Last}"}
-- (the expression is the data-tables formula language, evaluated on read by
-- features/data-tables/row-label.ts). NULL clears it, and the client falls
-- back to the table's first ordinary column.
--
-- One door, editor access, shape-checked here so a client can never store a
-- label the readers cannot interpret. Additive apart from the REVOKE named above.
-- ============================================================================

create or replace function public.udt_set_table_row_label(
  p_table_id uuid,
  p_row_label jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind text;
  v_field text;
  v_expression text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_label is not null and jsonb_typeof(p_row_label) <> 'null' then
    if jsonb_typeof(p_row_label) <> 'object' then
      raise exception 'row_label must be an object' using errcode = '22023';
    end if;
    v_kind := p_row_label->>'kind';
    if v_kind = 'field' then
      v_field := p_row_label->>'field';
      if v_field is null or not exists (
        select 1 from workbench.udt_dataset_fields
        where table_id = p_table_id and field_name = v_field and deleted_at is null
      ) then
        raise exception 'row_label.field "%" is not a column of this table', coalesce(v_field, '') using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'field', 'field', v_field);
    elsif v_kind = 'formula' then
      v_expression := p_row_label->>'expression';
      if v_expression is null or btrim(v_expression) = '' then
        raise exception 'row_label.expression is empty' using errcode = '22023';
      end if;
      if length(v_expression) > 2000 then
        raise exception 'row_label.expression is longer than 2000 characters' using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'formula', 'expression', v_expression);
    else
      raise exception 'row_label.kind must be "field" or "formula", got "%"', coalesce(v_kind, '') using errcode = '22023';
    end if;
  else
    p_row_label := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_label is null then coalesce(metadata, '{}'::jsonb) - 'row_label'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_label}', p_row_label, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    raise exception 'dataset % not found', p_table_id using errcode = 'P0002';
  end if;

  return jsonb_build_object('success', true, 'row_label', v_metadata -> 'row_label');
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'udt_set_table_row_label', 'p_table_id uuid, p_row_label jsonb',
   'data-tables row label (2026-09-21)',
   'SIGNED-IN door (authenticated only). Sets or clears the row label (metadata->row_label) of a user data table; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.',
   false, null)
on conflict do nothing;

revoke execute on function public.udt_set_table_row_label(uuid, jsonb) from public, anon;
grant execute on function public.udt_set_table_row_label(uuid, jsonb) to authenticated, service_role;
