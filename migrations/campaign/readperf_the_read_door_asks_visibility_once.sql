-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 2ac93e2686d0a7263f745fdf8db025b5a7e89f2ec3e3e9c31b853050c3763c48
-- based-on: custom.query_visible_ids(uuid, uuid, text) a4aef47fd80145a3d3ae6954df33d74efea30307e2b064968e728d97cd511856
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) c203376a653fb7b7c137c0ed40f638a56d552b50e06ad973949db30c974939dd
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) a0249f7105af7ad8de983665a804b072d599143c5fe696c18e8b33b99e08f581
-- based-on: iam.effective_level(uuid, text, uuid, uuid, uuid) a6f3ad2657bec4688e7993d723a074afc0f0910aa7f871f969f368b9d629285f
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) 94d3fe04ee1b5a72557211ff597c0d3cf6539023d798ddfd5d6a7abf5ff824ac
-- based-on: platform.entity_row_access_attrs(text, text, uuid) b52d29a96d10ab8481ec7369489ebff9eaa80b9a49becf7cb20c62b6099895f0
--
-- READ-PERF — THE READ DOOR ASKS THE VISIBILITY QUESTION ONCE PER CALL, NOT ONCE PER ROW.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE. `custom.read_records` carries this comment:
--
--     -- STEP 1, per row: Visibility. `custom.visible_record_ids` is the set-based answer, and
--     -- the door reads it rather than asking per row (VIS-N-1).
--
-- and the three lines under it call `custom.has_visibility(v_me, 'record', r.id, 'viewer')`
-- INSIDE THE WHERE, per row, BEFORE the LIMIT. `custom.query_visible_ids` — the helper every
-- other list door joins against (`custom.agg_sql`, `custom.io_export`,
-- `custom.query_by_coordinates`, `custom.query_across_homes`, `custom.query_rollup`,
-- `custom.query_table_as_of`) — does the same over the whole Table with no limit at all. One
-- call of the ladder costs 1.1 ms warm and reads ~95 buffers, so a page costs one ladder walk
-- per row SCANNED, not per row returned.
--
-- pg_stat_statements on the main database, window opened 2026-09-11:
--
--     custom.read_records            903 calls   mean 3388 ms   max 10006 ms
--
-- 10.0 s against an 8 s `statement_timeout` on `authenticated`: the read door is the statement
-- that actually dies, and it dies because it is O(rows scanned) in a function that reads
-- sixteen partitions per call (`platform.entity_row_access_attrs` probes `custom.record` BY ID
-- ALONE on a table hash-partitioned by `organization_id`).
--
-- WHAT THIS FILE DOES. It answers Visibility ONCE PER CALL, set-based, and leaves the ONE
-- ladder (`custom.has_visibility`) as the only thing that ever decides — it is asked a bounded
-- number of times instead of an unbounded one. No arm is reimplemented and no second ladder is
-- built: VIS-17 has one ladder and this file does not add another.
--
-- THE ARGUMENT, and it is the whole safety case. For the token `record`, everything
-- `custom.has_visibility` reads about an individual row is one of exactly two kinds:
--
--   (1) THE ROW'S OWN COLUMNS — `visibility`, `created_by`, `organization_id`, `table_id`.
--       `platform.entity_row_access_attrs` reads the first three; `iam.member_lane_confers`
--       and `iam.member_default_level` read the fourth (the per-Table default written on the
--       Table record, and the `restricted`-field rule). Every other input of every arm is a
--       property of the CALLER, the ORGANIZATION or the TABLE — `custom.store_is_open`,
--       `iam.member_lane_open`, `public.is_org_admin_for`, `public.is_super_admin_for`,
--       `iam.system_orgs`, `iam.class_lanes('record')`, `iam.has_org_access_for` — and is the
--       same for every row of one Table in one call.
--
--   (2) A ROW NAMED SOMEWHERE ELSE — a grant (`iam.permissions`), a membership on the record
--       (`iam.memberships`), a library grant (`platform.entity_grants`), an education
--       assignment or any other association (`platform.associations`, which is what
--       `custom.carrying_edges`, `platform.containment_edges` and `platform.associations_live`
--       are views over), or a closure row (`platform.reachability`).
--
-- So two live rows of the same Table that agree on `created_by = me?` and on `visibility`, and
-- that are named by NOTHING in kind (2), get the same answer from the ladder — necessarily,
-- because the ladder reads nothing else about them. `custom.visible_set` therefore asks the
-- ladder ONCE for each such class (at most four, the labels of `platform.visibility`) and once
-- for each id that IS named somewhere — and `created_by = me` needs no call at all, because the
-- kernel's `if v_owner = v_uid then return true` is unconditional at every level (VIS-25).
--
-- THE SUPERSET IS THE SAFE SIDE. `o_hooked_all` is deliberately a SUPERSET: every id this
-- organization has recorded ANY association about is asked individually, rather than the exact
-- set of carrying edges. An id that lands in it wrongly costs one ladder call; an id missing
-- from it would be answered by its class, which is why the set is drawn wide and why
-- `custom.read_door_parity` compares the two answers row by row over a whole Table.
--
-- THE THREE THINGS THAT MAKE IT STOP AND SAY SO, rather than answer from a shape it cannot
-- justify (nothing fails silently): a registered FK containment parent on `record`
-- (`platform.entity_relationships`), more named ids than the ceiling, and a null caller. Each
-- sets `o_fallback` and each door then walks the per-row ladder exactly as it does today, with
-- a NOTICE naming the cause and the remedy.
--
-- WHAT DOES NOT CHANGE: the answers. `custom.has_visibility` is untouched; so is
-- `iam.has_access_for_base`, so is every knob, so is the field masking. The doors return the
-- same ids to the same people, and `custom.read_door_parity` is the assertion that says so.

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE CEILING. How many individual ladder calls one read may make before the set-based
--    shape stops being cheaper than the walk it replaces, and the door says so and walks.
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.read_door_ladder_ceiling()
returns integer
language sql
immutable
set search_path to ''
as $function$
  select 5000;
