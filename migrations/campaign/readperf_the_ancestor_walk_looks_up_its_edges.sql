-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.visibility_ancestors(text, uuid) 7f502e418c5989f50202c98abef8086bbaa8408afce8cdad9e0d066eee21fdfa
--
-- READ-PERF — THE ANCESTOR WALK LOOKS ITS EDGES UP INSTEAD OF READING EVERY EDGE ON THE PLATFORM.
--
-- `custom.visibility_ancestors` is the third arm of the ONE ladder, so it runs inside every
-- `custom.has_visibility` call on this platform. It walks `custom.carrying_edges`, a VIEW whose
-- two arms are `platform.associations UNION`-ed through two rule tables, and whose output columns
-- are CASE expressions over `container_side`. A predicate on `item_id` therefore cannot be pushed
-- through the CASE into `idx_assoc_target_live`, so asking "what contains this one record" reads
-- EVERY LIVE ASSOCIATION ON THE PLATFORM — 83,227 of them today, and growing with every
-- organization.
--
-- Measured on the main database: one `custom.has_visibility` call for a plain member with no arm
-- to admit her takes **49.0 ms**, of which the whole-view scan is ~50 ms; `custom.effective_level`
-- asks that question once per level, so a single page's field-level-security step cost
-- **404.2 ms** — with no rows read at all.
--
-- So the walk asks for ONE node's edges at a time. `custom.carrying_edges_of` is the same two
-- arms with the CASE unrolled into four indexed lookups — two on `idx_assoc_target_live`, two on
-- `idx_assoc_source_live` — and `custom.visibility_ancestors` joins it laterally at each step.
-- The rows are identical; the READ-PERF green suite asserts that node by node against the view
-- itself, for every record in the store.
--
-- `container_side = 'none'` is not a container and produces no edge, exactly as the view's
-- `container_side = any(array['source','target'])` says.

create function custom.carrying_edges_of(p_item_type text, p_item_id uuid)
returns table(container_type text, container_id uuid, conveys_max public.permission_level)
language sql
stable
security definer
set search_path to ''
as $function$
  -- arm 1a — platform.containment_edges, the rule whose SOURCE is the container
  select a.source_type, a.source_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 1b — the same rule table, the rule whose TARGET is the container
  select a.target_type, a.target_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id
  union
  -- arm 2a — custom.carrying_rule, source side
  select a.source_type, a.source_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 2b — custom.carrying_rule, target side
  select a.target_type, a.target_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id;
$function$;

comment on function custom.carrying_edges_of(text, uuid) is
  'READ-PERF: the carrying edges INTO one node, looked up on platform.associations'' own indexes instead of read out of the custom.carrying_edges view, whose CASE columns block the pushdown. Asserted equal to the view node by node in the READ-PERF green suite.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, non_client_lane, reason)
select 'custom', 'carrying_edges_of', pg_catalog.pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'migrations/campaign/readperf_the_ancestor_walk_looks_up_its_edges.sql (lane READ-PERF)',
       'server_only: the inner step of custom.visibility_ancestors, which is the third arm of the one ladder. It answers "what contains this node" for the walk and is never called from outside schema custom.',
       'p_item_type / p_item_id name ONE node of the association graph and nothing else; the function reads no row of custom.record and decides nothing — it returns edges, which the caller (custom.has_visibility) then decides on. A NULL id returns no rows. It is deliberately organization-blind because the walk it serves is: REC-29''s wall is enforced on the associations themselves, which never cross it.'
  from pg_catalog.pg_proc p
 where p.pronamespace = 'custom'::regnamespace and p.proname = 'carrying_edges_of'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function custom.visibility_ancestors(p_item_type text, p_item_id uuid)
returns table(container_type text, container_id uuid, depth integer, max_level public.permission_level)
language sql
stable
security definer
set search_path to ''
as $function$
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
$function$;
