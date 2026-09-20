-- READ-PERF, the inverse of the ancestor walk: custom.visibility_ancestors put back to the
-- whole-view walk, and the per-node lookup (and its door row) removed.
CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive up as (
    select e.container_type, e.container_id, 1 as depth, e.conveys_max as max_level,
           array[p_item_type || ':' || p_item_id::text,
                 e.container_type || ':' || e.container_id::text] as path
    from custom.carrying_edges e
    where e.item_type = p_item_type
      and e.item_id   = p_item_id
    union all
    select e.container_type, e.container_id, u.depth + 1,
           least(u.max_level, e.conveys_max),
           u.path || (e.container_type || ':' || e.container_id::text)
    from up u
    join custom.carrying_edges e
      on  e.item_type = u.container_type
      and e.item_id   = u.container_id
    where u.depth < 16
      and not (e.container_type || ':' || e.container_id::text) = any (u.path)
  )
  select u.container_type, u.container_id, min(u.depth), max(u.max_level)
  from up u
  group by u.container_type, u.container_id;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'carrying_edges_of';
drop function if exists custom.carrying_edges_of(text, uuid);