$function$;

comment on function custom.read_door_ladder_ceiling() is
  'READ-PERF: how many times ONE read door call may ask custom.has_visibility / iam.has_access_for before it gives up on the set-based shape and walks the per-row ladder instead, saying so out loud.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE ORGANIZATION'S CARRYING EDGES. `custom.carrying_edges` is the union of
--    `platform.containment_edges` and the `custom.carrying_rule` arm, and BOTH are views over
--    `platform.associations` — which carries `organization_id` while the views do not. Scanning
--    the whole view costs 53 ms on the main database today and grows with every association on
--    the platform (83,227 live), so a read door cannot afford it. This is the same two arms with
--    the organization's own predicate in front of them, and the green suite asserts row-for-row
--    that it equals `custom.carrying_edges` restricted to that organization — which is the only
--    thing that keeps a mirror honest.
--
--    A platform-level association (`organization_id is null`, 5 live) belongs to every
--    organization and is kept, exactly as the unscoped view keeps it.
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.carrying_edges_in(p_organization_id uuid)
returns table(container_type text, container_id uuid, item_type text, item_id uuid,
              conveys_max public.permission_level)
language sql
stable
security definer
set search_path to ''
as $function$
  -- arm 1 — platform.containment_edges
  select case when r.container_side = 'source' then a.source_type else a.target_type end,
         case when r.container_side = 'source' then a.source_id   else a.target_id   end,
         case when r.container_side = 'source' then a.target_type else a.source_type end,
         case when r.container_side = 'source' then a.target_id   else a.source_id   end,
         r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type
     and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null
     and r.is_active
     and r.container_side = any (array['source', 'target'])
     and (a.organization_id = p_organization_id or a.organization_id is null)
  union
  -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
  select case when cr.container_side = 'source' then a.source_type else a.target_type end,
         case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
         case when cr.container_side = 'source' then a.target_type else a.source_type end,
         case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
         cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr
      on cr.role = a.role
     and cr.is_active
   where a.deleted_at is null
     and (a.organization_id = p_organization_id or a.organization_id is null);
