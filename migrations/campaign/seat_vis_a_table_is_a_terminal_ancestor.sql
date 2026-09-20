-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.visibility_ancestors(text, uuid) 6391b7a9edc4569a4a94f392d5c3a3f11e00bced0ce57e61006b4765523fb7ef
--
-- SEAT-SUITES — A TABLE IS A TERMINAL ANCESTOR. Sharing ONE Home of a Table handed a person
-- EVERY record of that Table, in every other Home.
--
-- WHAT WAS MEASURED, on the main database, 2026-09-19, from the seat `authenticated`:
--   An organization has Project X and Project Y. The Table `Risk` is declared once and placed
--   in BOTH of them with `custom.home_add` (T10: one Table, two Homes). `test@test.com` is a
--   member, the organization's `custom/member_default_visibility` is `shared_only` (so
--   membership hands her nothing), and she is shared PROJECT X at viewer and nothing else.
--   `custom.query_can_see(org, "Y risk", 'viewer')` answered TRUE. Project X came back as a
--   depth-2 ancestor of a record that lives in Project Y.
--
-- WHY. `custom.carrying_edges_of` arm 3 (SHARED-ONLY, 2026-09-19) makes a record's own Table
-- one of its carrying containers, so that a person shared a whole Table sees its rows rather
-- than an empty screen. `custom.visibility_ancestors` then walked UP from that Table like any
-- other container — and a Table's containers are its HOMES. So:
--     Y risk -> Risk (its Table) -> every Home of Risk, including Project X.
-- Arm 3's own comment says the edge exists so that reaching the TABLE reaches its rows. It
-- never said that reaching anything that CONTAINS the table reaches them: that step is what
-- turns "one Table, two Homes" into "two Homes, one pile of records", which is the exact
-- opposite of T10 and a cross-project leak inside one organization.
--
-- THE FIX, and it is one line of logic: the Table a record lives in is a TERMINAL ancestor.
-- It is still an ancestor — sharing the Table still conveys its rows, at the same `admin`
-- ceiling, so nothing arm 3 was built for changes — but the walk stops there instead of
-- continuing into the Table's Homes. Every other ancestor of a record is unchanged, including
-- its own containment parent: the record that lives in Project Y still reaches Project Y at
-- depth 1, by the containment edge it has always had, and a record that lives in Project X
-- still reaches Project X the same way.
--
-- A node that is reachable BOTH as this record's Table and by some other path is not pinned
-- shut: only the row produced by the Table arm is terminal, and the other path expands as
-- before.
--
-- THE INVERSE is migrations/inverse/seat_vis_a_table_is_a_terminal_ancestor_down.sql, which
-- puts back the body this file replaced, byte for byte.
--
-- SHOWN RED THEN GREEN: scripts/campaign-tests/visfix_green.sql CLAUSE 1
-- ("Dana sees a risk inside Project Y, which she is not shared on") fails against the body
-- this file replaces and passes against this one.

create or replace function custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 returns table(container_type text, container_id uuid, depth integer, max_level permission_level)
 language sql
 stable security definer
 set search_path to ''
as $fn$
  with recursive seed as (
    -- THE ONE NEW FACT: which of this item's containers IS the Table it lives in. Everything
    -- else about the walk is unchanged.
    select e.container_type, e.container_id, e.conveys_max,
           (p_item_type = 'record'
            and exists (select 1 from custom.record r
                         where r.id = p_item_id and r.table_id = e.container_id)) as is_table
      from custom.carrying_edges_of(p_item_type, p_item_id) e
  ), up as (
    select s.container_type, s.container_id, 1 as depth, s.conveys_max as max_level, s.is_table,
           array[p_item_type || ':' || p_item_id::text,
                 s.container_type || ':' || s.container_id::text] as path
      from seed s
    union all
    select e.container_type, e.container_id, u.depth + 1,
           least(u.max_level, e.conveys_max), false,
           u.path || (e.container_type || ':' || e.container_id::text)
      from up u
      cross join lateral custom.carrying_edges_of(u.container_type, u.container_id) e
     -- `not u.is_table` is the whole change: a Table is where the walk stops, because a
     -- Table's own containers are its Homes and a Home of the Table is not a container of
     -- every record in it.
     where u.depth < 16
       and not u.is_table
       and not (e.container_type || ':' || e.container_id::text) = any (u.path)
  )
  select u.container_type, u.container_id, min(u.depth), max(u.max_level)
    from up u
   group by u.container_type, u.container_id;
$fn$;
