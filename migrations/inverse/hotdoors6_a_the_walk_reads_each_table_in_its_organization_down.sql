-- chair-step: undo hotdoors6_a - restores iam.has_access_for_many, custom.tables_seen_among and custom.tables_seen_once_per_group as before HOT-DOORS-6 and drops the functions it added except iam.has_access_for_many_in, which stays as a thin unhinted wrapper because iam._memo_ask (memosweep_k) asks it. Run AFTER hotdoors6_b inverse.
-- lane: HOT-DOORS-6
-- based-on: iam.has_access_for_many(uuid, uuid[], text, text) 158ea840126ca4ef9f351e88708dc46b924a62f0e1a19cbdfd51ab0485b1398a
-- based-on: custom.tables_seen_among(uuid, uuid[], uuid[]) db89ca3d2f5d6e7ca5284f94fe439f374b65f3c85eb432558a67045954c62837
-- based-on: custom.tables_seen_once_per_group(uuid, uuid[]) 90364ec4bedd3231aeb7733af8980381743c4a4e3b3b5513c9c245fe3be1636d
-- based-on: iam.has_access_for_many_in(uuid, uuid[], uuid[], text, text) e049a33bae07af8eadfb16277025425f5275259eb43eec3d10bc797110738416

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION iam.has_access_for_many(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW (2026-10-07). THE SET FORM OF THE ACCESS KERNEL: one row per distinct non-null
-- target, `allowed` = iam.has_access_for(p_person, p_type, target, p_level) — the same answer,
-- resolved once for the whole set instead of once per target. The rule it implements, lane by lane,
-- is common-docs/systems/platform/access/KERNEL.md. It is SHADOW ONLY until Arman decides the swap:
-- iam.has_access_for_shadow asks both forms and returns the old one.
--
-- WHAT IS SET-BASED. The person is resolved once (organizations, admin seats, store switch,
-- member-lane level per organization and Table). The target rows are read in ONE statement. Grants,
-- record memberships, scope assignments and Library grants are one semi-join each over the set.
-- Every clock clause (a grant's expiry) is the statement's own now().
--
-- WHAT IS NOT, AND GOES TO THE ONE-AT-A-TIME KERNEL (iam.has_access_for, unchanged), so the answer is
-- the kernel's by construction:
--   * every type but `record` (the hot path; other types are a later wave, KERNEL.md § Waves);
--   * the whole call, when the registry no longer says what this body assumes about `record`
--     (a reference gate, an owner-only trash rule, a detail or child pointer, a containment or
--     composition parent, or a class whose "Only me" rows do not open to the organization);
--   * one target, when its id is carried by more than one row, when it sits in a global-readable
--     system organization (those arms read the row column T-13 retires, which this body may not), or
--     when platform.reachability holds a container for it.
-- A Confidential row is answered by custom.confidential_answer itself, exactly as the kernel asks it.
--
-- THE PUBLIC LANE: the kernel asks the row column T-13 retires (= 'public'), which this body may not
-- read. A row published_to_web marks, that no other lane opens, is asked of the kernel (KERNEL-SHADOW h).
-- Known one-way gap, fail-closed: a row the kernel would open ONLY because its row column says public
-- while published_to_web says false (possible only with the T-13 dual-write trigger bypassed) is
-- refused here; the shadow and the sweep report it as a disagreement.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
  v_pcm     text;  -- HOT-DOORS-4
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  -- KERNEL-SHADOW h: a NULL level is NOT viewer - the kernel answers a NULL level its own way (owner and
  -- organization admins only), so a NULL level, like a NULL or non-record type, goes to the kernel.
  v_req := p_level::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := coalesce(p_type = 'record' and v_req is not null
    and exists (select 1 from platform.entity_types et
                 where et.token = 'record' and et.is_active
                   and et.schema_name = 'custom' and et.table_name = 'record'
                   and et.rls_variant is distinct from 'detail')
    and platform.reference_gate_columns('record') is null
    and not coalesce(platform.trash_is_owner_only('record'), false)
    and platform.detail_parent_columns('record') is null
    and platform.child_parent_columns('record') is null
    and not exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  -- HOT-DOORS-4 (2026-10-08): one cached plan per statement of this call (partitions pruned at run time) instead of
  -- a custom plan per call; put back when it returns. A plan choice, never an answer.
  if iam.kernel_batch_on(p_person) then
    v_pcm := pg_catalog.current_setting('plan_cache_mode');
    perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
  end if;
  return query
  with
  t as materialized (
    select distinct x as id from unnest(p_targets) x where x is not null
  ),
  -- The person, once.
  my_orgs as materialized (
    select distinct om.organization_id as org
      from iam.organization_member om
     where om.user_id = p_person
  ),
  global_orgs as materialized (
    select s.organization_id as org from iam.system_orgs s where s.global_readable
  ),
  -- The rows, once.
  w as materialized (
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      from t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           public.is_org_admin_for(p_person, o.org) as is_admin,
           iam.has_org_access_for(p_person, o.org)  as has_access,
           custom.store_is_open(o.org)              as store_open
      from (select distinct w.org from w where w.org is not null and w.n_rows = 1) o
  ),
  -- Per target: the semi-joins.
  x as materialized (
    select w.id, w.org, w.owner, w.pub, w.tbl, w.n_rows,
           o.archived, o.is_admin, o.has_access, o.store_open,
           (w.org in (select g.org from global_orgs g)) as in_global_org,
           exists (select 1 from platform.reachability rc
                    where rc.item_type = 'record' and rc.item_id = w.id) as has_container,
           -- the Confidential anchor is provably absent when no row of class `record` carries the
           -- id, or exactly one does whose Table is not Confidential and whose document names no
           -- parent (custom.confidential_anchor's own loop stops at that first row)
           (select count(c.id) = 0
                   or (count(c.id) = 1
                       and not coalesce(bool_or((ct.data ->> 'level') = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
              left join custom.record ct
                on ct.organization_id = c.organization_id and ct.id = c.table_id
               and ct.table_id = custom.table_kernel_id()
             where c.organization_id = w.org and c.id = w.id and c.data_class = 'record') as anchor_free,
           exists (select 1 from platform.entity_grants eg
                    where eg.entity_type = 'record' and eg.entity_id = w.id) as has_library_row,
           -- public.has_permission_for, as a semi-join
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and coalesce(p.status, 'active') <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and (p.granted_to_user_id = p_person
                           or (p.granted_to_organization_id is not null
                               and p.granted_to_organization_id in (select m.org from my_orgs m)))
                      and case v_req
                            when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
                            when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
                            when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')
                            when 'editor' then p.permission_level in ('editor', 'admin')
                            when 'admin' then p.permission_level = 'admin'
                          end) as grant_hit,
           -- iam.grant_addressed_level(...) is not null: a grant addressed to this person speaks
           -- for this row, so the member lane's default does not (VIS-19)
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and p.status <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and coalesce(p.is_public, false) = false
                      and (p.granted_to_user_id = p_person
                           or p.granted_to_organization_id in (select m.org from my_orgs m))
                      and p.permission_level is not null) as addressed,
           -- a record membership (iam.membership_grant)
           exists (select 1 from iam.memberships m
                     join iam.membership_grant g
                       on g.member_role = m.role and g.container_type in ('record', '*')
                    where m.container_type = 'record' and m.container_id = w.id
                      and m.user_id = p_person and m.deleted_at is null
                      and g.confers >= v_req) as membership_hit,
           -- public._edu_can_read_via_assignment (the record arm)
           exists (select 1 from platform.associations_live a
                     join iam.memberships m
                       on m.container_type = 'scope' and m.container_id = a.target_id
                      and m.user_id = p_person and m.status = 'active' and m.deleted_at is null
                    where a.source_type = 'record' and a.source_id = w.id
                      and a.target_type = 'scope' and a.role = 'assignment') as edu_hit
      from w
      left join orgs o on o.org = w.org
  ),
  -- Which targets this body answers, and which still need the member lane's level.
  y as materialized (
    select x.*,
           (x.n_rows > 1 or x.in_global_org or x.has_container) as to_kernel,
           case when x.n_rows = 1 and not x.archived and not x.anchor_free
                     and not x.in_global_org and not x.has_container
                then custom.confidential_answer(p_person, x.id, v_req) end as conf
      from x
  ),
  early as materialized (
    select y.*,
           coalesce(y.n_rows = 1 and not y.to_kernel and not y.archived and y.conf is null
            and (
              (v_req = 'viewer' and y.has_library_row
                 and (public.user_can_read_via_library_grant(p_person, 'record', y.id)
                      or public.library_is_open('record', y.id)))
              or y.owner = p_person
              or y.grant_hit
              or y.membership_hit
              or (v_req = 'viewer' and y.edu_hit)
              or (v_lanes.org_role_lane and y.is_admin)
              or (v_lanes.org_member_lane and y.has_access and not y.store_open
                  and v_req <= 'editor'::public.permission_level)
            ), false) as early_yes  -- a row with no creator makes `owner = p_person` null, never yes
      from y
  ),
  -- The member lane's level (iam.member_lane_confers), per organization and Table, asked only
  -- where nothing earlier answered and only where the kernel itself would reach that arm.
  confers as materialized (
    select q.org, q.tbl,
           iam.member_lane_confers(p_person, q.org, 'record', null, q.tbl, true) as lvl
      from (select distinct e.org, e.tbl from early e
             where e.n_rows = 1 and not e.to_kernel and not e.archived and e.conf is null
               and not e.early_yes
               and not (v_req = 'viewer' and e.pub)
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  -- KERNEL-SHADOW h: one row per target (an id two rows carry is asked of the kernel once).
  select distinct on (e.id) e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           -- KERNEL-SHADOW h: the public lane is never granted on published_to_web alone. A row it
           -- would open, and nothing else opens, is asked of the kernel, which reads the row column
           -- itself - so a row written with the T-13 dual-write trigger bypassed answers exactly as before.
           when v_req = 'viewer' and e.pub then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e
   order by e.id;
  if v_pcm is not null then
    perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.tables_seen_among(p_user_id uuid, p_organization_ids uuid[], p_among uuid[])
 RETURNS TABLE(organization_id uuid, id uuid, seen boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE TABLE WALK OF custom.tables_seen_once_per_group, AMONG NAMED TABLES.
--
-- The body of custom.tables_seen_once_per_group (STORE-READ-PERF-3: the one ladder's viewer answer
-- about each live Table, asked once per group of Tables it cannot tell apart — its header has the
-- argument), moved here unchanged except for one line: with p_among, only the live Tables of these
-- organizations whose ids are in p_among are walked (null: every live Table, which is how
-- tables_seen_once_per_group calls it). A Table's answer never depends on which other Tables are
-- walked beside it: its group key is its own columns and its own container's, every member of a
-- group answers alike, and arm 4 is asked per Table. It reads and writes NO memo — that stays
-- tables_seen_once_per_group's, which is the only caller that asks for every Table.
declare
  v_ceiling integer := custom.read_door_ladder_ceiling();
  v_solo    boolean;
  v_ids     uuid[];  v_orgs uuid[];  v_keys text[];
  v_prev_k  text;
  v_prev_v  boolean;
  v_left_id uuid[] := '{}';  v_left_org uuid[] := '{}';
  v_r_org   uuid[] := '{}';  v_r_id uuid[] := '{}';  v_r_seen boolean[] := '{}';
  v_i       integer;
  v_seen    boolean;
  v_cand    uuid;
  v_arm     record;
  v_one     jsonb;
  v_org     uuid;
  v_reps    jsonb;  -- PERF-FIX-2: the one viewer answer of each group's first Table, asked as one set
  -- PERF-FIX-4: the Tables the set kernel already opens (see below), and the rest
  v_all     uuid[];
  v_fast    uuid[] := '{}';  v_fast_org uuid[] := '{}';
  v_among   uuid[] := p_among;
begin
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    return;
  end if;

  v_solo := p_user_id is null
         or exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
         or platform.reference_gate_columns('record') is not null
         or platform.detail_parent_columns('record') is not null
         or platform.child_parent_columns('record') is not null
         or platform.row_class_column('record') is not null
         or platform.trash_is_owner_only('record')
         or exists (select 1 from platform.entity_types et
                     where et.token = 'record' and et.is_active and et.rls_variant = 'detail');

  -- PERF-FIX-4 (2026-10-07). KERNEL FIRST. Every live Table asked here is first put to the set form of the
  -- access kernel (iam.has_access_for_many, the very answer custom.reaches_directly_many hands to
  -- custom.reaches_directly) at viewer, ONCE. A Table it opens, that ONE row carries, whose parent_id cannot
  -- make custom.containment_parent raise, with no Confidential anchor, in an organization that is not
  -- archived, is one custom.reaches_directly answers true at its kernel step (viewer is the level floor) -
  -- so it is seen, whatever group it would have joined: its group's first Table would have been asked that
  -- same question and said yes for all of them. Those Tables are answered here and leave the walk; the walk
  -- below runs, unchanged, over the rest (a Table's answer never depends on which other Tables are walked
  -- beside it - see the header). Only while the transaction has written nothing (the set form's own rule),
  -- the knob access/kernel_set_form is on for this person, nothing makes every Table walk alone, and
  -- mx.data_home_set is not off; a failure of the set form is a WARNING and the whole walk runs as before.
  if not v_solo and pg_catalog.pg_current_xact_id_if_assigned() is null
     and coalesce(current_setting('mx.data_home_set', true), '') <> 'off'
     and 'viewer'::public.permission_level <= custom.level_floor()
     and iam.kernel_set_form_on(p_user_id) then
    v_all := array(select x.id from custom.record x
                    where x.organization_id = any (p_organization_ids)
                      and x.table_id = custom.table_kernel_id()
                      and x.deleted_at is null
                      and (p_among is null or x.id = any (p_among)));
    begin
      with k as materialized (
        select distinct m.target as id
          from iam.has_access_for_many(p_user_id, v_all, 'viewer', 'record') m
         where m.allowed is true
      )
      select coalesce(array_agg(k.id), '{}'::uuid[]), coalesce(array_agg(r.org), '{}'::uuid[])
        into v_fast, v_fast_org
        from k
        cross join lateral (
          select count(*) as n,
                 min(w.organization_id::text)::uuid as org,
                 coalesce(bool_and(w.data -> 'parent_id' is null or jsonb_typeof(w.data -> 'parent_id') = 'null'
                                   or (jsonb_typeof(w.data -> 'parent_id') = 'string'
                                       and (w.data ->> 'parent_id') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$')), false) as parent_ok,
                 count(*) filter (where w.data_class = 'record') as n_rec,
                 coalesce(bool_or(w.data_class = 'record' and (tk.data ->> 'level') = 'confidential'), false) as conf_tbl,
                 coalesce(bool_or(w.data_class = 'record' and jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
            from custom.record w
            left join custom.record tk
              on tk.organization_id = w.organization_id and tk.id = w.table_id and tk.table_id = custom.table_kernel_id()
           where w.id = k.id
        ) r
       where r.n = 1 and r.parent_ok
         and (r.n_rec = 0 or (r.n_rec = 1 and not r.conf_tbl and not r.has_parent))
         and r.org = any (p_organization_ids)
         and not exists (select 1 from iam.organizations o where o.id = r.org and o.archived_at is not null);
    exception when others then
      v_fast := '{}';  v_fast_org := '{}';  v_all := null;
      raise warning 'KERNEL-SET-FORM: iam.has_access_for_many failed in custom.tables_seen_among (% %); walking every Table',
        sqlstate, sqlerrm;
    end;
    -- the drift guard rides this call too (a slice: the guard compares one at a time)
    if v_all is not null and iam.kernel_shadow_on(p_user_id) then
      perform iam.has_access_for_shadow(p_user_id, v_all[1:300], 'viewer', 'record', 'custom.tables_seen_among');
    end if;
    if cardinality(v_fast) > 0 then
      v_among := array(select a.id from unnest(v_all) a(id) except select f.id from unnest(v_fast) f(id));
      if cardinality(v_among) = 0 then
        return query select u.org, u.id, true from unnest(v_fast_org, v_fast) as u(org, id);
        return;
      end if;
    end if;
  end if;

  with
  t as materialized (
    select x.id, x.organization_id as org, x.table_id,
           -- THE ROW'S OWN COLUMNS, every one but its id, its content and its clocks: a superset of
           -- the columns the ladder reads about a row, whatever they are called.
           (to_jsonb(x) - array['id','data','metadata','custom_fields','created_at','updated_at','updated_by','version','deleted_at']) as cols,
           -- custom.containment_parent raises on anything but one uuid; such a Table walks alone,
           -- so it raises exactly where it always did.
           (x.data -> 'parent_id' is null or jsonb_typeof(x.data -> 'parent_id') = 'null'
            or (jsonb_typeof(x.data -> 'parent_id') = 'string'
                and (x.data ->> 'parent_id') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$')) as parent_ok
      from custom.record x
     where x.organization_id = any (p_organization_ids)
       and x.table_id = custom.table_kernel_id()
       and x.deleted_at is null
       and (v_among is null or x.id = any (v_among))
  ),
  tid as materialized (select array_agg(t.id) as v from t),
  te as materialized (
    select a.target_id as item, a.source_type as c_type, a.source_id as c_id, ty.conveys_max
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select tid.v from tid)::uuid[])
    union
    select a.source_id, a.target_type, a.target_id, ty.conveys_max
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select tid.v from tid)::uuid[])
    union
    select a.target_id, a.source_type, a.source_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select tid.v from tid)::uuid[])
    union
    select a.source_id, a.target_type, a.target_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select tid.v from tid)::uuid[])
    union
    select x.id, 'record'::text, x.table_id, 'admin'::public.permission_level
      from t x
      join custom.record tt on tt.id = x.table_id and tt.organization_id = x.org and tt.deleted_at is null
     -- (carrying_edges_of also asks the row's level here; leaving that out can only ADD an edge,
     -- and an edge to the row's own Table makes it walk alone below.)
     where x.table_id <> x.id
    union
    select a.source_id, 'record'::text, a.target_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null and a.source_type = 'record' and a.target_type = 'record'
       and a.source_id = any ((select tid.v from tid)::uuid[])
  ),
  cid as materialized (
    select array_agg(distinct te.c_id) as v from te where te.c_type = 'record'
  ),
  cx as materialized (
    select x.id, x.organization_id, x.table_id, x.deleted_at, (to_jsonb(x) - array['id','data','metadata','custom_fields','created_at','updated_at','updated_by','version','deleted_at']) as cols
      from custom.record x
     where x.id = any ((select cid.v from cid)::uuid[])
  ),
  ce as materialized (
    select a.target_id as item
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select cid.v from cid)::uuid[])
    union
    select a.source_id
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select cid.v from cid)::uuid[])
    union
    select a.target_id
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select cid.v from cid)::uuid[])
    union
    select a.source_id
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select cid.v from cid)::uuid[])
    union
    select x.id
      from cx x
      join custom.record tt on tt.id = x.table_id and tt.organization_id = x.organization_id and tt.deleted_at is null
     where x.table_id is not null and x.table_id <> x.id
       and x.deleted_at is null
    union
    select a.source_id
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null and a.source_type = 'record' and a.target_type = 'record'
       and a.source_id = any ((select cid.v from cid)::uuid[])
  ),
  allid as materialized (
    select (select tid.v from tid) || coalesce((select cid.v from cid), '{}'::uuid[]) as v
  ),
  named as materialized (
    select p.resource_id as id from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = any ((select allid.v from allid)::uuid[])
    union
    select m.container_id from iam.memberships m
     where m.container_type in ('record', 'scope') and m.container_id = any ((select allid.v from allid)::uuid[])
    union
    select g.entity_id from platform.entity_grants g
     where g.entity_type = 'record' and g.entity_id = any ((select allid.v from allid)::uuid[])
    union
    select rr.item_id from platform.reachability rr
     where rr.item_type = 'record' and rr.item_id = any ((select allid.v from allid)::uuid[])
    union
    select rr.container_id from platform.reachability rr
     where rr.container_type = 'record' and rr.container_id = any ((select allid.v from allid)::uuid[])
    union
    select a.source_id from platform.associations a
     where a.source_type = 'record' and a.source_id = any ((select allid.v from allid)::uuid[])
       and (a.target_type <> 'record' or a.relation_field_id is not null)
    union
    select a.target_id from platform.associations a
     where a.target_type = 'record' and a.target_id = any ((select allid.v from allid)::uuid[])
       and (a.source_type <> 'record' or a.relation_field_id is not null)
    union
    -- arm 3b's owned relation rows (custom.reaches_directly), found through the store's GIN index:
    -- every row that arm could match holds kind = owned.
    select nullif(rel.data ->> 'to', '')::uuid from custom.record rel
     where rel.organization_id = any (p_organization_ids)
       and rel.data @> '{"kind": "owned"}'::jsonb
       and rel.data ->> 'to' = any ((select tid.v from tid)::text[])
  ),
  cxa as materialized (
    select y.id, count(*) as n,
           (array_agg(jsonb_build_array(true, y.cols, y.deleted_at is null)))[1] as k
      from cx y
     group by y.id
  ),
  cattr as materialized (
    select c.c_id,
           coalesce(x.k, jsonb_build_array(false, null, null)) as k,
           coalesce(x.n, 0) as rows_with_id,
           (c.c_id in (select named.id from named) or c.c_id in (select ce.item from ce)) as unsimple
      from (select unnest((select cid.v from cid)::uuid[]) as c_id) c
      left join cxa x on x.id = c.c_id
  ),
  tdup as materialized (
    select d.id from custom.record d
     where d.id = any ((select tid.v from tid)::uuid[])
     group by d.id having count(*) > 1
  ),
  tagg as materialized (
    select te.item,
           -- more than one container: custom.addressed_cap_specific takes the FIRST container at the
           -- nearest depth, and two at one depth come out in an order their ids decide.
           (bool_or(te.c_type <> 'record' or ca.c_id is null or ca.unsimple or ca.rows_with_id <> 1
                    or te.c_id = te.item or te.c_id = t.table_id)
            or count(distinct (te.c_type, te.c_id)) > 1) as bad,
           jsonb_agg(jsonb_build_array(ca.k, te.conveys_max) order by jsonb_build_array(ca.k, te.conveys_max)::text) as sig
      from te
      join t on t.id = te.item
      left join cattr ca on ca.c_id = te.c_id and te.c_type = 'record'
     group by te.item
  ),
  keyed as materialized (
    select t.id, t.org,
           -- null: an id two rows carry (asked through custom.levels_of, which reads it the way the
           -- ladder does); ['alone', id]: walked on its own; otherwise the signature.
           case
             when t.id in (select tdup.id from tdup) then null
             when v_solo or t.id in (select named.id from named) or coalesce(g.bad, false) or not t.parent_ok
               then jsonb_build_array('alone', t.id)::text
             else jsonb_build_array(t.cols, coalesce(g.sig, '[]'::jsonb))::text
           end as key
      from t
      left join tagg g on g.item = t.id
  )
  select array_agg(k.id order by k.key nulls first, k.id), array_agg(k.org order by k.key nulls first, k.id),
         array_agg(k.key order by k.key nulls first, k.id)
    into v_ids, v_orgs, v_keys
    from keyed k;
  -- Sorted by signature: a signature's answer is the one just asked. A Table walked alone has a
  -- signature of its own. An id two rows carry is asked through custom.levels_of, all together.
  v_one := custom.levels_of(p_user_id,
             array(select v_ids[i] from generate_subscripts(v_ids, 1) i where v_keys[i] is null));
  -- PERF-FIX-2: each group's first Table (the one the loop below used to ask about on its own) is asked
  -- in one set call - the same custom.reaches_directly answer, through custom.reaches_directly_many.
  select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_reps
    from custom.reaches_directly_many(p_user_id,
           array(select v_ids[i] from generate_subscripts(v_ids, 1) i
                  where v_keys[i] is not null and (i = 1 or v_keys[i] is distinct from v_keys[i - 1])),
           'record', 'viewer'::public.permission_level) m;
  for v_i in 1 .. coalesce(cardinality(v_ids), 0) loop
    if v_keys[v_i] is null then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i];
      v_r_seen := v_r_seen || coalesce((v_one -> v_ids[v_i]::text ->> 's')::boolean, false);
      continue;
    end if;
    if v_keys[v_i] is distinct from v_prev_k then
      v_prev_v := (v_reps ->> v_ids[v_i]::text)::boolean;
      v_prev_k := v_keys[v_i];
    end if;
    if v_prev_v then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i]; v_r_seen := v_r_seen || true;
    else
      v_left_id := v_left_id || v_ids[v_i]; v_left_org := v_left_org || v_orgs[v_i];
    end if;
  end loop;

  if cardinality(v_left_id) > 0 then
    for v_arm in
      with l as materialized (select * from unnest(v_left_id, v_left_org) as l(id, org)),
      own as materialized (
        select distinct r.organization_id as org, r.table_id as id
          from custom.record r
         where (r.organization_id, r.table_id) in (select l.org, l.id from l)
           and r.deleted_at is null
           and r.created_by = p_user_id
      ),
      granted as materialized (
        select r.organization_id as org, r.table_id as tbl, array_agg(distinct r.id) as ids
          from (
            select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
            union all select m.container_id from iam.memberships m where m.container_type = 'record'
            union all select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
            union all select rr.item_id from platform.reachability rr where rr.item_type = 'record'
          ) h
          join custom.record r on r.id = h.id and r.deleted_at is null
           and (r.organization_id, r.table_id) in (select l.org, l.id from l)
         group by 1, 2
      ),
      ed as materialized (
        select o.org, e.container_type, e.container_id, e.item_id
          from (select distinct l.org from l) o
          cross join lateral custom.carrying_edges_in(o.org) e
         where e.item_type = 'record'
      ),
      edr as materialized (
        -- PERF-FIX-3: the carried rows are found by their own id FIRST (a few hundred edges, each one
        -- primary-key probe). Joined the other way round the planner drove from every Table of the
        -- organization and read every one of its rows for every edge (32,399 index scans of 26 rows
        -- for one organization of 179 Tables; 540 ms to find no row).
        select r.organization_id as org, r.table_id as tbl, ed.item_id, ed.container_type, ed.container_id
          from ed
          join custom.record r on r.organization_id = ed.org and r.id = ed.item_id and r.deleted_at is null
      ),
      carried as materialized (
        select e.org, e.tbl, array_agg(distinct e.item_id) as ids
          from edr e
         where (e.org, e.tbl) in (select l.org, l.id from l)
           and not (e.container_type = 'record' and e.container_id = e.tbl)
         group by 1, 2
      )
      select l.id, l.org,
             exists (select 1 from own where own.org = l.org and own.id = l.id) as own,
             g.ids as g_ids, c.ids as c_ids
        from l
        left join granted g on g.org = l.org and g.tbl = l.id
        left join carried c on c.org = l.org and c.tbl = l.id
    loop
      v_seen := v_arm.own;
      if not v_seen and coalesce(cardinality(v_arm.c_ids), 0) > v_ceiling then
        -- more candidates than the function's own LIMIT: it chooses which; let it.
        v_seen := custom.table_has_a_visible_record(p_user_id, v_arm.org, v_arm.id);
      elsif not v_seen then
        if coalesce(cardinality(v_arm.g_ids), 0) <= v_ceiling then
          foreach v_cand in array coalesce(v_arm.g_ids, '{}'::uuid[]) loop
            if custom._seen_one(p_user_id, v_cand) then
              v_seen := true; exit;
            end if;
          end loop;
        end if;
        if not v_seen then
          foreach v_cand in array coalesce(v_arm.c_ids, '{}'::uuid[]) loop
            if custom._seen_one(p_user_id, v_cand) then
              v_seen := true; exit;
            end if;
          end loop;
        end if;
      end if;
      v_r_org := v_r_org || v_arm.org; v_r_id := v_r_id || v_arm.id; v_r_seen := v_r_seen || v_seen;
    end loop;
  end if;

  return query select u.org, u.id, u.seen from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen)
               union all
               select u.org, u.id, true from unnest(v_fast_org, v_fast) as u(org, id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.tables_seen_once_per_group(p_user_id uuid, p_organization_ids uuid[])
 RETURNS TABLE(organization_id uuid, id uuid, seen boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
-- STORE-READ-PERF-3 (2026-09-28). WHICH TABLES THIS PERSON SEES IN THESE ORGANIZATIONS: the one
-- ladder's own viewer answer about every live row of the Table kernel, asked once per group of
-- Tables it cannot tell apart instead of once per Table.
--
-- `seen` is exactly what custom.visible_set's Table-kernel loop answered about each live Table at
-- viewer, one ladder walk per Table (0.55 ms for a Table she owns, 9 ms for one in an organization
-- that shares only what is shared, and the data home asks it for every organization she is in). On
-- a Table that answer is custom.reaches_directly (arms 1 to 3b and the scope arm) OR arm 4
-- (custom.table_has_a_visible_record: something inside it opens to her). The two halves:
--
-- 1. custom.reaches_directly ONCE PER SIGNATURE. What that walk reads about one record is (i) its
--    own columns; (ii) rows that NAME it by id: a grant (iam.permissions), a membership held on it
--    (record or scope), a library grant (platform.entity_grants), a closure row
--    (platform.reachability), a scope assignment or a portal relation (platform.associations), an
--    owned relation record (arm 3b, found from data->parent_id); (iii) its carrying edges
--    (custom.carrying_edges_of), recursing into each container through the same three. So a Table
--    named by nothing in (ii), whose id no second row carries, whose parent_id is well formed, and
--    whose ONE container is a record named by nothing, carried by one row and carried by nothing
--    itself, answers exactly like every other such Table whose own columns and whose container's
--    columns are the same. The signature is those columns: the whole row but its id, content and
--    clocks, a superset of what the ladder reads, so it can only split a group, never merge two
--    that differ. It is custom.levels_of's argument (STORE-READ-PERF-2) taken one carrying edge up
--    to a leaf container. One container only: custom.addressed_cap_specific takes the first
--    container at the nearest depth, and two at one depth come out in an order their ids decide.
--    Every other Table is asked on its own, through custom.levels_of (the same viewer answer).
--    EVERY Table is asked on its own when the registry gives `record` a per-row input no signature
--    carries: an FK containment parent, a reference gate, a detail or child parent pointer, a row
--    class column, the detail variant, owner-only trash.
-- 2. ARM 4, in its own terms and only where it could say yes: she created a live record in the
--    Table; else the viewer answer about each id custom.read_door_granted_ids names (when no more
--    than the ceiling) and about each record something other than the Table carries
--    (custom.carrying_edges_in, once per organization); more carried candidates than the ceiling,
--    where custom.table_has_a_visible_record's own LIMIT picks, are answered by it.
--
-- THE MEMO. Group answers live in this call's loop. As it returns it also leaves each
-- organization's answer in the STATEMENT memo (platform.memo_k_put: fenced by the statement, the
-- backend, the transaction's first write and the seat), so the per-organization custom.visible_set
-- calls the same door statement makes next read it instead of walking again. Nothing is stored
-- anywhere else, and nothing outlives the statement.
--
-- STORE-READ-PERF-5 (2026-09-30): the walk itself moved, unchanged, into custom.tables_seen_among
-- (asked here for every live Table); this function keeps the memo — the shortcut below and the
-- per-organization entries it leaves — exactly as before.
declare
  v_r_org   uuid[] := '{}';  v_r_id uuid[] := '{}';  v_r_seen boolean[] := '{}';
  v_arm     record;
begin
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    return;
  end if;

  -- STORE-READ-PERF-4: ASKED AGAIN IN THE SAME STATEMENT (a door that primes, then a door it calls that
  -- primes again), the answer is the one this statement already worked out — read from the memo when
  -- every organization asked has its entry for this person, statement and snapshot.
  if pg_catalog.pg_current_xact_id_if_assigned() is null and p_user_id is not null
     and not exists (select 1 from unnest(p_organization_ids) x
                      where x is not null
                        and platform.memo_k_get('custom.tables_unseen:' || p_user_id::text || ':' || x::text
                                                || ':' || pg_catalog.pg_current_snapshot()::text) is null) then
    return query
      select x.org, y.id::uuid, true
        from (select distinct o as org from unnest(p_organization_ids) o where o is not null) x
        cross join lateral unnest(string_to_array(nullif(platform.memo_k_get(
               'custom.tables_seen:' || p_user_id::text || ':' || x.org::text || ':' || pg_catalog.pg_current_snapshot()::text), ''), ',')) y(id)
      union all
      select x.org, y.id::uuid, false
        from (select distinct o as org from unnest(p_organization_ids) o where o is not null) x
        cross join lateral unnest(string_to_array(nullif(platform.memo_k_get(
               'custom.tables_unseen:' || p_user_id::text || ':' || x.org::text || ':' || pg_catalog.pg_current_snapshot()::text), ''), ',')) y(id);
    perform platform.memo_k_put('custom.tables_seen_orgs:' || p_user_id::text || ':' || pg_catalog.pg_current_snapshot()::text,
                                coalesce((select string_agg(distinct x::text, ',') from unnest(p_organization_ids) x where x is not null), ''));
    return;
  end if;

  select coalesce(array_agg(g.organization_id), '{}'), coalesce(array_agg(g.id), '{}'), coalesce(array_agg(g.seen), '{}')
    into v_r_org, v_r_id, v_r_seen
    from custom.tables_seen_among(p_user_id, p_organization_ids, null) g;

  -- The statement memo, one pair of entries per organization asked (an organization with no live
  -- Table gets empty answers too, so its caller does not walk it again): the Tables she sees, and
  -- the Table-kernel ids custom.read_door_granted_ids names there — the same query, answered once
  -- for every organization, so custom.visible_set can take its grant ceiling from it.
  for v_arm in
    select o.org,
           coalesce((select string_agg(u.id::text, ',' order by u.id)
                       from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen)
                      where u.org = o.org and u.seen), '') as seen_ids,
           coalesce((select string_agg(u.id::text, ',' order by u.id)
                       from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen)
                      where u.org = o.org and not u.seen), '') as unseen_ids,
           coalesce(gr.ids, '') as granted_ids
      from (select distinct x as org from unnest(p_organization_ids) x where x is not null) o
      left join (
        select r.organization_id as org, string_agg(distinct r.id::text, ',') as ids
          from (
            select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
            union all select m.container_id from iam.memberships m where m.container_type = 'record'
            union all select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
            union all select rr.item_id from platform.reachability rr where rr.item_type = 'record'
          ) h
          join custom.record r
            on r.id = h.id and r.deleted_at is null
           and r.organization_id = any (p_organization_ids)
           and r.table_id is not distinct from custom.table_kernel_id()
         group by 1
      ) gr on gr.org = o.org
  loop
    -- STORE-READ-PERF-4: only while the transaction has written nothing (see custom.visible_set).
    exit when pg_catalog.pg_current_xact_id_if_assigned() is not null;
    perform platform.memo_k_put('custom.tables_seen:' || coalesce(p_user_id::text, '-') || ':' || v_arm.org::text
                                || ':' || pg_catalog.pg_current_snapshot()::text,
                                v_arm.seen_ids);
    perform platform.memo_k_put('custom.tables_unseen:' || coalesce(p_user_id::text, '-') || ':' || v_arm.org::text
                                || ':' || pg_catalog.pg_current_snapshot()::text,
                                v_arm.unseen_ids);
    perform platform.memo_k_put('custom.kernel_granted:' || v_arm.org::text || ':' || pg_catalog.pg_current_snapshot()::text, v_arm.granted_ids);
  end loop;

  if pg_catalog.pg_current_xact_id_if_assigned() is null and p_user_id is not null then
    -- The organizations this statement asked about, for custom.query_visible_ids' one pass over them.
    perform platform.memo_k_put('custom.tables_seen_orgs:' || p_user_id::text || ':' || pg_catalog.pg_current_snapshot()::text,
                                coalesce((select string_agg(distinct x::text, ',') from unnest(p_organization_ids) x where x is not null), ''));
  end if;
  return query select u.org, u.id, u.seen from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen);
end;
$function$;

-- iam.has_access_for_many_in stays standing (iam._memo_ask, memosweep_k, asks it): neutered to the unhinted form, hints ignored.
create or replace function iam.has_access_for_many_in(p_person uuid, p_targets uuid[], p_orgs uuid[], p_level text, p_type text default 'record'::text)
 returns table(target uuid, allowed boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select m.target, m.allowed from iam.has_access_for_many(p_person, p_targets, p_level, p_type) m;
$function$;
drop function custom.hot_doors_6_on(uuid);