$function$;

comment on function custom.carrying_edges_in(uuid) is
  'READ-PERF: custom.carrying_edges restricted to one organization''s associations, so a read door pays for its own organization''s edges instead of the platform''s. Asserted equal to the view in the READ-PERF green suite.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE GRANTED IDS — the ids whose answer their CLASS cannot give.
--
--    A grant is the one hook that can move the answer in BOTH directions: it admits a person
--    on `public.has_permission_for`'s own arm, and `iam.grant_addressed_level` makes
--    `iam.member_lane_confers` return NOTHING for that person on that thing, so what membership
--    would otherwise confer is withdrawn (VIS-19, LEVEL-FIX). A row anybody has been deliberate
--    about is therefore asked of the one ladder individually, and never answered by its class.
--    The set is drawn WIDE on purpose — a public grant cannot withdraw anything and is included
--    anyway — because an id that lands here costs one ladder call, where an id missing from here
--    would be answered by a class that does not speak for it.
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.read_door_granted_ids(p_organization_id uuid, p_table_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(distinct r.id), '{}'::uuid[])
    from (
      -- a grant on the record (public.has_permission_for, iam.granted_level, iam.grant_addressed_level)
      select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
      union all
      -- a membership held ON the record itself
      select m.container_id from iam.memberships m where m.container_type = 'record'
      -- the open library (public.user_can_read_via_library_grant, public.library_is_open)
      union all
      select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
      -- the platform closure the access kernel pushes onto its own frontier
      union all
      select rr.item_id from platform.reachability rr where rr.item_type = 'record'
    ) h
    join custom.record r
      on r.organization_id = p_organization_id
     and r.id = h.id
     and r.deleted_at is null
     and (p_table_id is null or r.table_id is not distinct from p_table_id);
$function$;

comment on function custom.read_door_granted_ids(uuid, uuid) is
  'READ-PERF: every id of this Table that a grant, a membership on the record, a library grant or the platform closure speaks about — a deliberate SUPERSET, asked of the one ladder one at a time because a grant both admits and withdraws (VIS-19).';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 4. CONTAINMENT, RESOLVED DOWNWARD.
--
--    `custom.has_visibility`'s third arm walks UP from a record to its ancestors and asks
--    `iam.has_access_for` about each one — which is one walk and several ladder calls PER ROW,
--    and on a Table whose records all sit under one Home that is every row of the page. The
--    question it answers is a set question: which of this organization's CONTAINERS does this
--    person reach, and what do those containers carry?
--
--    So this asks it once. One walk up the organization's edge set from this Table's records
--    names the DISTINCT ancestors (a graph walk over edges, not over rows); the ladder is asked
--    once per ancestor; and one walk back DOWN from the ancestors this person reaches names the
--    records they carry, at the minimum level along the path (VIS-3). Both walks carry the
--    visited-path guard and the depth-16 ceiling `custom.visibility_ancestors` carries, so a
--    loop terminates here exactly as it terminates there (VIS-4).
--
--    CONTAINMENT ONLY EVER ADDS (VIS-6: union only, no deny), which is why a row this returns
--    needs no further question and a row it does not return is still answered by every other arm.
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.read_door_carried_ids(
  p_user            uuid,
  p_organization_id uuid,
  p_table_id        uuid,
  p_required        public.permission_level,
  out o_ids         uuid[],
  out o_containers  integer)
