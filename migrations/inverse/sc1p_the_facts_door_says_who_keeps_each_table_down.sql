-- chair-step: the inverse of sc1p_the_facts_door_says_who_keeps_each_table.sql. It puts the view custom.table back to its columns before SC-1 (drop and re-make: a view cannot lose columns in place; nothing depends on it and only its owner holds privileges on it) and custom.table_facts(uuid) back to its three result columns, byte for byte, with its grant to authenticated. Its platform.client_callable_door row is untouched. Run BEFORE sc1p_each_table_says_who_keeps_it_down.sql.
-- lane: SC-1
-- lock: custom

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop view custom.table;
create view custom.table
with (security_invoker = true) as
 SELECT id,
    organization_id,
    COALESCE(data ->> 'slug'::text, lower(data ->> 'name'::text)) AS slug,
    data ->> 'name'::text AS name,
    COALESCE(data ->> 'label_singular'::text, data ->> 'name'::text) AS label_singular,
    COALESCE(data ->> 'label_plural'::text, (data ->> 'name'::text) || 's'::text) AS label_plural,
    data ->> 'icon'::text AS icon,
    data ->> 'color'::text AS color,
    COALESCE(data ->> 'type'::text, 'entity'::text) AS type,
    COALESCE(data ->> 'type'::text, 'entity'::text) = 'detail'::text AS detail,
    data ->> 'parent_token'::text AS parent_token,
    COALESCE((data ->> 'agent_writable'::text)::boolean, true) AS agent_writable,
    COALESCE(data ->> 'display'::text, 'list'::text) AS display,
    COALESCE((data ->> 'ordered'::text)::boolean, false) AS ordered,
    COALESCE(data ->> 'weight'::text, 'light'::text) AS weight,
    COALESCE((data ->> 'retention_days'::text)::integer, 30) AS retention_days,
    data ->> 'title_field'::text AS title_field,
    COALESCE(data -> 'fields'::text, '[]'::jsonb) AS fields,
    COALESCE(data -> 'default_sort'::text, '[]'::jsonb) AS default_sort,
    COALESCE(data ->> 'row_order'::text, 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    data_class = 'kernel'::text AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data
   FROM custom.record r
  WHERE table_id = custom.table_kernel_id() AND deleted_at IS NULL;;

drop function custom.table_facts(uuid);
create function custom.table_facts(p_organization_id uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me)
      from custom.record t
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
       and t.id in (select v from custom.query_visible_ids(p_organization_id,
                                                           custom.table_kernel_id()) v);
end;
$function$;

comment on function custom.table_facts(uuid) is
  'Two facts per Table the caller can already open, for the organization hub''s lanes: who can '
  'see it (the record''s own `visibility` column) and whether the CALLER made it (`created_by`). '
  'Both are columns of custom.record, not keys of the Table document custom.read_records returns, '
  'which is why no lane could be decided without it.';

grant execute on function custom.table_facts(uuid) to authenticated;
