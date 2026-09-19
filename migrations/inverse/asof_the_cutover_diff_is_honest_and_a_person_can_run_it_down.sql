-- STORE-ASOF (4 of 4) — THE INVERSE. The org-scoped door and its declaration go, and
-- `custom.visibility_parity` goes back to the body whose depth ceiling was the literal 8.

set lock_timeout = '5s';
set statement_timeout = '300s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'query_visibility_parity';
drop function if exists custom.query_visibility_parity(uuid);

CREATE OR REPLACE FUNCTION custom.visibility_parity()
 RETURNS TABLE(side text, container_type text, container_id uuid, item_type text, item_id uuid, stored_level permission_level, derived_level permission_level, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive edges as materialized (
    -- ONCE. This single line is the whole difference: `custom.carrying_edges` is a UNION over
    -- 82,731 association rows, and the old body re-evaluated it inside 811 separate recursions.
    select e.container_type, e.container_id, e.item_type, e.item_id, e.conveys_max
      from custom.carrying_edges e
  ), roots as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), walk as (
    select r.ct as root_type, r.ci as root_id, e.item_type, e.item_id,
           1 as depth, e.conveys_max as max_level,
           array[r.ct || ':' || r.ci::text, e.item_type || ':' || e.item_id::text] as path
      from roots r
      join edges e on e.container_type = r.ct and e.container_id = r.ci
    union all
    select w.root_type, w.root_id, e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),                                 -- VIS-3
           w.path || (e.item_type || ':' || e.item_id::text)
      from walk w
      join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth < 16                                                       -- REC-N-4
       and not (e.item_type || ':' || e.item_id::text) = any (w.path)         -- VIS-4
  ), derived as (
    select w.root_type as container_type, w.root_id as container_id, w.item_type, w.item_id,
           min(w.depth) as depth, max(w.max_level) as max_level               -- VIS-2
      from walk w
     group by 1, 2, 3, 4
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null
  union all
  select 'level_differs', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, d.max_level, 'same pair, different level'
  from platform.reachability r
  join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.max_level is distinct from r.max_level
  union all
  select 'derived_only', d.container_type, d.container_id, d.item_type, d.item_id,
         null::public.permission_level, d.max_level,
         case when d.depth > 8 then 'beyond_stored_ceiling'
              else 'derived row the stored closure does not hold' end
  from derived d
  left join platform.reachability r
    on  r.container_type = d.container_type and r.container_id = d.container_id
    and r.item_type = d.item_type and r.item_id = d.item_id
  where r.item_id is null;
$function$

;