returns record
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  o_ids := '{}'::uuid[];
  o_containers := 0;

  with recursive edges as materialized (
    select * from custom.carrying_edges_in(p_organization_id)
  ),
  -- UP: the distinct ancestors of this Table's records. One walk over the EDGE set, not one
  -- walk per row — the same shape, the same visited-path guard and the same depth ceiling as
  -- `custom.visibility_ancestors`, which is what the per-row arm calls.
  up as (
    select e.container_type, e.container_id, 1 as depth, e.conveys_max as max_level,
           array['record:' || e.item_id::text,
                 e.container_type || ':' || e.container_id::text] as path
      from edges e
      join custom.record r
        on r.organization_id = p_organization_id
       and r.id = e.item_id
       and r.deleted_at is null
       and (p_table_id is null or r.table_id is not distinct from p_table_id)
     where e.item_type = 'record'
    union all
    select e.container_type, e.container_id, u.depth + 1,
           least(u.max_level, e.conveys_max),
           u.path || (e.container_type || ':' || e.container_id::text)
      from up u
      join edges e
        on e.item_type = u.container_type
       and e.item_id   = u.container_id
     where u.depth < 16
       and not (e.container_type || ':' || e.container_id::text) = any (u.path)
  ),
  anc as (
    select u.container_type, u.container_id
      from up u
     group by u.container_type, u.container_id
    having max(u.max_level) >= p_required
  ),
  -- THE ONE LADDER, once per ancestor rather than once per row — and it IS the one ladder,
  -- `custom.has_visibility`, not the kernel underneath it. `custom.has_visibility`'s own third
  -- arm asks `iam.has_access_for` about an ancestor, which is one rung lower and misses exactly
  -- one thing: a PUBLIC grant (`iam.permissions.is_public`) standing on a container, which
  -- `iam.granted_level` unions and `public.has_permission_for` does not. Asking the whole ladder
  -- is the side of that difference Rule 9 is on — publishing a thing never lowers what anybody
  -- reaches — and it is the side VIS-17 is on, which says there is ONE ladder and no door keeps
  -- a second. `custom.read_door_parity` compares the two answers row by row, so if that
  -- difference ever shows up on real data it shows up as a named row and not as a surprise.
  ok as (
    select a.container_type, a.container_id
      from anc a
     where (select count(*) from anc) <= custom.read_door_ladder_ceiling()
       and custom.has_visibility(p_user, a.container_type, a.container_id, p_required)
  ),
  -- DOWN: what those containers carry, at the MINIMUM level along the path (VIS-3).
  down as (
    select e.item_type, e.item_id, e.conveys_max as min_level, 1 as depth,
           array[e.container_type || ':' || e.container_id::text,
                 e.item_type || ':' || e.item_id::text] as path
      from edges e
      join ok o
        on o.container_type = e.container_type
       and o.container_id   = e.container_id
    union all
    select e.item_type, e.item_id, least(d.min_level, e.conveys_max), d.depth + 1,
           d.path || (e.item_type || ':' || e.item_id::text)
      from down d
      join edges e
        on e.container_type = d.item_type
       and e.container_id   = d.item_id
     where d.depth < 16
       and not (e.item_type || ':' || e.item_id::text) = any (d.path)
  )
  select (select count(*) from anc)::integer,
         coalesce((select array_agg(distinct d.item_id)
                     from down d
                     join custom.record r
                       on r.organization_id = p_organization_id
                      and r.id = d.item_id
                      and r.deleted_at is null
                      and (p_table_id is null or r.table_id is not distinct from p_table_id)
                    where d.item_type = 'record'
                      and d.min_level >= p_required), '{}'::uuid[])
    into o_containers, o_ids;

  -- MORE ANCESTORS THAN ONE READ MAY ASK ABOUT. `ok` admitted nothing, so `o_ids` is empty and
  -- would read like "containment carries this person nothing" — which is a different sentence.
  -- NULL is the one that means "I did not answer", and the caller walks the per-row ladder.
  if o_containers > custom.read_door_ladder_ceiling() then
    o_ids := null;
  end if;
  return;
end;
$function$;

comment on function custom.read_door_carried_ids(uuid, uuid, uuid, public.permission_level) is
  'READ-PERF / VIS-3 / VIS-N-1: the records of one Table that containment carries to one person, resolved DOWNWARD from the containers they reach — one ladder call per ancestor instead of one walk per row. o_ids NULL means there were more ancestors than custom.read_door_ladder_ceiling() and the caller must walk the per-row ladder.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE SET. One visibility question per call.
