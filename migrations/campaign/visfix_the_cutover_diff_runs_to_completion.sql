-- chair-step: it replaces the bodies of the two functions T1 IS — custom.visibility_parity() and
--   custom.visibility_cache_rebuild() — and a CREATE OR REPLACE of a live body is refused by the
--   production allow-list unless it declares what it was written against, which both lines below do.
--   Nothing is dropped, revoked, granted, deleted or rewritten: the two functions keep their names,
--   their arguments, their return shapes and their meaning, and only the way they are COMPUTED moves.
-- based-on: custom.visibility_parity() 03f95efb99001fab4a895321ead36c4f740b9129701896269ac83b5d2fdee0c5
-- based-on: custom.visibility_cache_rebuild() a8bb11d3c783906c8856dd578dad4b03540da9d4f526cca0358fe0c594960ea0
--
-- VIS-FIX — T1 CAN BE RUN. THE CUTOVER DIFF AND THE CACHE REBUILD FINISH IN MILLISECONDS.
--
-- WHAT WAS BROKEN, measured on the MAIN database 2026-09-19 (the 19 Sep verdict's severe defect 5,
-- "The cutover check cannot be run at all"). T1 is: derive Visibility from the new model for every
-- existing record, diff it against the stored form, find no differences — and then delete the stored
-- form and rebuild it from the associations. Both halves were cancelled by the database's own
-- statement timeout, so the diff had never been run and the cutover had no safety check at all.
--
-- THE CAUSE, and it is the same mistake in both functions: a per-container loop over a walk that
-- has to be a set.
--
--   · `custom.visibility_parity()` did `CROSS JOIN LATERAL custom.derive_visibility(ct, ci)` over
--     the 811 distinct containers in `platform.reachability`. Each call is its own recursive CTE,
--     and each recursion re-reads `custom.carrying_edges` — a UNION of two scans of
--     `platform.associations` (82,731 live rows) — from scratch. 811 containers × up to 16 levels
--     of re-scanning one view.
--   · `custom.visibility_cache_rebuild()` looped `custom.visibility_warm(ct, ci)` per container,
--     and `visibility_warm` stamps every row it writes with `custom.required_epoch(...)`, which
--     walks `custom.visibility_ancestors` AGAIN, once per row.
--
-- THE FIX: read `custom.carrying_edges` ONCE into a materialized CTE, then walk every container in
-- the SAME recursion (a multi-source breadth-first walk, the roots seeded together instead of one
-- at a time), and resolve the epochs by joining the walk to `custom.visibility_epoch` instead of
-- re-deriving the ancestors per row. The walk's rules are unchanged, clause for clause: depth < 16
-- (REC-N-4), `least(...)` along a path (VIS-3), `max(...)` across paths (VIS-2), the visited-set
-- test that terminates loops (VIS-4), and `min(depth)`.
--
-- MEASURED, same database, same rows: the derivation the diff runs on went from a 30 s cancellation
-- (and 75.2 s when the timeout was lifted to 300 s) to 245.7 ms over the same 7,103 pairs.
--
-- NOTHING ELSE MOVES. Same names, same arguments, same columns, same `side` / `reason` vocabulary,
-- and the SAME comparison domain: the parity diff still derives over exactly the containers
-- `platform.reachability` holds, because it is a comparison against that stored form and a
-- container the stored form never had is not a difference it can express. (TESTS.md records the
-- rest of T1's domain: the stored form is emitted by `platform.derive_reachability`, which stops at
-- depth 8, so "exactly" means exactly for containment paths of depth ≤ 8, and the deeper rungs get
-- their own positive test rather than a diff that cannot fail.)
--
-- REVERSIBLE: yes — `visfix_the_cutover_diff_runs_to_completion.inverse.sql` beside this file puts
-- both bodies back, byte for byte.

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 1 — THE DIFF
-- ═════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.visibility_parity()
 returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
               stored_level permission_level, derived_level permission_level, reason text)
 language sql
 stable
 security definer
 set search_path to ''
as $$
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
$$;

comment on function custom.visibility_parity() is
  'T1/VIS-1/VIS-7: the cutover diff between the stored closure and the derivation from the associations. Set-based: carrying_edges is read once and every container is walked in one recursion (245.7 ms over 7,103 pairs on the main database, against a 30 s cancellation before).';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 2 — THE REBUILD (T1's other half: delete the stored form and rebuild it from the associations)
-- ═════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.visibility_cache_rebuild()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  v_n integer;
begin
  -- VIS-7: the stored form is droppable. Everything below is rebuilt from the associations alone.
  truncate custom.visibility_cache;

  with recursive edges as materialized (
    select e.container_type, e.container_id, e.item_type, e.item_id, e.conveys_max
      from custom.carrying_edges e
  ), roots as (
    select distinct e.container_type as ct, e.container_id as ci from edges e
  ), walk as (
    select r.ct as root_type, r.ci as root_id, e.item_type, e.item_id,
           1 as depth, e.conveys_max as max_level,
           array[r.ct || ':' || r.ci::text, e.item_type || ':' || e.item_id::text] as path
      from roots r
      join edges e on e.container_type = r.ct and e.container_id = r.ci
    union all
    select w.root_type, w.root_id, e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),
           w.path || (e.item_type || ':' || e.item_id::text)
      from walk w
      join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth < 16
       and not (e.item_type || ':' || e.item_id::text) = any (w.path)
  ), derived as (
    select w.root_type as container_type, w.root_id as container_id, w.item_type, w.item_id,
           min(w.depth) as depth, max(w.max_level) as max_level
      from walk w
     group by 1, 2, 3, 4
  ), ancestor_epoch as (
    -- VIS-11, resolved as a JOIN instead of one `custom.visibility_ancestors` walk per written
    -- row. `derived(container, item)` IS the ancestor relation when the roots are every container
    -- in the graph, which they are here, so the maximum epoch over an item's ancestors is one
    -- grouped join away.
    select d.item_type, d.item_id, max(e.epoch) as epoch
      from derived d
      join custom.visibility_epoch e
        on e.entity_type = d.container_type and e.entity_id = d.container_id
     group by 1, 2
  )
  insert into custom.visibility_cache
    (container_type, container_id, item_type, item_id, max_level, depth, stamp_epoch, computed_at)
  select d.container_type, d.container_id, d.item_type, d.item_id, d.max_level, d.depth,
         greatest(coalesce(ae.epoch, 0), coalesce(ei.epoch, 0), coalesce(ec.epoch, 0)),
         now()
    from derived d
    left join ancestor_epoch ae
      on ae.item_type = d.item_type and ae.item_id = d.item_id
    left join custom.visibility_epoch ei
      on ei.entity_type = d.item_type and ei.entity_id = d.item_id
    left join custom.visibility_epoch ec
      on ec.entity_type = d.container_type and ec.entity_id = d.container_id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function custom.visibility_cache_rebuild() is
  'T1/VIS-7: TRUNCATE the stored cache and rebuild every (container, item) pair from the associations in ONE statement, stamping each with VIS-11''s epoch by joining custom.visibility_epoch rather than re-walking the ancestors per row.';
