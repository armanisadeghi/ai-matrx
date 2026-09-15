-- ============================================================================
-- udt_table_style_and_example_tables
--
-- Two NEW client doors for user data tables (no existing function is replaced,
-- so no `-- based-on:` line applies):
--
--   1. public.udt_set_table_style(p_table_id, p_path, p_value)
--      Writes ONE path under `workbench.udt_datasets.metadata -> 'style'`
--      (color-by column, color rules, manual row / cell / column highlights —
--      the model is `features/data-tables/table-style.ts`). Surgical by path:
--      two editors highlighting different cells never overwrite each other,
--      which a whole-blob "save the style" write would. A null value deletes
--      the key. Guard: the SAME editor check every other udt write uses
--      (`workbench.udt_dataset_access(p_table_id, 'editor')`), so a view-only
--      share cannot color a table it cannot edit. SECURITY DEFINER because
--      `metadata` is a governed-looking column the client has no direct write
--      policy for; the body writes NOTHING but the `style` key.
--
--   2. public.udt_list_example_tables()
--      The platform's example tables — datasets owned by the Matrx System org
--      (`iam.system_orgs` key 'system', `global_readable = true`, so every
--      signed-in user is a viewer through `iam.has_access`). SECURITY INVOKER
--      on purpose: RLS is the gate, the function only names the set. Read by
--      the /data list's "Examples" section; `get_user_tables` stays "my own
--      tables" and is not touched.
--
-- Doors are registered in platform.client_callable_door BEFORE the grants, per
-- db-rules FEATURE.md §6d-4.
-- ============================================================================

create or replace function public.udt_set_table_style(
  p_table_id uuid,
  p_path text[],
  p_value jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_style jsonb;
  v_depth int;
  v_head text;
  v_parent text[];
  i int;
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  v_depth := coalesce(array_length(p_path, 1), 0);
  if v_depth < 1 or v_depth > 3 then
    raise exception 'style path must have 1 to 3 segments, got %', v_depth using errcode = '22023';
  end if;
  v_head := p_path[1];
  if v_head not in ('colorBy', 'rules', 'rows', 'cells', 'columns') then
    raise exception 'unknown style key "%": expected colorBy, rules, rows, cells or columns', v_head using errcode = '22023';
  end if;
  if (v_head in ('colorBy', 'rules') and v_depth <> 1)
     or (v_head in ('rows', 'columns') and v_depth <> 2)
     or (v_head = 'cells' and v_depth <> 3) then
    raise exception 'style key "%" does not take a path of % segments', v_head, v_depth using errcode = '22023';
  end if;

  select coalesce(metadata -> 'style', '{}'::jsonb)
    into v_style
    from workbench.udt_datasets
   where id = p_table_id
   for update;

  if v_style is null then
    raise exception 'dataset % not found', p_table_id using errcode = 'P0002';
  end if;
  if jsonb_typeof(v_style) <> 'object' then
    v_style := '{}'::jsonb;
  end if;

  if p_value is null or p_value = 'null'::jsonb then
    -- Delete the leaf, then prune empty parents so the blob never accumulates
    -- `{ "cells": { "<row>": {} } }` husks.
    v_style := v_style #- p_path;
    for i in reverse (v_depth - 1)..1 loop
      v_parent := p_path[1:i];
      if v_style #> v_parent = '{}'::jsonb then
        v_style := v_style #- v_parent;
      end if;
    end loop;
  else
    -- jsonb_set only creates the LAST segment; make every parent exist first.
    for i in 1..(v_depth - 1) loop
      v_parent := p_path[1:i];
      if v_style #> v_parent is null or jsonb_typeof(v_style #> v_parent) <> 'object' then
        v_style := jsonb_set(v_style, v_parent, '{}'::jsonb, true);
      end if;
    end loop;
    v_style := jsonb_set(v_style, p_path, p_value, true);
  end if;

  v_style := v_style || jsonb_build_object('version', 1);

  update workbench.udt_datasets
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array['style'], v_style, true),
         updated_at = now()
   where id = p_table_id;

  return jsonb_build_object('success', true, 'table_id', p_table_id, 'style', v_style);
end;
$function$;

create or replace function public.udt_list_example_tables()
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'success', true,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'table_name', d.table_name,
        'description', d.description,
        'user_id', d.user_id,
        'organization_id', d.organization_id,
        'visibility', d.visibility::text,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'row_count', (select count(*) from workbench.udt_dataset_rows r where r.table_id = d.id),
        'field_count', (select count(*) from workbench.udt_dataset_fields f where f.table_id = d.id)
      ) order by d.table_name)
      from workbench.udt_datasets d
      where d.deleted_at is null
        and d.organization_id = (select s.organization_id from iam.system_orgs s where s.key = 'system')
    ), '[]'::jsonb)
  );
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'udt_set_table_style', 'p_table_id uuid, p_path text[], p_value jsonb',
   'data-tables colors (2026-09-14)',
   'SIGNED-IN door (authenticated only). Writes one path of a user data table''s color style (metadata->style); body refuses anyone without editor access via workbench.udt_dataset_access.',
   false, null),
  ('public', 'udt_list_example_tables', '',
   'data-tables colors (2026-09-14)',
   'SIGNED-IN door (authenticated only). Lists the platform example tables (Matrx System org datasets); SECURITY INVOKER, RLS decides what each caller sees.',
   false, null)
on conflict do nothing;

revoke execute on function public.udt_set_table_style(uuid, text[], jsonb) from public, anon;
grant execute on function public.udt_set_table_style(uuid, text[], jsonb) to authenticated, service_role;

revoke execute on function public.udt_list_example_tables() from public, anon;
grant execute on function public.udt_list_example_tables() to authenticated, service_role;

notify pgrst, 'reload schema';