--
--    o_all_visible        the whole Table — the page carries no visibility predicate at all
--    o_true_visibility    the `platform.visibility` classes the one ladder said yes to
--    o_granted_all        the ids the class may not speak for (asked one at a time)
--    o_granted_visible    the ones of those the one ladder said yes to
--    o_carried_visible    the ones containment carries, resolved downward
--    o_fallback / o_note  it did not answer, why, and what to do about it
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.visible_set(
  p_user            uuid,
  p_organization_id uuid,
  p_table_id        uuid,
  p_required        public.permission_level default 'viewer'::public.permission_level,
  out o_all_visible      boolean,
  out o_true_visibility  platform.visibility[],
  out o_granted_all      uuid[],
  out o_granted_visible  uuid[],
  out o_carried_visible  uuid[],
  out o_ladder_calls     integer,
  out o_fallback         boolean,
  out o_note             text)
returns record
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_label   text;
  v_vis     platform.visibility;
  v_rep     uuid;
  v_id      uuid;
  v_n       integer;
  v_carried record;
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
    select r.id into v_rep
      from custom.record r
     where r.organization_id = p_organization_id
       and (p_table_id is null or r.table_id is not distinct from p_table_id)
       and r.deleted_at is null
       and r.visibility = v_vis
       and r.created_by is distinct from p_user
       and not (r.id = any (o_granted_all))
       and not (r.id = any (o_carried_visible))
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
                        and (p_table_id is null or r.table_id is not distinct from p_table_id)
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
end;
$function$;

comment on function custom.visible_set(uuid, uuid, uuid, public.permission_level) is
  'READ-PERF / VIS-N-1: the caller''s visible set for one Table, answered ONCE per call — the visibility classes the one ladder said yes to, the granted ids and which of those it said yes to, and what containment carries. o_all_visible means the whole Table. o_fallback means it did not answer and o_note says why and what to do about it.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE READ DOOR. Same answers, one visibility question, and the LIMIT applied to a scan the
--    index can drive instead of to a scan that walks the ladder for every row it passes.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.read_records(
  p_organization_id uuid,
  p_table_id        uuid,
  p_by_id           boolean default false,
  p_limit           integer default 200,
  p_offset          integer default 0)
returns table(id uuid, document jsonb, level public.permission_level)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_set      record;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE HELPER EVERY OTHER LIST DOOR JOINS AGAINST — `custom.agg_sql`, `custom.io_export`,
--    `custom.query_by_coordinates`, `custom.query_across_homes`, `custom.query_rollup` and
--    `custom.query_table_as_of` all read this one, so all six get the same answer the same way.
--    A null Table means the whole organization, and the per-Table half of the question (the
--    per-Table `member_default_level` override, VIS-19 / AGT-5) really is per Table — so the set
--    is resolved per Table and unioned, which is O(Tables) where this was O(rows).
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.query_visible_ids(
  p_organization_id uuid,
  p_table_id        uuid default null::uuid,
  p_required        text default 'viewer'::text)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user uuid := custom.query_principal();
  v_set  record;
  v_tbl  uuid;
begin
  -- The organization wall, before any row is fetched, because this is now a door a
  -- signed-in person may execute directly.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');

  -- A connection with no principal at all is the campaign's own maintenance and is judged by
  -- the ROLE instead, exactly as `custom.query_access_ids` judged it. Unchanged.
  if v_user is null then
    if custom.query_is_store_owner() then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and (p_table_id is null or r.table_id = p_table_id)
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true';
    end if;
    return;
  end if;

  for v_tbl in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and (p_table_id is null or r.table_id = p_table_id)
  loop
    v_set := custom.visible_set(v_user, p_organization_id, v_tbl,
                                p_required::public.permission_level);

    if v_set.o_fallback then
      raise notice '%', v_set.o_note;
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           -- THE ONE LADDER, per row, exactly as before this file.
           and custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level);

    elsif v_set.o_all_visible then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true';

    elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and ( r.created_by = v_user
              or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );

    else
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and ( r.created_by = v_user
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );
    end if;
  end loop;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 8. THE ASSERTION. The set-based answer against the one ladder, id by id, over a whole Table
