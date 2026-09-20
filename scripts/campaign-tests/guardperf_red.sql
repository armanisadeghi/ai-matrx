-- GUARD-PERF — THE FAST CENSUS STILL CATCHES THE LEAK.
--
-- The whole risk of making census 13 set-based is that it stops seeing what the door-calling
-- census saw. So this does not argue: it PLANTS LEAK-T10's original bytes — the real
-- `custom.visibility_ancestors` and `custom.visible_set` from
-- `migrations/inverse/leakt10_a_home_of_a_table_is_not_the_whole_table_down.sql`, in which a
-- Home of a multi-Home Table was read as the whole Table — builds the two-Home fixture through
-- the product's own doors, and runs the FAST census over that organization.
--
--   RED   : with the original bytes back, the fast census names doors-disagree rows.
--   GREEN : with them rolled back, the same fixture and the same census name none.
--
-- Everything happens inside ONE transaction that always ROLLS BACK: the planted bodies, the
-- fixture organization, every row. Nothing is committed.
--
--   psql -f scripts/campaign-tests/guardperf_red.sql

\set ON_ERROR_STOP on
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';

-- ══ THE PLANT: the REAL BYTES of the inverse, executed here. That they run at all is also
--    what proves the inverse is valid SQL.
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
$function$
;

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
  -- whole page — and it answers the ordinary case too, where the caller is simply a member of
  -- an organization at `all_records`. The rows it does NOT speak for are the ones whose own
  -- `visibility` is below `internal`, which that edge deliberately does not carry; they fall
  -- through to their class below exactly as before.
  --
  -- 🚨 AND THE TABLE HAS TO BE THIS ORGANIZATION'S OWN LIVE ROW — the same condition arm 3 of
  -- `custom.carrying_edges_of` joins on, and the reason it joins on it. The kernel Tables
  -- (`Table`, `Field`, and the home-record kernel every fixture hangs off) live in the SYSTEM
  -- organization, which is global_readable, so `iam.has_access_for` says yes about them to
  -- EVERY signed-in person. Without this line `p_table_id = 11111111-…-0002` — the Field
  -- kernel — made every Field row of a `shared_only` organization visible to every member.
  -- `custom.shared_only_disagreements()` found it on the main database the minute it existed:
  -- 199 (member, record) pairs where the read door said yes and the one ladder said no.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    -- SHARED-ONLY: `custom.reaches_directly`, NOT the whole ladder. The ladder's arm 4 says
    -- a Table you can see one record inside is a Table you may KNOW; reading that as "and
    -- so it carries every row" turned a single shared record into the whole table on the
    -- main database the day this was written.
    v_table_carries := custom.reaches_directly(p_user, 'record', p_table_id, p_required);
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
$function$
;


