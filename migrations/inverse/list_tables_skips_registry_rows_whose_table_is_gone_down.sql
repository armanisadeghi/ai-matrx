-- chair-step: the inverse of list_tables_skips_registry_rows_whose_table_is_gone.sql. It puts platform.api_tables back byte for byte. No table DDL.
-- lock: platform
-- based-on: platform.api_tables() 1faac355c636f82b3e7d0c653850bdd361eee5c4af877d7dce47056ddff356fe

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
     and has_table_privilege(custom.caller_role(), format('%I.%I', e.schema_name, e.table_name), 'select')
   order by e.token;
$function$
