-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE INVERSE of migrations/campaign/seat_vis_a_table_is_a_terminal_ancestor.sql: it puts back
-- the body of `custom.visibility_ancestors` exactly as it stood on the main database on
-- 2026-09-19, in which the walk continued UP from the Table a record lives in and a person
-- shared one Home of a Table saw every record of that Table in every other Home.
--
-- Run it and scripts/campaign-tests/visfix_green.sql CLAUSE 1 goes red again.

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
    from custom.carrying_edges_of(p_item_type, p_item_id) e
    union all
    select e.container_type, e.container_id, u.depth + 1,
           least(u.max_level, e.conveys_max),
           u.path || (e.container_type || ':' || e.container_id::text)
    from up u
    cross join lateral custom.carrying_edges_of(u.container_type, u.container_id) e
    where u.depth < 16
      and not (e.container_type || ':' || e.container_id::text) = any (u.path)
  )
  select u.container_type, u.container_id, min(u.depth), max(u.max_level)
  from up u
  group by u.container_type, u.container_id;
$function$

;
