-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 3bc9794947730955beb0611651c5859fbd3759ddda32f3efb7e503eb7e8e041e
--
-- READ-PERF — THE CLASS FINDS ITS ROW WITHOUT READING THE TABLE.
--
-- `custom.visible_set` asks the one ladder about ONE row per visibility class, and it finds that
-- row with `… and visibility = $v and created_by is distinct from $me limit 1`. `is distinct
-- from` is not a range, so when every row of a class WAS made by the caller — which is the
-- ordinary case for a Table one person imported — that `limit 1` reads the whole class before it
-- can say "there is no such row". Measured on the main database on the 100,000-row Table:
--
--     class probe, a label the Table does not hold      0.3 – 0.7 ms   (an index probe)
--     class probe, the label it holds, every row mine  21.8 ms         (100,000 rows read)
--
-- A NOT-EQUAL is two ranges. So the probe asks for them: the greatest creator below the caller,
-- the least creator above, and the rows with no creator at all — three bounded index scans that
-- stop at their first entry. Each takes `(the number of ids that may not represent their class)
-- + 1` rows, which is what makes it EXACT rather than merely fast: the only rows it may not
-- choose are the granted and carried ones, there are at most that many of them, so a window one
-- larger than that cannot miss a row it is allowed to choose. With nothing granted and nothing
-- carried the window is one row per direction.
--
-- And the index gains `created_by`, so all three are index-only.

create index concurrently if not exists record_org_table_vis_creator_rp_00 on custom.record_p00 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_01 on custom.record_p01 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_02 on custom.record_p02 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_03 on custom.record_p03 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_04 on custom.record_p04 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_05 on custom.record_p05 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_06 on custom.record_p06 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_07 on custom.record_p07 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_08 on custom.record_p08 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_09 on custom.record_p09 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_10 on custom.record_p10 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_11 on custom.record_p11 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_12 on custom.record_p12 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_13 on custom.record_p13 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_14 on custom.record_p14 (organization_id, table_id, visibility, created_by) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_creator_rp_15 on custom.record_p15 (organization_id, table_id, visibility, created_by) where deleted_at is null;

create or replace function custom.visible_set(
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
  v_window  integer;
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
            and (p_table_id is null or r.table_id is not distinct from p_table_id)
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by is null
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and (p_table_id is null or r.table_id is not distinct from p_table_id)
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by < p_user
          order by r.created_by desc
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and (p_table_id is null or r.table_id is not distinct from p_table_id)
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
                        and (p_table_id is null or r.table_id is not distinct from p_table_id)
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
end;
$function$;

