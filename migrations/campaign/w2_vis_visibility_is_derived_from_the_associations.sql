-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W2-VIS — VISIBILITY IS DERIVED FROM THE ASSOCIATIONS, AND FROM NOTHING ELSE.
--
-- VIS-1 · VIS-2 · VIS-3 · VIS-4 · VIS-5 · VIS-6 · VIS-7 · VIS-15 · VIS-28.
--
-- WHAT THIS EXTENDS, AND WHAT IT DOES NOT REPLACE
-- -----------------------------------------------
-- The platform already has an access kernel and this file does not build a second one:
--
--   platform.containment_edges   a VIEW over platform.associations JOIN platform.association_types,
--                                emitting one row per CARRYING edge (container_side source|target)
--                                with the type's conveys_max.
--   platform.derive_reachability the closure over those edges: LEAST(conveys_max) along a path,
--                                MAX over paths, path-array cycle guard, `WHERE depth < 8`.
--   platform.reachability        the stored closure — a CACHE, rebuilt by TRUNCATE-and-recompute.
--   iam.has_access_for_base      the per-row resolver, which walks platform.reachability upward.
--
-- The new record store (`custom.record`) needs two things the platform's own declarations cannot
-- express today, because platform.association_types is keyed `(source_type, target_type)` — ONE row
-- per type pair — while every edge in the new store is `record -> record` and what distinguishes a
-- containment from a Table Home from a carrying reference is the association's `role`, not its
-- type pair. Declaring `record -> record` as carrying in association_types would make EVERY
-- record-to-record association carry, including the ordinary relations W1-REL stores with
-- `role` = the field key. That is the opposite of VIS-1.
--
-- So this file adds a ROLE-KEYED carrying declaration beside the platform's TYPE-KEYED one, and a
-- single view, custom.carrying_edges, that is the UNION of both. Every function below reads that
-- one view. platform.containment_edges is untouched; platform.derive_reachability is untouched;
-- iam.has_access_for_base is untouched. Nothing that exists today answers differently.
--
-- THE FIVE SOURCES (VIS-1)
-- ------------------------
-- Visibility is derived from the associations alone:
--   1. containment          role 'contains'  — a record inside a record
--   2. Table Homes          role 'home'      — a Table homed in a Record. VIS-5: sharing the Record
--                                              shares the existence, name and Fields of every Table
--                                              homed in it, because the Table IS a record and the
--                                              home edge carries. A principal not shared cannot
--                                              tell the Table exists: no edge, no row, no answer.
--   3. carrying references  role 'references' — a referenced relation that carries, capped at viewer
--   4. direct shares        iam.permissions rows on the record itself
--   5. the platform's own containment, inherited through the view's first arm
-- and from nothing else. There is no sixth arm and no stored visibility column consulted anywhere
-- below.
--
-- UNION IS THE MAXIMUM, MINIMUM IS ALONG THE PATH, AND THE LOOP TERMINATES (VIS-2, VIS-3, VIS-4)
-- ---------------------------------------------------------------------------------------------
-- `least(w.max_level, e.conveys_max)` walking down a path is VIS-3: access is the MINIMUM along a
-- path. `max(w.max_level) group by item` across the walk's rows is VIS-2: visibility is the UNION,
-- the MAXIMUM, across every carrying path — never one path's value alone. The path array plus
-- `not ... = any(w.path)` is VIS-4: the walk terminates on loops, and it terminates the same way
-- when the answer is NEGATIVE — a looping graph with no reachable seed simply exhausts its frontier
-- and returns no rows, rather than recursing to `54001 stack depth limit exceeded` the way
-- iam.has_access_for_base did before DD-263.
--
-- UNION ONLY. NO DENY. (VIS-6)
-- ----------------------------
-- There is no deny row, no exclusion table, no NOT EXISTS against a revocation anywhere in this
-- file. `is_active = false` on a carrying rule removes the EDGE — it is the absence of a grant,
-- not the presence of a denial — and removing an edge can only ever take access away from the
-- union, never override a path that still exists.
--
-- THE DEPTH CEILING IS 16, AND IT IS READ OUT OF THE FUNCTION (REC-N-4, REACHABILITY.md inv. 6)
-- --------------------------------------------------------------------------------------------
-- Both recursions below carry `depth < 16`. That literal is the cap; no document is consulted at
-- runtime. The live platform.derive_reachability carries `depth < 8` and can emit nothing past
-- depth 8 — a fact about the function this one sits beside, and the comparison domain any parity
-- diff between the two has.
--
-- ANY STORED FORM IS A CACHE (VIS-7, VIS-28)
-- ------------------------------------------
-- Nothing in this file stores an answer. custom.derive_visibility and custom.visibility_ancestors
-- read the associations every time. The pair-keyed cache and the epochs are W2-EPOCH's file, and
-- they are a cache in the strict sense the row demands: droppable, rebuildable, and never the
-- authority. VIS-28: nothing here is attached to association-type registration, so registering an
-- association type still TRUNCATEs nothing of this lane's.
--
-- REVERSIBLE: yes — migrations/inverse/w2_vis_visibility_is_derived_from_the_associations_down.sql
-- drops exactly the objects created here, in dependency order. Nothing outside schema `custom` is
-- created, altered or dropped by either direction.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ---------------------------------------------------------------------------------------------
-- 1. THE ROLE-KEYED CARRYING DECLARATION.
--
-- Seven columns, none of them the shape guard's (`created_by`, `created_at`, `updated_at`,
-- `deleted_at`, `metadata`, `version`, `visibility`): this is access machinery, not a
-- business-shaped relation, and platform.provision is not the door for it.
-- ---------------------------------------------------------------------------------------------
create table if not exists custom.carrying_rule (
  role            text not null primary key,
  kind            text not null,
  container_side  text not null,
  conveys_max     public.permission_level not null,
  is_active       boolean not null default true,
  note            text,
  constraint carrying_rule_kind_check
    check (kind in ('containment', 'home', 'reference')),
  constraint carrying_rule_side_check
    check (container_side in ('source', 'target'))
);

