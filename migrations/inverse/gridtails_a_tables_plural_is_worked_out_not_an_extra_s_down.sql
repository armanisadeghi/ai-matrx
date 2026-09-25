-- chair-step: the inverse of gridtails_a_tables_plural_is_worked_out_not_an_extra_s.sql. It puts the view custom.table back byte for byte as sc1p_the_facts_door_says_who_keeps_each_table.sql left it (the fallback plural is name || 's' again) and then drops custom.plural_of(text), which only that view read. Same 33 columns, so nothing that reads the view changes shape. No data is touched; stored plurals are the other file's.
-- lane: GRID-TAILS
-- lock: custom

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace view custom.table
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
    data,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_by_the_app'::text)::boolean AS kept_by_the_app,
    custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_for'::text AS kept_for,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'offered_as_context'::text)::boolean AS offered_as_context
   FROM custom.record r
  WHERE table_id = custom.table_kernel_id() AND deleted_at IS NULL;

drop function if exists custom.plural_of(text);