--    from one seat. It calls the ladder for EVERY row — it is the slow thing this file exists to
--    remove, kept as the thing that proves the fast thing right. A difference is a ROW, with a
--    sentence saying which way it went wrong, never a count.
-- ────────────────────────────────────────────────────────────────────────────────────────
create function custom.read_door_parity(
  p_organization_id uuid,
  p_table_id        uuid,
  p_user            uuid,
  p_required        public.permission_level,
  p_sample          integer)
returns table(record_id uuid, set_based boolean, per_row boolean, verdict text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_set record;
begin
  v_set := custom.visible_set(p_user, p_organization_id, p_table_id, p_required);
  return query
  with answered as (
    select r.id,
           ( v_set.o_fallback
             or v_set.o_all_visible
             or r.created_by = p_user
             or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
             or r.id = any (v_set.o_granted_visible)
             or r.id = any (v_set.o_carried_visible) ) as sb,
           custom.has_visibility(p_user, 'record', r.id, p_required) as pr
      from (select rec.id, rec.created_by, rec.visibility
              from custom.record rec
             where rec.organization_id = p_organization_id
               and rec.table_id is not distinct from p_table_id
               and rec.deleted_at is null
             -- p_sample = 0 means EVERY row. Above that it is a random sample, which is what a
             -- Table with a hundred thousand rows needs: the ladder costs about a millisecond a
             -- row, so asking it about all of them is minutes. `random()` and not `id` order,
             -- because an ordered sample only ever proves the first page.
             order by case when coalesce(p_sample, 0) > 0 then random() else 0 end
             limit case when coalesce(p_sample, 0) > 0 then p_sample else null end) r
  )
  select a.id, a.sb, a.pr,
         case
           when a.sb = a.pr then 'same'
           when a.pr then 'HIDDEN BY THE SET — the one ladder says this person holds this record and the set-based shape left it out. Whatever admits them (a grant, a container, a class) is not in custom.visible_set''s arms.'
           else 'SHOWN BY THE SET — the one ladder says this person does NOT hold this record and the set-based shape let it through. A visibility class was answered by an unrepresentative row, or containment was resolved to a level the path does not carry.'
         end
    from answered a;
end;
$function$;

comment on function custom.read_door_parity(uuid, uuid, uuid, public.permission_level, integer) is
  'READ-PERF: the assertion under custom.visible_set — the set-based answer against the one ladder, row by row, over a whole Table from one seat. p_sample = 0 asks about every row; above that it is a random sample, for a Table too large to ask the ladder about a hundred thousand times. Rows where verdict <> ''same'' are the defect, named individually.';

-- Declared server-only, in data, in this same transaction. None of these is a client door:
-- every one takes the principal as an ARGUMENT, and a door that takes its principal from the
-- caller may never be reachable by that caller (DOOR-1: the read door resolves the reader from
-- the session). `custom.read_records` and `custom.query_visible_ids` — the doors a signed-in
-- person really does call — are unchanged in who may call them and keep their own declarations.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, non_client_lane, reason)
select 'custom', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'migrations/campaign/readperf_the_read_door_asks_visibility_once.sql (lane READ-PERF)',
       'server_only: called only from inside the read doors of schema custom (custom.read_records, custom.query_visible_ids and the six list doors that join against it) and from the READ-PERF test suites. Each takes the principal as an argument, so a client reaching one directly could ask about somebody else; the doors a person calls take no principal and resolve the reader from the session.',
       'The set-based half of the one visibility ladder. p_user / p_organization_id: p_user is the principal the answer is FOR and is never taken from a client; p_organization_id and p_table_id are checked by the calling door through custom.assert_client_may_reach and custom.assert_may_know_table before this is asked. NULL p_user or NULL p_organization_id returns the fallback verdict and admits nothing; NULL p_table_id means every Table of that organization. No argument may name another organization''s row: every id is joined back to custom.record on (organization_id, id), which is the organization wall itself (REC-29).'
  from pg_catalog.pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname in ('carrying_edges_in', 'read_door_granted_ids', 'read_door_carried_ids',
                     'visible_set', 'read_door_parity')
on conflict (schema_name, function_name, identity_argtypes) do nothing;
