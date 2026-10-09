-- chair-step: undo hotdoors6_c - restores custom.tables_seen_among as hotdoors6_a left it. Run AFTER hotdoors6_d inverse.
-- lane: HOT-DOORS-6
-- based-on: custom.tables_seen_among(uuid, uuid[], uuid[]) 95925f09230532c4325b774c8a32daaabe006f207cf607e3e7f3763dfa029a0a
-- ground-standing-ok: b — this body calls custom.hot_doors_6_on and iam.has_access_for_many_in, which inverse a drops; the order is stated and run in sequence (d, c, b, a), inverse b restores the callee to its pre-lane body before inverse a drops anything, so the end state is consistent and no file is run on top of another out of order.

set local statement_timeout = '60s';

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
  v_all_org uuid[];  -- HOT-DOORS-6: the organization of each v_all Table, read in the same statement
  v_hd6     boolean := custom.hot_doors_6_on(p_user_id);
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
    -- HOT-DOORS-6 (2026-10-09): each Table's organization rides with it (one statement, same rows, same order)
    select coalesce(array_agg(x.id), '{}'::uuid[]), coalesce(array_agg(x.organization_id), '{}'::uuid[])
      into v_all, v_all_org
      from custom.record x
     where x.organization_id = any (p_organization_ids)
       and x.table_id = custom.table_kernel_id()
       and x.deleted_at is null
       and (p_among is null or x.id = any (p_among));
    if not v_hd6 then
      v_all_org := null;
    end if;
    begin
      -- HOT-DOORS-6: the set form is told each Table's organization (a hint: read there, never filtered by
      -- it), and each opened Table's row is read in that organization (k.org) instead of in all sixteen
      -- partitions. Off (custom.hot_doors_6_on false): no hints, every read by id alone, as before.
      with k as materialized (
        select m.target as id, case when count(distinct a.org) = 1 then min(a.org::text)::uuid end as org
          from iam.has_access_for_many_in(p_user_id, v_all, v_all_org, 'viewer', 'record') m
          left join unnest(v_all, v_all_org) a(id, org) on v_hd6 and a.id = m.target
         where m.allowed is true
         group by m.target
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
             and (k.org is null or w.organization_id = k.org)
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

