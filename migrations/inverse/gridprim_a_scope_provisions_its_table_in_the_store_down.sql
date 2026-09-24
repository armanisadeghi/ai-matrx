-- lock: custom,platform,context
-- lane: GRID-PRIMITIVES
-- based-on: context.provision_scope_datasets_trigger() de921f2d68a964b11859744d6c72a1615eea9de02b0f76485e89b5755b8746af
-- chair-step: the inverse of gridprim_a_scope_provisions_its_table_in_the_store.sql. It DROPS custom.scope_table_provision(uuid, uuid, uuid, uuid), deletes its platform.client_callable_door row. It also puts context.provision_scope_datasets_trigger back to its pre-G11 body first.
-- WHAT IT DOES NOT UNDO: a Table a scope was given stays, with its scope_binding and the context value that names it.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The trigger function first, back to the body production held before G11 (it calls only
-- context.provision_scope_dataset), so nothing live calls what this file then drops.
CREATE OR REPLACE FUNCTION context.provision_scope_datasets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  if tg_table_name='scopes' then
    for r in select id from context.context_items
      where scope_type_id=new.scope_type_id and is_active and deleted_at is null
        and reference_source->>'container_type'='dataset_template'
    loop perform context.provision_scope_dataset(r.id,new.id); end loop;
  else
    if new.is_active and new.deleted_at is null and new.reference_source->>'container_type'='dataset_template' then
      for r in select id from context.scopes
        where scope_type_id=new.scope_type_id and deleted_at is null
      loop perform context.provision_scope_dataset(new.id,r.id); end loop;
    end if;
  end if;
  return new;
end; $function$

;


drop function if exists custom.scope_table_provision(uuid, uuid, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom' and declared_by = 'gridprim_a_scope_provisions_its_table_in_the_store.sql';

