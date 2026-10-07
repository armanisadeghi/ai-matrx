-- chair-step: undo perffix3_a_the_data_home_reads_its_own_rows_once.sql - restores custom.tables_seen_among, custom.data_home_tables(uuid) and custom.data_home_items exactly as they were before PERF-FIX-3
-- lane: PERF-FIX-3
-- based-on: custom.tables_seen_among(uuid, uuid[], uuid[]) 97bf2602a99d8807adcc53fdac09823b0a0d6e81ad7a4e91e0a24accb7a86245
-- based-on: custom.data_home_tables(uuid) 3821b9984dec8f74ccddc2327b9f2a7b56d0f965901906ccb9d7be75316346f1
-- based-on: custom.data_home_items(uuid) 4790a23d8a33b44587cd8b26327f8db5fff443a62c50811ef07da87b7c2d9fbd

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
       and (p_among is null or x.id = any (p_among))
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
      carried as materialized (
        select r.organization_id as org, r.table_id as tbl, array_agg(distinct ed.item_id) as ids
          from ed
          join custom.record r on r.organization_id = ed.org and r.id = ed.item_id and r.deleted_at is null
         where (r.organization_id, r.table_id) in (select l.org, l.id from l)
           and not (ed.container_type = 'record' and ed.container_id = r.table_id)
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

  return query select u.org, u.id, u.seen from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text
                                       || ':' || pg_catalog.pg_current_snapshot()::text) is null));


  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    team_reach as materialized (
      -- MY TEAM (lane DATA-HOME-2, 2026-09-30): (organization, person) pairs the signed-in person shares a
      -- live team with — iam.my_team_reach, the same answer every *_list_scoped RPC narrows My team by.
      select tr.organization_id, tr.user_id from iam.my_team_reach(null) tr
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'kept_by_the_app')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'kept_by_the_app')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end,
           -- MY TEAM: the Table's maker shares a live team with her in its organization.
           exists (select 1 from team_reach tr where tr.organization_id = a.id and tr.user_id = t.created_by),
           -- SYSTEM: the Table lives in an organization the platform itself keeps (iam.organizations.is_system).
           coalesce((select o2.is_system from iam.organizations o2 where o2.id = a.id), false),
           -- THE MAKER (lane DATA-HOME-2, 2026-09-30): the Table's own created_by, so a list outside the
           -- data home (the agent builder's picker) can run the shell's lanes on the same facts.
           t.created_by
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'kept_by_the_app', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      else exists (select 1 from options_ids o where o.id = t.id::text) end) as word offset 0) w) d offset 0
      ) pl
     -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
     -- default list (custom.table_kept_out_of_lists on its placement word) is listed only when the caller
     -- asks with p_include_app_tables. Every other Table the app keeps (lists, scopes, forms …) is unchanged.
     -- The switch travels as the transaction-local setting custom.include_app_tables, which only the
     -- two-argument overload sets (and puts back); unset, the Table stays out.
     where current_setting('custom.include_app_tables', true) is not distinct from 'on'
        or not custom.table_kept_out_of_lists(pl.p ->> 'kept_for');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_items(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, organization_id uuid, organization_name text, item_id uuid, table_id uuid, table_name text, item_row jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_owner  boolean := custom.query_is_store_owner();
  v_tbl    record;
  v_read   jsonb;
  v_a_id   uuid[];
  v_a_name text[];
  v_a_member boolean[];
  v_v_org  uuid[];
  v_v_id   uuid[];
  v_tpl    jsonb := '{}'::jsonb;
  -- STORE-READ-PERF-3: the one ladder's viewer answer about every live Table of her organizations.
  v_s_org  uuid[];
  v_s_id   uuid[];
  v_s_seen boolean[];
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach,
  -- or the call is refused here, naming this door. Named nobody, the walk below admits only
  -- organizations the caller reaches (the same arms: iam.has_org_access / custom.portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_items');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  -- (A portal whose Table is then not in v_s_* is asked on its own below — the same answer.)
  select coalesce(array_agg(g.organization_id), '{}'), coalesce(array_agg(g.id), '{}'), coalesce(array_agg(g.seen), '{}')
    into v_s_org, v_s_id, v_s_seen
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text) is null)) g;


  -- custom.data_home_tables()'s organizations, word for word — held in arrays (a STABLE door writes
  -- nothing, not even a temporary table). `member` is kept: it decides the walk below.
  select coalesce(array_agg(z.id), '{}'), coalesce(array_agg(z.name), '{}'), coalesce(array_agg(z.member), '{}')
    into v_a_id, v_a_name, v_a_member
    from (
      select o.id, o.name::text as name, bool_or(x.member) as member
        from (
          select m.organization_id as id, true as member
            from iam.organization_member m
           where m.user_id = v_me
          union
          select t.organization_id, false
            from iam.permissions g
            join custom.record t
              on t.id = g.resource_id
             and t.table_id = v_kernel
             and t.deleted_at is null
           where g.resource_type = 'record'
             and g.granted_to_user_id = v_me
             and g.status = 'active'
             and (g.expires_at is null or g.expires_at > now())
        ) x
        join iam.organizations o on o.id = x.id and o.archived_at is null
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         and (p_organization_id is null or o.id = p_organization_id)
       group by o.id, o.name
    ) z;

  -- THE ONE WALK, custom.data_home_tables()' own: in an organization the caller belongs to, every
  -- Table custom.query_visible_ids opens to her, asked ONCE for all kinds; in one she was only let
  -- into, the Tables a live grant names (which is all that walk opens to an outsider — suite F).
  select coalesce(array_agg(w.org_id), '{}'), coalesce(array_agg(w.id), '{}')
    into v_v_org, v_v_id
    from (
      select a.id as org_id, v.v as id
        from unnest(v_a_id, v_a_member) a(id, member)
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from unnest(v_a_id, v_a_member) a(id, member)
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
        join custom.record gt
          on gt.id = g.resource_id and gt.organization_id = a.id and gt.table_id = v_kernel
       where not a.member
    ) w;

  -- FORMS (custom.forms' wall and columns).
  return query
    select 'form'::text, a.id, a.name, f.id, f.table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'form_id', f.id, 'table_id', f.table_id, 'title', f.title, 'slug', f.slug,
             'published_at', f.published_at, 'closed_at', f.closed_at, 'submission_cap', f.submission_cap,
             'responses', s.responses, 'in_table', s.in_table, 'held', s.held, 'rejected', s.rejected,
             'state', case when f.published_at is null then 'draft'
                           when f.closed_at is not null then 'closed'
                           when f.submission_cap is not null and s.live >= f.submission_cap then 'full'
                           else 'open' end,
             'quarantine_rule_id', f.quarantine_rule_id, 'notify_rule_id', f.notify_rule_id,
             'presentation', f.presentation)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.anon_form f on f.organization_id = a.id and f.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = f.table_id
      left join custom.record t on t.organization_id = a.id and t.id = f.table_id and t.deleted_at is null
      left join lateral (
        select count(x.id) as responses,
               count(x.id) filter (where x.state = 'cleared') as in_table,
               count(x.id) filter (where x.state = 'quarantined') as held,
               count(x.id) filter (where x.state = 'rejected') as rejected,
               count(x.id) filter (where x.state <> 'rejected') as live
          from custom.anon_submission x
         where x.organization_id = f.organization_id and x.form_id = f.id) s on true;

  -- BOOKING PAGES (custom.bookings' wall and the columns the home reads).
  return query
    select 'booking'::text, a.id, a.name, f.id, f.table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'form_id', f.id, 'table_id', f.table_id, 'title', coalesce(f.title, 'Book a time'),
             'slug', f.slug, 'published_at', f.published_at, 'closed_at', f.closed_at,
             'slot_minutes', (f.presentation -> 'booking' ->> 'slot_minutes')::integer,
             'timezone', f.presentation -> 'booking' ->> 'timezone',
             'slot_table_id', (f.presentation -> 'booking' ->> 'slot_table_id')::uuid,
             'booked', coalesce(b.booked, 0), 'cancelled', coalesce(b.cancelled, 0),
             'upcoming', coalesce(b.upcoming, 0), 'next_at', b.next_at,
             'state', case when f.closed_at is not null then 'closed'
                           when f.published_at is null then 'draft' else 'open' end)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.anon_form f
        on f.organization_id = a.id and f.deleted_at is null and f.presentation ? 'booking'
      left join custom.record t on t.organization_id = a.id and t.id = f.table_id and t.deleted_at is null
      left join lateral (
        select count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled') as booked,
               count(*) filter (where r.data ->> 'status' = 'cancelled') as cancelled,
               count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                                  and (r.data ->> 'slot')::timestamptz > now()) as upcoming,
               min((r.data ->> 'slot')::timestamptz) filter (
                 where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                   and (r.data ->> 'slot')::timestamptz > now()) as next_at
          from custom.anon_submission s
          join custom.record r
            on r.organization_id = s.organization_id and r.id = s.record_id and r.deleted_at is null
         where s.organization_id = f.organization_id and s.form_id = f.id
           and s.booking_ref is not null) b on true
     where custom.my_level(a.id, f.table_id, 'table') is not null;

  -- PORTALS, and which Tables each shows (custom.list_portals' / custom.portal_tables' wall).
  return query
    select 'portal'::text, a.id, a.name, p.id, p.client_table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'portal_id', p.id, 'title', p.title, 'slug', p.slug, 'client_table_id', p.client_table_id,
             'client_table', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
             'is_active', p.is_active,
             'tables', (select count(*)::integer from custom.portal_table pt where pt.portal_id = p.id),
             'invited', (select count(*)::integer from custom.portal_principal pp
                          where pp.portal_id = p.id and pp.is_active),
             'signed_in', (select count(*)::integer from custom.portal_principal pp
                            where pp.portal_id = p.id and pp.is_active and pp.user_id is not null),
             'sign_in_method', p.sign_in_method, 'opened_at', p.opened_at,
             'shows', coalesce((
               select jsonb_agg(jsonb_build_object('table_id', pt.table_id,
                                                   'name', coalesce(nullif(st.data ->> 'name', ''), 'a table'))
                                order by coalesce(nullif(st.data ->> 'name', ''), 'a table'))
                 from custom.portal_table pt
                 left join custom.record st on st.organization_id = pt.organization_id and st.id = pt.table_id
                where pt.portal_id = p.id and pt.organization_id = a.id), '[]'::jsonb))
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.portal p on p.organization_id = a.id and p.archived_at is null
      left join custom.record t on t.organization_id = p.organization_id and t.id = p.client_table_id
     -- STORE-READ-PERF-3: a live Table of her organizations is answered from the walk above (the same
     -- custom.has_visibility answer); anything else is asked on its own, as before.
     where coalesce((select s.seen from unnest(v_s_org, v_s_id, v_s_seen) as s(org, id, seen)
                      where s.org = a.id and s.id = p.client_table_id limit 1),
                    custom.has_visibility(v_me, 'record', p.client_table_id, 'viewer'::public.permission_level));

  -- DASHBOARDS (custom.dashboards' wall: the Table's own).
  return query
    select 'dashboard'::text, a.id, a.name, d.id, nullif(d.data ->> 'subject_table_id', '')::uuid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'dashboard_id', d.id, 'table_id', nullif(d.data ->> 'subject_table_id', '')::uuid,
             'name', d.data ->> 'name',
             'block_count', jsonb_array_length(coalesce(d.data -> 'blocks', '[]'::jsonb)),
             'presentation', d.data -> 'presentation',
             'version', d.version, 'created_at', d.created_at, 'updated_at', d.updated_at)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record d
        on d.organization_id = a.id
       and d.table_id = custom.presentation_kernel_id()
       and d.data_class = custom.dashboard_class()
       and d.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = nullif(d.data ->> 'subject_table_id', '')::uuid
      left join custom.record t on t.organization_id = a.id and t.id = vis.id and t.deleted_at is null;

  -- DIGESTS AND NOTIFICATIONS (custom.subscriptions' wall).
  return query
    select 'digest'::text, a.id, a.name, r.id, (r.data ->> 'scope_table_id')::uuid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'rule_id', r.id, 'name', coalesce(r.data ->> 'name', 'Subscription'),
             'table_id', (r.data ->> 'scope_table_id')::uuid,
             'saved_view_id', nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
             'cadence', custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
             'channel', coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
             'recipient_user_id', nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
             'muted', coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false),
             'mine', nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record r
        on r.organization_id = a.id and r.data_class = 'rule' and r.deleted_at is null
       and r.data ? 'subscription'
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = (r.data ->> 'scope_table_id')::uuid
      left join custom.record t on t.organization_id = a.id and t.id = vis.id and t.deleted_at is null
     where nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
        or custom.has_visibility(v_me, 'record', vis.id, 'admin'::public.permission_level);

  -- CHECKLISTS (custom.checklist_templates' wall and its page per organization).
  if not v_owner then
    v_tpl := custom.levels_of(v_me, array(
               select c.id from unnest(v_a_id) a(id)
                 join custom.record c
                   on c.organization_id = a.id and c.data_class = 'checklist_template' and c.deleted_at is null));
  end if;
  return query
    select 'checklist'::text, q.org_id, q.org_name, q.id, q.about, q.about_name, q.r
      from (
        select a.id as org_id, a.name as org_name, c.id,
               nullif(c.data ->> 'about_table_id', '')::uuid as about,
               case when nullif(c.data ->> 'about_table_id', '') is null then null
                    else coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table') end as about_name,
               jsonb_build_object(
                 'template_id', c.id, 'name', c.data ->> 'name',
                 'about_table_id', nullif(c.data ->> 'about_table_id', '')::uuid,
                 'about_table', t.data ->> 'name',
                 'steps', jsonb_array_length(coalesce(c.data -> 'steps', '[]'::jsonb)),
                 'roles', jsonb_array_length(coalesce(c.data -> 'roles', '[]'::jsonb)),
                 'trigger_kind', coalesce(c.data #>> '{trigger,kind}', 'manual'),
                 'trigger_status', nullif(c.data #>> '{trigger,status}', ''),
                 'open_runs', (select count(*)::integer from custom.record run
                                where run.organization_id = a.id and run.data_class = 'checklist_run'
                                  and run.deleted_at is null
                                  and nullif(run.data ->> 'template_id', '')::uuid = c.id
                                  and nullif(run.data ->> 'closed_at', '') is null),
                 'total_runs', (select count(*)::integer from custom.record run
                                 where run.organization_id = a.id and run.data_class = 'checklist_run'
                                   and run.deleted_at is null
                                   and nullif(run.data ->> 'template_id', '')::uuid = c.id),
                 'updated_at', c.updated_at) as r,
               row_number() over (partition by a.id order by c.updated_at desc) as n,
               ps.cap
          from unnest(v_a_id, v_a_name) a(id, name)
          cross join lateral (select custom.page_size(a.id, 'custom.checklist_templates', 100, 100, 200) as cap) ps
          join custom.record c
            on c.organization_id = a.id and c.data_class = 'checklist_template' and c.deleted_at is null
          left join custom.record t
            on t.organization_id = c.organization_id and t.id = nullif(c.data ->> 'about_table_id', '')::uuid
         -- STORE-READ-PERF-3: the same custom.has_visibility answer, asked of every template at once
         -- through custom.levels_of (once per class of templates the ladder cannot tell apart).
         where v_owner or coalesce((v_tpl -> c.id::text ->> 's')::boolean, false)
      ) q
     where q.n <= q.cap;

  -- OUTSIDE SHARES (custom.shares_outside' wall).
  return query
    select 'share'::text, a.id, a.name, i.id, t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'invitation_id', i.id, 'table_id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'email', i.email, 'level', coalesce(i.metadata ->> 'level', 'viewer'),
             'level_label', iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
             'status', i.status, 'joined', i.status = 'accepted',
             'expired', i.expires_at is not null and i.expires_at <= now(),
             'invited_at', i.created_at, 'expires_at', i.expires_at,
             'say', case
               when i.status = 'accepted'
                 then format('%s can open %s as a %s.', i.email,
                             coalesce(nullif(t.data ->> 'name', ''), 'this table'),
                             coalesce(i.metadata ->> 'level', 'viewer'))
               when i.expires_at is not null and i.expires_at <= now()
                 then format('%s was invited to %s, and the invitation has run out. Resend it from that table to give them a fresh link.', i.email,
                             coalesce(nullif(t.data ->> 'name', ''), 'a table'))
               else format('%s is invited to %s and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email,
                           coalesce(nullif(t.data ->> 'name', ''), 'a table'))
             end)
      from unnest(v_a_id, v_a_name) a(id, name)
      join iam.invitations i
        on i.organization_id = a.id and i.target_type = 'custom_table'
       and i.deleted_at is null and i.status <> 'revoked'
      join custom.record t
        on t.id = i.target_id and t.organization_id = a.id
       and t.table_id = v_kernel and t.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = t.id;

  -- AUTOMATIONS (custom.pipelines, row for row: a board that cannot be read is listed with why).
  for v_tbl in
    select a.id as org_id, a.name as org_name, t.id,
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)') as name, t.updated_at, t.updated_by
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record t
        on t.organization_id = a.id and t.table_id = v_kernel and t.deleted_at is null
       and nullif(t.data ->> 'stage_field', '') is not null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = t.id
  loop
    begin
      v_read := custom.pipeline_read(v_tbl.org_id, v_tbl.id);
    exception when others then
      kind := 'automation'; organization_id := v_tbl.org_id; organization_name := v_tbl.org_name;
      item_id := v_tbl.id; table_id := v_tbl.id; table_name := v_tbl.name;
      item_row := jsonb_build_object('table_id', v_tbl.id, 'table_name', v_tbl.name, 'stage_field', null,
                                     'stage_label', null, 'stages', 0, 'rules', 0, 'broken', sqlerrm,
                                     'updated_at', v_tbl.updated_at, 'updated_by', v_tbl.updated_by);
      return next;
      continue;
    end;
    if coalesce((v_read ->> 'is_pipeline')::boolean, false) then
      kind := 'automation'; organization_id := v_tbl.org_id; organization_name := v_tbl.org_name;
      item_id := v_tbl.id; table_id := v_tbl.id; table_name := v_tbl.name;
      item_row := jsonb_build_object(
        'table_id', v_tbl.id, 'table_name', v_tbl.name,
        'stage_field', v_read ->> 'stage_field', 'stage_label', v_read ->> 'stage_label',
        'stages', jsonb_array_length(coalesce(v_read -> 'stages', '[]'::jsonb)),
        'rules', jsonb_array_length(coalesce(v_read -> 'rules', '[]'::jsonb)),
        'broken', null, 'updated_at', v_tbl.updated_at, 'updated_by', v_tbl.updated_by);
      return next;
    end if;
  end loop;
end;
$function$;

