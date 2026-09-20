-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.visibility_ancestors(text, uuid) e7c6736946acc44368cf5b290a377fbe742a5c3e06505f0db0d8aabca62d2c0b
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 077f2d8a996b8ca5075e4f5011a907ee5a39d51ac105d21e8076b5592fca941e
--
-- LEAK-T10 — A HOME OF A TABLE IS NOT THE WHOLE TABLE, IN THE SET-BASED READ PATH TOO.
--
-- WHAT A PERSON GOT, measured on the MAIN database on 2026-09-20 from the seat
-- `authenticated`, as `test@test.com`, in an organization whose
-- `custom/member_default_visibility` is `shared_only`:
--
--   One Table `Risk`, placed in BOTH `Project X` and `Project Y` with `custom.home_add`
--   (acceptance test 10: one Table, two Homes). One risk lives in X, one in Y. She is shared
--   PROJECT X at viewer and nothing else.
--
--     custom.read_record(risk in Y)   -> REFUSED, 42501 "You do not have access to this record."
--     custom.has_visibility(risk in Y) -> false
--     custom.read_records             -> 2 rows, INCLUDING risk in Y, with its contents
--     custom.query_visible_ids        -> 2 ids
--     custom.query_across_homes       -> 2 rows
--     custom.io_export                -> both rows
--
--   Two doors of one store, the same row, opposite answers — and the list is the one that
--   leaks. The seventh independent pass called it the only defect it would stop a launch for.
--
-- WHY. `seat_vis_a_table_is_a_terminal_ancestor.sql` closed this for the PER-ROW ladder by
-- making the Table a record lives in a terminal ancestor, so the walk no longer climbs from a
-- row into its Table's Homes. The SET-BASED path never asked that question per row. It has a
-- whole-Table shortcut — one ladder call about the TABLE answers for every row on the page —
-- and it asked `custom.reaches_directly(p_user, 'record', p_table_id, …)`. There the Table is
-- the SUBJECT, not an ancestor: arm 3 walks up from the Table itself, and a Table's containers
-- are its HOMES. Project X is a Home of `Risk`, she reaches Project X, so the shortcut said
-- "this Table carries everything in it" and the door returned the whole Table.
--
-- The terminal rule and the shortcut were reading the same edge two different ways. What the
-- per-row ladder actually asks about the terminal Table is one thing and it is not
-- `reaches_directly`: it is `iam.has_access_for(user, 'record', <the Table>, required)` — a
-- grant, ownership, an organization lane, the platform's own containment closure. So the
-- shortcut now asks exactly that, which is parity by construction rather than by agreement.
-- Everything the shortcut was built for still works: a whole Table shared through
-- `custom.share_grant` writes an `iam.permissions` row, which `iam.has_access_for` admits.
--
-- AND THE TERMINAL RULE ONLY HELD AT DEPTH 1. `custom.visibility_ancestors` computed its
-- `is_table` flag in the SEED and hard-coded `false` in the recursive term, so the same climb
-- happened one level further out and was never seen: a risk in Project Y reached the PROJECTS
-- table (because Project Y is a row of it) and then every Home of the Projects table. Measured
-- on the same fixture: `custom.visibility_ancestors('record', risk in Y)` returned the Projects
-- table at depth 2 and the record above it at depth 3. A leak that reappears one level up is
-- not fixed, so the flag is now computed at EVERY depth, from the edge that was taken: an edge
-- whose container is the child's own `table_id` is a Table edge, wherever in the walk it falls.
--
-- WHAT THIS DOES NOT CHANGE. Sharing a Table still conveys its rows at the same `admin`
-- ceiling. Sharing a Home still conveys the records that live in that Home, by the containment
-- edge they have always had — `custom.read_door_carried_ids` resolves those and is untouched,
-- because `custom.carrying_edges_in` deliberately never carried the Table edge. A record's own
-- containment parents are unchanged at every depth.
--
-- THE GUARD is census 13 of `pnpm check:store-doors-decide`
-- (`custom.list_door_disagreements`): every list-shaped door against `custom.read_record`, per
-- (member, record), in every organization, under both privacy settings, exhaustive for a Table
-- with more than one Home. It names 3 rows on the main database with this file reverted.
--
-- THE INVERSE is migrations/inverse/leakt10_a_home_of_a_table_is_not_the_whole_table_down.sql.

CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           least(u.max_level, e.conveys_max),
           -- LEAK-T10: THE SAME FACT, AT EVERY DEPTH. This was hard-coded `false`, so the
           -- terminal rule held only for the row the walk started from. One step further out
           -- a Home is a row of some Table too, and the walk climbed from that Table into ITS
           -- Homes — the same leak, one level up, in a place no test looked.
           (u.container_type = 'record'
            and exists (select 1 from custom.record r
                         where r.id = u.container_id and r.table_id = e.container_id)),
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
$function$;

CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label   text;
  v_vis     platform.visibility;
  v_rep     uuid;
  v_id      uuid;
  v_n       integer;
  v_window  integer;
  v_carried record;
  -- SHARED-ONLY (2026-09-19): does the caller reach the TABLE itself at this level? Asked
  -- ONCE, before anything else, because it answers for every row at once.
  v_table_carries boolean := false;
  v_tables        integer;
begin
  o_all_visible     := false;
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;

  if p_user is null or p_organization_id is null then
    o_fallback := true;
    o_note := 'READ-PERF: no principal, so the set-based shape has nobody to answer for. The door is walking the per-row ladder, which is what it did before this file.';
    return;
  end if;

  -- THE FOURTH THING THAT MAKES IT STOP (SHARED-ONLY). With no Table named, the answer spans
  -- the kernel Table as well as every ordinary one, and a Table is no longer a member of a
  -- visibility CLASS — it is visible when something inside it is (arm 4 of the one ladder),
  -- so two Tables of one class answer differently and no representative can speak for them.
  if p_table_id is null then
    o_fallback := true;
    o_note := 'SHARED-ONLY: no Table was named, so this answer spans the kernel Table, whose rows '
           || 'are Tables — and a Table is visible when a record inside it is, which is not a '
           || 'property of its visibility class. The door is walking the per-row ladder. REMEDY: '
           || 'name the Table, or give custom.visible_set a per-Table carry list the way '
           || 'custom.visible_predicate_sql would need to emit `table_id = any(...)`.';
    return;
  end if;

  -- THE FIRST THING THAT MAKES IT STOP. `iam.has_access_for_base` pushes a child's REGISTERED
  -- FK parents onto its frontier as well as the closure. There is no such registration for
  -- `record` today, so a record's containers come only from associations — which
  -- `custom.read_door_carried_ids` resolves. If one is ever registered, a row's container is a
  -- COLUMN of its own row, two rows of one class stop answering alike, and the argument this
  -- file rests on stops holding. So it says so and walks.
  if exists (select 1 from platform.entity_relationships er
              where er.child_type = 'record' and er.kind in ('composition', 'containment')) then
    o_fallback := true;
    o_note := 'READ-PERF: `record` now has a registered FK containment parent in '
           || 'platform.entity_relationships, so a row''s container is a column of its own row and '
           || 'two rows of one visibility class no longer answer alike. The door is walking the '
           || 'per-row ladder. REMEDY: teach custom.visible_set to classify on that column too, or '
           || 'seed custom.read_door_carried_ids from it the way it is seeded from associations.';
    return;
  end if;

  -- THE TABLE ITSELF, ONCE (SHARED-ONLY). A Table shared with somebody carries every row in it
  -- (arm 3 of `custom.carrying_edges_of`), so one ladder call about the TABLE answers for the
  -- whole page.
  --
  -- 🚨 AND THE QUESTION IS `iam.has_access_for`, NOT `custom.reaches_directly` (LEAK-T10,
  -- 2026-09-20). This is the whole of acceptance test 10 and it is a live cross-project leak.
  -- `custom.reaches_directly` treats the Table as the SUBJECT of the walk, so its arm 3 climbs
  -- from the Table into the Table's own HOMES — and a person shared ONE Home of a Table was
  -- handed every record of that Table in every other Home, with its contents, by this line,
  -- while `custom.read_record` refused her the same row.
  --
  -- What the PER-ROW ladder asks about this Table is one thing, and asking exactly it is what
  -- makes the two doors agree by construction instead of by agreement:
  -- `custom.visibility_ancestors` returns the Table as a TERMINAL ancestor of every row in it,
  -- at `admin`, and `custom.reaches_directly` arm 3 then asks
  -- `iam.has_access_for(user, 'record', <the Table>, required)` about it — ownership, a grant
  -- row, the organization lanes, the platform's own containment closure, and nothing above
  -- them. A whole Table shared through `custom.share_grant` writes the `iam.permissions` row
  -- that admits it, so the case this shortcut exists for is untouched.
  --
  -- The rows it does NOT speak for are the ones whose own `visibility` is below `internal`,
  -- which that edge deliberately does not carry; they fall through to their class below.
  --
  -- THE SAME-ORGANISATION, LIVE-ROW JOIN STAYS. The kernel Tables (`Table`, `Field`, and the
  -- home-record kernel every fixture hangs off) live in the SYSTEM organization, which is
  -- global_readable, so `iam.has_access_for` says yes about them to EVERY signed-in person.
  -- Without this line `p_table_id = 11111111-…-0002` — the Field kernel — made every Field row
  -- of a `shared_only` organization visible to every member.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := iam.has_access_for(p_user, 'record', p_table_id, p_required);
  end if;

  -- THE GRANTED IDS, and the second thing that makes it stop.
  o_granted_all := custom.read_door_granted_ids(p_organization_id, p_table_id);
  v_n := coalesce(array_length(o_granted_all, 1), 0);
  if v_n > custom.read_door_ladder_ceiling() then
    o_fallback := true;
    o_note := format('READ-PERF: %s ids of this Table carry a grant, a membership or a closure row, '
                  || 'which is over the ceiling of %s, so asking them one at a time is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or resolve grants set-based the way '
                  || 'custom.read_door_carried_ids resolves containment.',
                  v_n, custom.read_door_ladder_ceiling());
    return;
  end if;

  -- THE TABLE LIST (SHARED-ONLY). The rows of the kernel Table are the organization's Tables,
  -- and a Table is visible when a record inside it is — one Table at a time, never by class.
  -- An organization holds a few hundred Tables at the very most (263 is the largest on this
  -- database today, against a ceiling of 5,000), so this enumerates them and asks the ladder
  -- once each. Over the ceiling it says so and walks, like every other stop here.
  if p_table_id = custom.table_kernel_id() then
    select count(*) into v_tables
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.deleted_at is null;
    if v_tables > custom.read_door_ladder_ceiling() then
      o_fallback := true;
      o_note := format('SHARED-ONLY: this organization holds %s Tables, over the ceiling of %s, and a '
                    || 'Table is visible when a record inside it is - which no representative can '
                    || 'answer for. The door is walking the per-row ladder. REMEDY: raise '
                    || 'custom.read_door_ladder_ceiling(), or index the "does this Table hold a row '
                    || 'this person reaches" question the way custom.visibility_cache intends.',
                    v_tables, custom.read_door_ladder_ceiling());
      return;
    end if;
    for v_id in
      select r.id
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
    loop
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_id, p_required) then
        o_carried_visible := o_carried_visible || v_id;
      end if;
    end loop;
    o_all_visible := (v_tables = coalesce(array_length(o_carried_visible, 1), 0));
    return;
  end if;

  -- CONTAINMENT, ONCE, DOWNWARD — and the third thing that makes it stop.
  v_carried := custom.read_door_carried_ids(p_user, p_organization_id, p_table_id, p_required);
  o_ladder_calls := o_ladder_calls + coalesce(v_carried.o_containers, 0);
  if v_carried.o_ids is null then
    o_fallback := true;
    o_note := format('READ-PERF: this Table''s records sit under %s distinct containers, which is '
                  || 'over the ceiling of %s, so asking the ladder about each of them is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or give the containers an accessible-set '
                  || 'cache the way VIS-9''s epochs intend.',
                  v_carried.o_containers, custom.read_door_ladder_ceiling());
    return;
  end if;
  o_carried_visible := v_carried.o_ids;

  -- THE CLASSES. One ladder call for each label of `platform.visibility` this Table actually
  -- holds, asked about a row that is NOT the caller's own, NOT granted and NOT carried — the
  -- three things that would make a representative answer for a reason its class does not have.
  for v_label in select e.enumlabel
                   from pg_catalog.pg_enum e
                   join pg_catalog.pg_type t on t.oid = e.enumtypid
                   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'visibility'
                  order by e.enumsortorder
  loop
    v_vis := v_label::platform.visibility;
    -- THE TABLE ALREADY ANSWERED FOR THIS CLASS (SHARED-ONLY). The Table edge carries every
    -- row at or above `internal`, so when the caller reaches the Table there is nothing left
    -- to ask about those classes and no representative to find.
    if v_table_carries and v_vis >= 'internal'::platform.visibility then
      o_true_visibility := o_true_visibility || v_vis;
      continue;
    end if;
    -- THE ROW THIS CLASS SPEAKS FOR, found in three bounded index scans instead of one scan of
    -- the class. `created_by is distinct from p_user` is two ranges and a null, and each of the
    -- three stops at its own first entry; the window is one row wider than the number of ids
    -- that may not represent their class, so it cannot miss a row it is allowed to choose.
    v_window := coalesce(array_length(o_granted_all, 1), 0)
              + coalesce(array_length(o_carried_visible, 1), 0) + 1;
    select c.id into v_rep
      from (
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by is null
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by < p_user
          order by r.created_by desc
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by > p_user
          order by r.created_by asc
          limit v_window)
      ) c
     where not (c.id = any (o_granted_all))
       and not (c.id = any (o_carried_visible))
     limit 1;
    if v_rep is not null then
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_rep, p_required) then
        o_true_visibility := o_true_visibility || v_vis;
      end if;
    end if;
  end loop;

  -- THE GRANTED IDS, ONE AT A TIME, ON THE ONE LADDER. Nothing here decides anything: it asks.
  foreach v_id in array o_granted_all loop
    o_ladder_calls := o_ladder_calls + 1;
    if custom.has_visibility(p_user, 'record', v_id, p_required) then
      o_granted_visible := o_granted_visible || v_id;
    end if;
  end loop;

  -- IS IT THE WHOLE TABLE? Then the page needs no visibility predicate at all and the LIMIT
  -- stops the scan at the first p_limit rows. This is the ordinary case — somebody reading a
  -- Table of their own organization — and it is the case that was costing seconds.
  o_all_visible := (v_n = 0)
                   and not exists (
                     select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.table_id is not distinct from p_table_id
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
end;
$function$;