comment on table custom.carrying_rule is
  'W2-VIS / VIS-1. Which association ROLES carry visibility, and at what maximum level. The '
  'platform''s own declaration (platform.association_types) is keyed by TYPE PAIR and cannot '
  'distinguish a containment from an ordinary relation when both are record -> record; this one '
  'is keyed by role and does. Both are unioned by custom.carrying_edges. Deactivating a row '
  'removes an EDGE — it is never a deny (VIS-6).';

insert into custom.carrying_rule (role, kind, container_side, conveys_max, note) values
  ('contains',   'containment', 'source', 'admin',
   'A record inside a record. Carries up to admin; the minimum along the path decides the rest.'),
  ('home',       'home',        'source', 'admin',
   'VIS-5. A Table homed in a Record. Sharing the Record shares the existence, name and Fields of '
   'the Table, because the Table is itself a record and this edge carries. A principal not shared '
   'reaches no edge and the Table does not appear in any answer.'),
  ('references', 'reference',   'source', 'viewer',
   'T11. A referenced relation that carries. Capped at viewer: sharing A with Dana as editor makes '
   'her a VIEWER of B, the level stepped down, never an editor of B.')
on conflict (role) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. ONE VIEW, THE UNION OF BOTH DECLARATIONS.
--
-- UNION, not UNION ALL: an edge declared by both sides at the same level collapses to one row, and
-- an edge declared by both at DIFFERENT levels stays as two rows, which the closure's
-- `max(max_level)` then resolves to the more permissive — VIS-2, the union is the maximum.
-- ---------------------------------------------------------------------------------------------
create view custom.carrying_edges with (security_invoker = true) as
  select ce.container_type, ce.container_id, ce.item_type, ce.item_id, ce.conveys_max
    from platform.containment_edges ce
  union
  select
    case when cr.container_side = 'source' then a.source_type else a.target_type end,
    case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
    case when cr.container_side = 'source' then a.target_type else a.source_type end,
    case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
    cr.conveys_max
  from platform.associations a
  join custom.carrying_rule cr on cr.role = a.role and cr.is_active
  where a.deleted_at is null;

