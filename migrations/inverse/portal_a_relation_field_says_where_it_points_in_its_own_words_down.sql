-- chair-step: this puts `custom.portal_field_map` back to reading a relation Field's target from `data -> 'config' ->> 'entity_definition_id'`, which is where it is NOT. After it, `custom.portal_declare` refuses every legitimate relation Field with *"The field \"client\" points at a different Table from the one whose records are the clients"* — a sentence true of nothing — and no portal can be declared at all. It is here because a file that names an inverse must have one, not because anybody should run it.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)

create or replace function custom.portal_field_map(p_organization_id uuid, p_table_id uuid)
returns table(field_id uuid, field_key text, field_type text, points_at uuid)
language sql
stable security definer
set search_path to ''
as $function$
  -- Every declared Field of one Table, with what a relation Field points at. Read from
  -- the Field kernel, which is where a Field lives (REC-27) - never from a cache.
  select f.id,
         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
         f.data ->> 'type',
         nullif(f.data -> 'config' ->> 'entity_definition_id', '')::uuid
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id;
$function$;
