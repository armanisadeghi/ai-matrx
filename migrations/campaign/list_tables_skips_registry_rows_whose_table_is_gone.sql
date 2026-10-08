-- lock: platform
-- based-on: platform.api_tables() 566afb8553d6b03a8946af489d57a15a701c72f5346fd47e86ed6e256b4f2172
--
-- LIST-TABLES-FIX. platform.api_tables() (what the tables tool / REST list_tables reads) formatted
-- has_table_privilege over every active platform.entity_types row; six active rows still name
-- context.* tables that moved to deprecated.* (context_item, context_value_refs, context_item_value,
-- scope_dataset_instance, scope, scope_type), so the whole list failed with 42P01 for everyone.
-- Same answer shape; rows whose table is gone are skipped. Function body only, grants unchanged.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION platform.api_tables()
 RETURNS TABLE(token text, label text, description text, api_reach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select e.token,
         -- the name a person reads, as custom.entity_table words it: the registry label, unless
         -- that label is only the type word ("Entity" on party)
         case when coalesce(nullif(e.label, ''), e.type) = e.type or lower(e.label) = lower(e.type)
              then initcap(replace(e.table_name, '_', ' ')) else e.label end,
         null::text,
         f.api_reach
    from platform.entity_types e
    cross join lateral platform.api_facts(e.token) f
   where f.api_reach <> 'none'
     and e.is_active
     -- a registry row whose table has been moved or dropped (context.* after the custom data store
     -- took over) is skipped, never an error: asking for the privilege on a missing relation raised
     -- 42P01 and took the whole table list down (2026-10-08)
     and to_regclass(format('%I.%I', e.schema_name, e.table_name)) is not null
     and has_table_privilege(custom.caller_role(), format('%I.%I', e.schema_name, e.table_name), 'select')
   order by e.token;
$function$