comment on view custom.carrying_edges is
  'W2-VIS / VIS-1. Every carrying edge in the system: the platform''s type-keyed declarations and '
  'the new store''s role-keyed ones, unioned. This is the ONLY thing the derivation reads.';

-- ---------------------------------------------------------------------------------------------
-- 3. THE DERIVATION, DOWNWARD. What a container conveys.
-- ---------------------------------------------------------------------------------------------
create function custom.derive_visibility(
  p_container_type text,
  p_container_id   uuid
) returns table (item_type text, item_id uuid, depth integer, max_level public.permission_level)
language sql
stable
security definer
set search_path to ''
as $$
  with recursive walk as (
    select e.item_type, e.item_id, 1 as depth, e.conveys_max as max_level,
           array[p_container_type || ':' || p_container_id::text,
                 e.item_type || ':' || e.item_id::text] as path
    from custom.carrying_edges e
    where e.container_type = p_container_type
      and e.container_id   = p_container_id
    union all
    select e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),          -- VIS-3: the MINIMUM along the path
           w.path || (e.item_type || ':' || e.item_id::text)
    from walk w
    join custom.carrying_edges e
      on  e.container_type = w.item_type
      and e.container_id   = w.item_id
    where w.depth < 16                                  -- REC-N-4: the ceiling, read from here
      and not (e.item_type || ':' || e.item_id::text) = any (w.path)   -- VIS-4: loops terminate
  )
  select w.item_type, w.item_id, min(w.depth), max(w.max_level)  -- VIS-2: the MAXIMUM across paths
  from walk w
  group by w.item_type, w.item_id;
$$;

comment on function custom.derive_visibility(text, uuid) is
  'W2-VIS / VIS-1..VIS-6. Everything a container conveys, derived from the associations alone. '
  'LEAST along a path, MAX across paths, path-array cycle guard, depth ceiling 16 (REC-N-4 — the '
  'literal in this body IS the ceiling). Stores nothing.';

-- ---------------------------------------------------------------------------------------------
-- 4. THE DERIVATION, UPWARD. Everything that conveys to an item, with what it conveys.
--
-- This is the half a READ needs: an access question starts at a record and asks what reaches it.
-- ---------------------------------------------------------------------------------------------
create function custom.visibility_ancestors(
  p_item_type text,
  p_item_id   uuid
) returns table (container_type text, container_id uuid, depth integer, max_level public.permission_level)
language sql
stable
security definer
set search_path to ''
as $$
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
$$;

comment on function custom.visibility_ancestors(text, uuid) is
  'W2-VIS. The upward half of custom.derive_visibility: everything that conveys to this item and '
  'what it conveys. Same ceiling, same cycle guard, same union-is-maximum.';

