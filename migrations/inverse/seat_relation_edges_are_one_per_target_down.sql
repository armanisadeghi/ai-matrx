-- INVERSE of migrations/campaign/seat_relation_edges_are_one_per_target.sql
-- Restores custom.record_relation_edges' body exactly as it stood before SEAT-SUITES, i.e.
-- one row per array element, so a relation naming the same record twice again makes the
-- record unwritable through every door.

create or replace function custom.record_relation_edges(
  p_organization_id uuid, p_id uuid, p_table_id uuid, p_data_class text,
  p_data jsonb, p_deleted_at timestamp with time zone)
  returns table(target_id uuid, edge_role text, field_id uuid, ord integer)
  language sql stable set search_path to ''
as $function$
  select (t.val #>> '{}')::uuid,
         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
         f.id,
         case when coalesce((f.data -> 'config' ->> 'ordered')::boolean, false)
              then t.ord::integer else null end
    from custom.record f
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'array'
          then p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')
        when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'string'
          then jsonb_build_array(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'))
        else '[]'::jsonb
      end) with ordinality as t(val, ord)
   where p_deleted_at is null
     and p_id is not null
     and p_table_id is not null
     and coalesce(p_data_class, '') = 'record'
     and f.deleted_at is null
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.organization_id = p_organization_id
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
     and f.data ->> 'type' = 'relation'
     and (t.val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;