-- ══ THE FIXTURE: one Table, two Homes, one record in each, she is shared ONE Home.

  select set_config('app.actor_system', 'check_store_doors_decide', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values ('2ef10000-0000-4a00-8a00-0000000000e1', 'STORE DOORS two-home probe', 'store-doors-two-home-probe', 'SDH',
          '87a6e699-3622-4869-8843-d0867456c0dd');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values ('2ef10000-0000-4a00-8a00-0000000000e1', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
         ('2ef10000-0000-4a00-8a00-0000000000e1', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '2ef10000-0000-4a00-8a00-0000000000e1',
          'true'::jsonb, 'check:store-doors-decide two-home probe'),
         ('custom', 'member_default_visibility', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '2ef10000-0000-4a00-8a00-0000000000e1',
          '"shared_only"'::jsonb, 'check:store-doors-decide two-home probe');
  do $probe$
  declare
    v_org   constant uuid := '2ef10000-0000-4a00-8a00-0000000000e1';
    v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
    v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
    v_boss  text := current_user;
    v_home uuid; v_tproj uuid; v_hx uuid; v_hy uuid; v_trisk uuid; v_rx uuid; v_ry uuid;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_home  := custom.record_write(v_org, custom.organization_kernel_id(),
                                   jsonb_build_object('name', 'two-home probe'));
    v_tproj := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_projects','slug','sdh_projects','label_singular','Project','label_plural','Projects',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_tproj, jsonb_build_object('label','Title','type','text'));
    v_hx := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project X'));
    v_hy := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project Y'));
    v_trisk := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_risks','slug','sdh_risks','label_singular','Risk','label_plural','Risks',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_trisk, jsonb_build_object('label','Title','type','text'));
    -- THE SHAPE: one Table, two Homes.
    perform custom.home_add(v_org, v_trisk, v_hx);
    perform custom.home_add(v_org, v_trisk, v_hy);
    v_rx := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in X'));
    v_ry := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in Y'));
    perform custom.record_reparent(v_org, v_rx, v_hx);
    perform custom.record_reparent(v_org, v_ry, v_hy);
    -- SHE IS GIVEN PROJECT X AND NOTHING ELSE.
    perform custom.share_grant(v_org, v_hx, 'user', v_dana, 'viewer'::public.permission_level);
    perform set_config('role', v_boss, true);
  end $probe$;


-- ══ RED — the fast census, over that organization alone.
do $red$
declare n int; sample text;
begin
  select count(*), coalesce(min(why), '') into n, sample
    from custom.list_door_disagreements(null, '2ef10000-0000-4a00-8a00-0000000000e1')
   where why like 'doors-disagree%';
  if n = 0 then
    raise exception 'RED IS GREEN - with LEAK-T10''s original bytes back, the FAST census named no disagreement in a fixture built exactly as acceptance test 10 describes it. Then the set-based comparison is not measuring what the door-calling census measured, and its zero on the live database proves nothing.';
  end if;
  raise notice 'RED IS RED - the fast census names % doors-disagree row(s) with LEAK-T10''s original bytes planted. First: %', n, sample;
end $red$;

rollback;

-- ══ GREEN — the landed bytes, the same fixture, the same census.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';

  select set_config('app.actor_system', 'check_store_doors_decide', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values ('2ef10000-0000-4a00-8a00-0000000000e1', 'STORE DOORS two-home probe', 'store-doors-two-home-probe', 'SDH',
          '87a6e699-3622-4869-8843-d0867456c0dd');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values ('2ef10000-0000-4a00-8a00-0000000000e1', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
         ('2ef10000-0000-4a00-8a00-0000000000e1', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '2ef10000-0000-4a00-8a00-0000000000e1',
          'true'::jsonb, 'check:store-doors-decide two-home probe'),
         ('custom', 'member_default_visibility', 'organization', '2ef10000-0000-4a00-8a00-0000000000e1', '2ef10000-0000-4a00-8a00-0000000000e1',
          '"shared_only"'::jsonb, 'check:store-doors-decide two-home probe');
  do $probe$
  declare
    v_org   constant uuid := '2ef10000-0000-4a00-8a00-0000000000e1';
    v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
    v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
    v_boss  text := current_user;
    v_home uuid; v_tproj uuid; v_hx uuid; v_hy uuid; v_trisk uuid; v_rx uuid; v_ry uuid;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_home  := custom.record_write(v_org, custom.organization_kernel_id(),
                                   jsonb_build_object('name', 'two-home probe'));
    v_tproj := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_projects','slug','sdh_projects','label_singular','Project','label_plural','Projects',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_tproj, jsonb_build_object('label','Title','type','text'));
    v_hx := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project X'));
    v_hy := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project Y'));
    v_trisk := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_risks','slug','sdh_risks','label_singular','Risk','label_plural','Risks',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_trisk, jsonb_build_object('label','Title','type','text'));
    -- THE SHAPE: one Table, two Homes.
    perform custom.home_add(v_org, v_trisk, v_hx);
    perform custom.home_add(v_org, v_trisk, v_hy);
    v_rx := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in X'));
    v_ry := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in Y'));
    perform custom.record_reparent(v_org, v_rx, v_hx);
    perform custom.record_reparent(v_org, v_ry, v_hy);
    -- SHE IS GIVEN PROJECT X AND NOTHING ELSE.
    perform custom.share_grant(v_org, v_hx, 'user', v_dana, 'viewer'::public.permission_level);
    perform set_config('role', v_boss, true);
  end $probe$;


do $green$
declare n int; noise text;
begin
  select count(*), coalesce(min(why), '') into n, noise
    from custom.list_door_disagreements(null, '2ef10000-0000-4a00-8a00-0000000000e1');
  if n > 0 then
    raise exception 'GREEN IS RED - the fast census names % row(s) on the landed bytes: %', n, noise;
  end if;
  raise notice 'GREEN IS GREEN - the fast census names no disagreement and nothing unmeasured on the same fixture.';
end $green$;

-- ══ AND THE DOOR-CALLING CENSUS AGREES WITH IT, on the same fixture, in the same breath.
do $both$
declare n int;
begin
  select count(*) into n
    from custom.list_door_disagreements(null, '2ef10000-0000-4a00-8a00-0000000000e1', 200, true);
  if n > 0 then
    raise exception 'THE EXHAUSTIVE CENSUS DISAGREES WITH THE FAST ONE - it names % row(s) where the fast census named none.', n;
  end if;
  raise notice 'THE TWO CENSUSES AGREE - --exhaustive calls all seven doors on this fixture and names none either.';
end $both$;

rollback;
\echo 'GUARD-PERF: RED then GREEN, and the exhaustive census agrees. ROLLBACK VERIFIED.'