-- ---------------------------------------------------------------------------------------------
-- 5. THE PER-ROW ANSWER.
--
-- This EXTENDS iam.has_access_for_base rather than reimplementing it: every ancestor this lane's
-- derivation finds is handed to the platform's own resolver, which decides whether the principal
-- reaches THAT container by any of its sixteen arms. The new store contributes the carrying paths;
-- the kernel still decides what a principal holds.
--
-- VIS-15: after any commit no read returns a record the reader has lost. Because nothing here is
-- stored, an edge removed in a commit is gone from custom.carrying_edges for the very next read in
-- the same or any later snapshot — there is no cache to serve stale from. W2-EPOCH's cache re-states
-- this guarantee for the stored form it adds.
-- ---------------------------------------------------------------------------------------------
create function custom.has_visibility(
  p_user_id  uuid,
  p_type     text,
  p_id       uuid,
  p_required public.permission_level default 'viewer'
) returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  rec record;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- Source 4: a direct share on the record itself, through the platform's one grant mechanism.
  if public.has_permission_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- Sources 1, 2, 3, 5: every carrying path, unioned. The first ancestor that conveys at least
  -- p_required AND that the kernel says this principal reaches, answers true.
  for rec in
    select a.container_type, a.container_id
    from custom.visibility_ancestors(p_type, p_id) a
    where a.max_level >= p_required
    order by a.depth
  loop
    if iam.has_access_for_base(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function custom.has_visibility(uuid, text, uuid, public.permission_level) is
  'W2-VIS / VIS-1..VIS-6, VIS-15. Does this principal reach this record? Direct share, or any '
  'carrying path whose minimum level clears p_required and whose container the platform kernel '
  'says the principal reaches. Union only; no deny arm exists.';

-- ---------------------------------------------------------------------------------------------
-- 6. THE SET-BASED ANSWER — one question per page, not one per row (VIS-N-1's branch half).
--
-- plpgsql with a to_regclass gate on custom.record, so this file lands on a database where the
-- record store has not been built yet and starts answering the moment it is. The kernel call is
-- made ONCE PER DISTINCT CONTAINER, never once per row: that is the whole point of the row.
-- ---------------------------------------------------------------------------------------------
create function custom.visible_record_ids(
  p_user_id  uuid,
  p_required public.permission_level default 'viewer'
) returns table (id uuid)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_own_arm text := '';
begin
  if p_user_id is null then return; end if;

  if to_regclass('custom.record') is not null then
    v_own_arm :=
      ' union select r.id from custom.record r'
      || ' where r.deleted_at is null and r.created_by = $1';
  end if;

  return query execute
    'with recursive seeds as ('
    || '  select c.container_type, c.container_id'
    || '  from (select distinct e.container_type, e.container_id from custom.carrying_edges e) c'
    || '  where iam.has_access_for_base($1, c.container_type, c.container_id, $2)'
    || '), down as ('
    || '  select e.item_type, e.item_id, e.conveys_max as max_level, 1 as depth,'
    || '         array[e.container_type || '':'' || e.container_id::text,'
    || '               e.item_type || '':'' || e.item_id::text] as path'
    || '  from custom.carrying_edges e'
    || '  join seeds s on s.container_type = e.container_type and s.container_id = e.container_id'
    || '  union all'
    || '  select e.item_type, e.item_id, least(d.max_level, e.conveys_max), d.depth + 1,'
    || '         d.path || (e.item_type || '':'' || e.item_id::text)'
    || '  from down d'
    || '  join custom.carrying_edges e'
    || '    on e.container_type = d.item_type and e.container_id = d.item_id'
    || '  where d.depth < 16'
    || '    and not (e.item_type || '':'' || e.item_id::text) = any (d.path)'
    || ')'
    || 'select d.item_id from down d'
    || '  where d.item_type = ''record'' and d.max_level >= $2'
    || ' union'
    || ' select p.resource_id from iam.permissions p'
    || '  where p.resource_type = ''record'''
    || '    and (p.granted_to_user_id = $1'
    || '         or p.granted_to_organization_id in ('
    || '              select om.organization_id from iam.organization_member om'
    || '               where om.user_id = $1))'
    || '    and p.status <> ''rejected'''
    || '    and (p.expires_at is null or p.expires_at > now())'
    || '    and p.permission_level >= $2'
    || v_own_arm
    using p_user_id, p_required;
end;
$$;

comment on function custom.visible_record_ids(uuid, public.permission_level) is
  'W2-VIS / VIS-N-1 branch half. Every record this principal reaches, as ONE set-based recursive '
  'join. The kernel is asked once per distinct CONTAINER, never once per row.';

-- ---------------------------------------------------------------------------------------------
-- 7. THE FALSIFIABLE SELF-CHECK. Rebuild from the associations alone; every answer unchanged.
--
-- VIS-7: any stored form is a cache. This function proves the derivation owes nothing to the
-- stored closure by deriving the SAME closure platform.reachability holds, for every container the
-- platform's own declarations carry, and diffing it both ways. A row the cache holds that the
-- derivation cannot produce is `cache_only`; a row the derivation produces that the cache lacks is
-- `derived_only`. Empty = the stored form is redundant and droppable.
--
-- The comparison domain is stated rather than assumed (T1): platform.derive_reachability recurses
-- `depth < 8` and this derivation `depth < 16`, so rows at depth 9..16 are DERIVED-ONLY by
-- construction and are reported with reason 'beyond_stored_ceiling' rather than counted as drift.
-- ---------------------------------------------------------------------------------------------
create function custom.visibility_parity()
returns table (side text, container_type text, container_id uuid,
               item_type text, item_id uuid,
               stored_level public.permission_level,
               derived_level public.permission_level,
               reason text)
language sql
stable
security definer
set search_path to ''
as $$
  with containers as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), derived as (
    select c.ct as container_type, c.ci as container_id, d.item_type, d.item_id, d.depth, d.max_level
    from containers c
    cross join lateral custom.derive_visibility(c.ct, c.ci) d
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
  'W2-VIS / VIS-7, T1. The stored closure diffed against a fresh derivation from the associations '
  'alone, both directions. Rows deeper than the stored form''s own `depth < 8` ceiling are reported '
  'with reason `beyond_stored_ceiling` — the comparison domain, stated rather than assumed.';

-- ---------------------------------------------------------------------------------------------
-- 8. THE ACCESS DECISION, DECLARED IN DATA.
--
-- Every function above is SECURITY DEFINER, because the derivation must read platform.associations
-- and iam.permissions whatever the caller's own RLS says. None of them is a client door: the whole
-- read path for the new store is W4-DOOR's, and until it lands these are server-lane only. Said in
-- data rather than in prose, which is what platform.provision_shape_settled requires.
-- ---------------------------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'derive_visibility', 'p_container_type text, p_container_id uuid',
   'p_container_type/p_container_id name a container; the function returns what that container '
   'conveys and makes no access decision about the CALLER at all. NULL container_id returns no rows.',
   'w2_vis_visibility_is_derived_from_the_associations.sql',
   'server_only: read by custom.has_visibility, custom.visible_record_ids and custom.visibility_parity '
   'inside the database. No client calls it; the client read path for the new store is W4-DOOR''s single '
   'read door, and schema custom is revoked from every client role until switch-checklist step 3.',
   false, false),
  ('custom', 'visibility_ancestors', 'p_item_type text, p_item_id uuid',
   'p_item_type/p_item_id name a record; the function returns what conveys to it and makes no access '
   'decision about the CALLER. NULL item_id returns no rows.',
   'w2_vis_visibility_is_derived_from_the_associations.sql',
   'server_only: read by custom.has_visibility inside the database. No client calls it; schema custom '
   'is revoked from every client role until switch-checklist step 3.',
   false, false),
  ('custom', 'has_visibility', 'p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level',
   'p_user_id is the PRINCIPAL the answer is about and is checked against public.has_permission_for '
   'and iam.has_access_for_base — it is never taken as an assertion of who the caller is. p_id is the '
   'record, checked against every carrying path custom.visibility_ancestors finds. A NULL p_user_id or '
   'a NULL p_id returns false.',
   'w2_vis_visibility_is_derived_from_the_associations.sql',
   'server_only: the per-row answer behind the read door W4-DOOR builds. A client that could pass an '
   'arbitrary p_user_id would be asking about someone else, so this never becomes a client door in this '
   'signature; schema custom is revoked from every client role until switch-checklist step 3.',
   false, false),
  ('custom', 'visible_record_ids', 'p_user_id uuid, p_required public.permission_level',
   'p_user_id is the PRINCIPAL the set is computed for, checked through iam.has_access_for_base on '
   'every container and through iam.permissions on every direct grant. A NULL p_user_id returns no rows.',
   'w2_vis_visibility_is_derived_from_the_associations.sql',
   'server_only: the set-based page answer, read by W2-PRED''s arm of iam.accessible_entity_ids, which '
   'resolves the principal from auth.uid() itself. No client passes p_user_id; schema custom is revoked '
   'from every client role until switch-checklist step 3.',
   false, false),
  ('custom', 'visibility_parity', '',
   'Takes no entity id and makes no access decision. Returns a diff between platform.reachability and a '
   'fresh derivation — container and item identifiers only, no row contents.',
   'w2_vis_visibility_is_derived_from_the_associations.sql',
   'server_only: an operator and verifier check, run through a direct database connection. It reads the '
   'whole stored closure, so no client role is ever given it.',
   false, false)
on conflict do nothing;

-- No GRANT and no REVOKE: schema `custom` is already revoked from PUBLIC, anon, authenticated and
-- service_role by W1-STORE's first file, and switch-checklist step 3 is the only place that opens
-- it. Nothing here needs a door of its own.
