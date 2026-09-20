-- SHARED-ONLY, the inverse: the ladder's first three arms stop having a name of their own,
-- so `may I know this Table` and `does this Table carry its rows` are one question again and
-- a single shared record makes its reader the reader of every row in the table.

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'reaches_directly';

CREATE OR REPLACE FUNCTION custom.has_visibility(p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec     record;
  v_org   uuid;
  v_table uuid;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership,
  -- grant rows, the organization lanes (which honour the row's own `visibility`, DD-136),
  -- the containment walk, the public and global-readable system-organization arms. This is
  -- the arm the WRITE doors used to ask on their own; asking it here is what makes reading
  -- and writing the same question.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19). The boolean
  -- kernel above carries the platform's generic member lane; it does not carry
  -- `custom/member_default_level`, the knob an organization sets for its own records, nor
  -- the per-Table override written on the Table record itself. `iam.effective_level` is the
  -- one place that resolves both, so it is asked rather than re-derived. The organization
  -- and Table are read off the row so that every caller gets the same answer for the same
  -- record, whichever door it came through.
  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    return true;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING. A record is carried by its Table and by whatever
  -- carries that; an ancestor conveys at most `conveys_max`, and the first ancestor that
  -- conveys enough AND that this principal reaches at that level answers true.
  --
  -- SHARED-ONLY (2026-09-19): "carried by its Table" is what that first sentence always
  -- said and what `custom.carrying_edges_of` never did. It does now — arm 3 of that
  -- function — so a Table shared with somebody carries its rows down here, and a Table
  -- homed in a Record carries the Record's share down through the Table in the same walk.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    if iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  -- ARM 4 — A TABLE YOU CAN SEE SOMETHING INSIDE IS A TABLE YOU MAY KNOW (SHARED-ONLY).
  --
  -- Arms 1 to 3 all ask "who reaches THIS row". A Table is a record (REC-25) and so it was
  -- asked the same way — and under `shared_only` the answer for somebody who had been shared
  -- one RECORD inside it was no. `custom.assert_may_know_table` is the first line of
  -- `custom.read_records`, `custom.applicable_fields` and every screen door in the store, so
  -- that no closed the whole feature for her: the record she had been given was unreachable
  -- through the only doors that show it, and the table it lived in never appeared in her
  -- list. So did the table holding a record SHE HERSELF had created.
  --
  -- AT `viewer` AND NEVER ABOVE IT. Knowing a table — its name, its columns, that it exists —
  -- is not changing one. Adding a column, renaming it, deleting it all ask `admin` on the
  -- Table and this arm refuses them, so a person shared one row of a table cannot reshape it.
  --
  -- IT IS THE LAST ARM ON PURPOSE: it is the only one that reads other rows, so every cheaper
  -- reason has already been tried and answered no.
  if p_type = 'record'
     and p_required <= 'viewer'::public.permission_level
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, v_org, p_id) then
    return true;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
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
  -- whole page — and it answers the ordinary case too, where the caller is simply a member of
  -- an organization at `all_records`. The rows it does NOT speak for are the ones whose own
  -- `visibility` is below `internal`, which that edge deliberately does not carry; they fall
  -- through to their class below exactly as before.
  if p_table_id is distinct from custom.table_kernel_id() then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := custom.has_visibility(p_user, 'record', p_table_id, p_required);
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

CREATE OR REPLACE FUNCTION custom.read_door_carried_ids(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level, OUT o_ids uuid[], OUT o_containers integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

drop function if exists custom.reaches_directly(uuid, text, uuid, public.permission_level);
