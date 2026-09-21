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

-- The DOOR row goes: after this file runs nothing in this lane reaches the per-node lookup,
-- and a client door is a promise this lane no longer makes.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'carrying_edges_of';

-- 🚨 `custom.carrying_edges_of(text, uuid)` ITSELF STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). This file used
-- to drop it. `custom.list_door_disagreements` in
-- `exportfix_the_census_follows_the_export.sql` — a lane outside READ-PERF — has since
-- adopted it and calls it on the live path, so dropping it would not restore READ-PERF's
-- defect, it would break the export census. The defect IS restored in full by the body above:
-- `custom.visibility_ancestors` walks the whole `custom.carrying_edges` view again, per node,
-- which is exactly the slow shape this lane removed. A helper standing beside it that nothing
-- in the walk calls costs the walk nothing.
