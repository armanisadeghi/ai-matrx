-- draft: STORE-READ-PERF-5 — held for the owner's production apply (brief 2026-09-30: this lane makes no production change; rehearsed on the clone, see common-docs PROGRESS-STORE-READ-PERF-5.md). It needs scopesreadswitch_a_file_reference_reads_back_as_its_file.sql applied first (its custom.context_values body is this file's based-on). Remove this line to apply.
-- chair-step: it CREATES four helper functions (custom._record_shown_to_ctx and custom.tables_listed_among: SECURITY INVOKER, no client EXECUTE; custom.tables_seen_among and custom.seen_among: SECURITY DEFINER, no client EXECUTE, server_only door rows) and REPLACES the bodies of custom.tables_seen_once_per_group, custom.query_visible_ids, custom.context_tree, custom.context_values, custom.context_items, custom.context_archived_types, public.get_scope_tree and public.get_user_full_context. Same signatures and grants; two platform.client_callable_door rows are inserted and the reason sentence of custom.context_archived_types' row is rewritten to say what its body now does; no table, index, policy or user/business data row is touched. Nothing a person sees changes: every answer is the same (scripts/campaign-tests/storereadperf5_green.sql, both seats), only faster.
-- lane: STORE-READ-PERF-5
-- based-on: custom.tables_seen_once_per_group(uuid, uuid[]) 81ccf49b1953efb57dd9a8ece22385d4930aa12427f11112628a1f5e263170da
-- based-on: custom.query_visible_ids(uuid, uuid, text) f09bf2632b395c9c592a80c65908616bb515580e03ad76c3dfea0fdfde9a61b5
-- based-on: custom.context_tree(uuid[]) 630998cbfa8a56694d78f9ef1f391e1eea72008e45d15c390773e6a8a97414bf
-- based-on: custom.context_values(uuid[]) 2ba245e491456c1ee71c35c4850ab1c888a3b496bab239ff18e64d8382bee616
-- based-on: custom.context_items(uuid[]) 731ddc49f1e430b673fc6aa2ee988e53f54d1d75991033d8bc37060aac676bd0
-- based-on: custom.context_archived_types(uuid) 6dbb865d72ad4187797a01563d10ef8d213581997cfaef228ec949c0c19a423a
-- based-on: public.get_scope_tree(uuid, uuid) 2783445eaa04b108a01700c764a147def62fc6e66c9d630a5c91c0a65447227a
-- based-on: public.get_user_full_context(uuid) 13e59453b78bedd3e845c95d9a1b1fc698a6a3e1b8e72cadf1562df0bb6759ca
--
-- STORE-READ-PERF-5 — THE SCOPE SCREENS ASK ONLY WHAT THEY SHOW.
--
-- THE PROBLEM (dev clone clone-20260929, warm, one transaction per call as PostgREST runs one; lane
-- SCOPES-READ-SWITCH-VALIDATE's verdict: the store read switch cannot flip while the store path is
-- 2-3x slower and its heaviest doors time out):
--   * custom.context_archived_types paged custom.read_records_archived over EVERY archived Table of
--     the organization, rendering each, to keep the few the context system kept: test@test.com's own
--     workspace (1,313 archived Tables, no archived scope type) 7-30 s to answer [].
--   * every custom.query_visible_ids call worked out platform.shown_to_context('record') — the
--     reader's default list AND teammates in every organization she belongs to — once per
--     transaction, i.e. once per door call: ~100 ms for admin@admin.com (47 organizations), ~30 ms
--     for test@test.com; no record today reads the teammates.
--   * custom.context_tree / context_values / context_items asked the Table list of every
--     organization they touch (the one ladder's walk over EVERY live Table: 400 Tables, ~160 ms for
--     test@test.com) only to keep the few scope Tables among them.
--   * public.get_scope_tree and public.get_user_full_context (behind custom/scope_readers_read_the_store)
--     asked custom.levels_of about every scope and read only its "s": two thirds of the call was the
--     rung (custom.effective_level) nobody reads.
--
-- THE FIX:
--   1. custom.context_archived_types reads only the archived kernel rows whose stored kept_for is
--      context (none: []), and answers them exactly as the archive door does (the one ladder's
--      predicate at viewer, the one read mask, mask_document / choice_render / whole-value pointers).
--   2. custom._record_shown_to_ctx(orgs, table): the "shown to" context for the rows one list reads —
--      the whole platform.shown_to_context('record') when any such row or organization default says
--      my_team, otherwise the same defaults without the teammates (the only part no row there reads).
--      custom.query_visible_ids passes it instead of the whole context.
--   3. The Table walk of custom.tables_seen_once_per_group moves, unchanged, into
--      custom.tables_seen_among(person, orgs, among) — null among: every Table, as before; the memo
--      stays with tables_seen_once_per_group. custom.tables_listed_among(org, tables) asks
--      custom.query_visible_ids(org, Table kernel) among those Tables only (named in the statement
--      memo around its one call); the list then walks only them. The three scope doors ask it instead
--      of priming the whole walk.
--   4. custom.seen_among(person, ids): levels_of's "s" without "l" (same classes, keyed on a superset
--      of levels_of's columns; custom.reaches_directly per class — the ladder's whole viewer answer
--      for a record outside the kernel Table; levels_of itself for kernel rows, duplicate and absent
--      ids). get_scope_tree and get_user_full_context ask it instead of levels_of.
--
-- NOTHING DECIDES DIFFERENTLY: scripts/campaign-tests/storereadperf5_green.sql compares every
-- changed door old-vs-new in one snapshot for both seats, and each planted divergence goes red;
-- scripts/campaign-tests/storereadperf5_timing.sql is RED on the bodies before this file and GREEN
-- after. Inverse: migrations/inverse/storereadperf5_the_scope_screens_ask_only_what_they_show_down.sql.

set local lock_timeout = '30s';

-- ─── 1. the "shown to" context of the rows one list reads ───

CREATE OR REPLACE FUNCTION custom._record_shown_to_ctx(p_organization_ids uuid[], p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE "SHOWN TO" CONTEXT FOR THE RECORDS ONE LIST IS ABOUT TO READ.
--
-- custom.query_visible_ids passes platform.shown_to_context('record') to platform.shown_to_lists
-- for every row it lists. That context names, for EVERY organization the reader belongs to, the
-- organization's default list ('d') and her teammates there ('t'); it is worked out once per
-- transaction, and every PostgREST request is its own transaction, so every door call paid it:
-- ~100 ms for admin@admin.com (47 organizations; iam.teammate_user_ids ~1.3 ms each) and ~30 ms
-- for test@test.com, on every tree, values and items call.
--
-- platform.shown_to_lists reads the context of the ROW'S organization only, and reads the teammates
-- part ('t') only when the row's list resolves to 'my_team' — the row's own shown_to, or, when it has
-- none, the organization's default. So for the organizations this list reads, and this Table when one
-- is named:
--   * when some live row there says 'my_team', or some such organization's default is 'my_team',
--     the answer IS platform.shown_to_context('record'), whole (so the rare case is byte-identical);
--   * otherwise it is that context without the teammates: {org: {"d": <the same default>}} for each
--     of these organizations the reader is a live member of — the only keys any row here can read.
-- It decides nothing: shown_to_lists answers every row exactly as it would with the whole context.
-- The answer waits in the STATEMENT memo (platform.memo_k_*: fenced by the statement, the backend,
-- the transaction's first write and the seat) for the next list of the same statement that reads the
-- same organizations and Table (the scope tree asks once per scope Table).
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_d   platform.shown_to;
  v_key text;
  v_hit text;
  r     record;
begin
  if v_uid is null then
    return v_out;
  end if;
  v_key := 'custom.record_shown_to_ctx:' || v_uid::text || ':' || coalesce(p_table_id::text, '-') || ':'
        || md5(array_to_string(array(select distinct x::text from unnest(p_organization_ids) x order by 1), ','));
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  if exists (select 1 from custom.record x
              where x.organization_id = any (p_organization_ids)
                and (p_table_id is null or x.table_id = p_table_id)
                and x.deleted_at is null
                and x.shown_to = 'my_team'::platform.shown_to) then
    v_out := platform.shown_to_context('record');
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  for r in
    select distinct om.organization_id
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = v_uid
       and om.organization_id = any (p_organization_ids)
  loop
    v_d := platform.shown_to_default('record', r.organization_id, v_uid);
    if v_d = 'my_team'::platform.shown_to then
      v_out := platform.shown_to_context('record');
      perform platform.memo_k_put(v_key, v_out::text);
      return v_out;
    end if;
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d));
  end loop;
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end;
$function$;

revoke all on function custom._record_shown_to_ctx(uuid[], uuid) from public;
revoke all on function custom._record_shown_to_ctx(uuid[], uuid) from anon, authenticated;

-- ─── 2. the Table walk, among named Tables; tables_seen_once_per_group keeps its memo ───

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
  for v_i in 1 .. coalesce(cardinality(v_ids), 0) loop
    if v_keys[v_i] is null then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i];
      v_r_seen := v_r_seen || coalesce((v_one -> v_ids[v_i]::text ->> 's')::boolean, false);
      continue;
    end if;
    if v_keys[v_i] is distinct from v_prev_k then
      v_prev_v := custom.reaches_directly(p_user_id, 'record', v_ids[v_i], 'viewer'::public.permission_level);
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

revoke all on function custom.tables_seen_among(uuid, uuid[], uuid[]) from public;
revoke all on function custom.tables_seen_among(uuid, uuid[], uuid[]) from anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'tables_seen_among', 'p_user_id uuid, p_organization_ids uuid[], p_among uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype, 'uuid[]'::regtype]::oid[],
   'p_user_id is the reader the CALLING definer already resolved (custom.query_principal() in custom.query_visible_ids, its own p_user_id in custom.tables_seen_once_per_group); p_organization_ids are organizations that caller already decided through custom.assert_client_may_reach; p_among narrows the walk to those Table ids (null: every live Table). It decides nothing of its own: for each live Table walked it answers exactly the one ladder''s viewer answer, custom.reaches_directly once per group of Tables the ladder cannot tell apart and arm 4 per Table, as custom.tables_seen_once_per_group always has.',
   'storereadperf5_the_scope_screens_ask_only_what_they_show.sql',
   'server_only: called only inside the record store''s own definer doors (custom.tables_seen_once_per_group, custom.query_visible_ids); a client learns which Tables it sees through custom.query_visible_ids and the data home doors.',
   false, false);

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

-- ─── 3. custom.query_visible_ids: the lean context, and the Table list among named Tables ───

CREATE OR REPLACE FUNCTION custom.query_visible_ids(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_required text DEFAULT 'viewer'::text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user uuid := custom.query_principal();
  v_set  record;
  v_tbl  uuid;
  -- Access ladder T-36: "Shown to" is the list filter ("Only me" hides, never locks). One context
  -- per statement; platform.shown_to_lists decides each row exactly as every other list door does.
  v_ctx  jsonb;
  -- STORE-READ-PERF-4: the Table-kernel answer for every organization of this statement at once.
  v_snap  text;
  v_m     text;
  v_orgs  uuid[];
  v_o     uuid;
  v_sets  jsonb := '[]'::jsonb;
  v_one   record;
  v_among uuid[];
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
  -- STORE-READ-PERF-5 (2026-09-30): THE TABLE LIST AMONG NAMED TABLES. A door that shows only some
  -- Tables (the scope screens: the Tables the context system keeps) asks through
  -- custom.tables_listed_among, which names them for this organization in the statement memo
  -- ('custom.qvi_kernel_among:<person>:<organization>') around its one call here and drops the entry
  -- after. Then this answer is the answer below restricted to those Tables: the same live,
  -- unquarantined, "shown to" rows, and of them the ones she created or the one ladder's viewer
  -- answer sees — custom.tables_seen_among asked for those Tables only (a Table's answer never
  -- depends on which Tables are walked beside it). Below, at viewer on the Table kernel,
  -- custom.visible_set answers exactly that set — its kernel branch hands back no granted or class
  -- answer, only "every Table is seen" (then each of these is among the seen ones) or the seen list
  -- — except at its stops, where it walks each row; so at a stop (an FK containment parent for
  -- record, more granted kernel ids or live Tables than the ceiling) this is not used and the full
  -- answer below is given, as always.
  if p_table_id = custom.table_kernel_id() and p_required = 'viewer' then
    v_m := platform.memo_k_get('custom.qvi_kernel_among:' || v_user::text || ':' || p_organization_id::text);
    if v_m is not null
       and not exists (select 1 from platform.entity_relationships er
                        where er.child_type = 'record' and er.kind in ('composition', 'containment'))
       and coalesce(cardinality(custom.read_door_granted_ids(p_organization_id, custom.table_kernel_id())), 0)
           <= custom.read_door_ladder_ceiling()
       and (select count(*) from custom.record r
             where r.organization_id = p_organization_id
               and r.table_id = custom.table_kernel_id()
               and r.deleted_at is null) <= custom.read_door_ladder_ceiling() then
      v_among := coalesce(string_to_array(nullif(v_m, ''), ',')::uuid[], '{}'::uuid[]);
      v_ctx := custom._record_shown_to_ctx(array[p_organization_id], custom.table_kernel_id());
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.id = any (v_among)
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or r.id in (select g.id from custom.tables_seen_among(v_user, array[p_organization_id], v_among) g
                           where g.seen) );
      return;
    end if;
    v_m := null;
  end if;
  -- STORE-READ-PERF-4 (2026-09-29): THE TABLE LIST, ANSWERED FOR EVERY ORGANIZATION OF THE STATEMENT
  -- AT ONCE. A door that walks many organizations (the data home, the scope tree) first asks
  -- custom.tables_seen_once_per_group for all of them, which names them in this statement's memo.
  -- The first of its per-organization calls here then works out THIS function's own answer — the
  -- same custom.visible_set per organization, the same filters, the same branches, word for word
  -- below — for every one of those organizations in one pass, and leaves each in the memo; the
  -- rest read theirs. Only at viewer, only on the Table kernel, only while the transaction has
  -- written nothing, and never for an organization at one of visible_set's stops (it walks here
  -- as always). Each organization is still decided in its own call, by the wall above, before its
  -- answer is read.
  if p_table_id = custom.table_kernel_id() and p_required = 'viewer'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_snap := pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get('custom.qvi_kernel:' || v_user::text || ':' || p_organization_id::text || ':' || v_snap);
    if v_m is not null then
      return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
      return;
    end if;
    v_orgs := string_to_array(nullif(platform.memo_k_get('custom.tables_seen_orgs:' || v_user::text || ':' || v_snap), ''), ',')::uuid[];
    -- (an organization at one of visible_set's stops walks on its own, below, without a batch)
    if p_organization_id = any (coalesce(v_orgs, '{}'::uuid[]))
       and not (custom.visible_set(v_user, p_organization_id, custom.table_kernel_id(),
                                   'viewer'::public.permission_level)).o_fallback then
      -- STORE-READ-PERF-5: the "shown to" context of these organizations' Tables only, without the
      -- teammates where no row can read them (custom._record_shown_to_ctx; same answers).
      v_ctx := custom._record_shown_to_ctx(v_orgs, custom.table_kernel_id());
      foreach v_o in array v_orgs loop
        v_set := custom.visible_set(v_user, v_o, custom.table_kernel_id(), 'viewer'::public.permission_level);
        continue when v_set.o_fallback;
        v_sets := v_sets || jsonb_build_object('org', v_o, 'all', v_set.o_all_visible,
                    'tv', coalesce(to_jsonb(v_set.o_true_visibility), '[]'::jsonb),
                    'ga', coalesce(to_jsonb(v_set.o_granted_all), '[]'::jsonb),
                    'gv', coalesce(to_jsonb(v_set.o_granted_visible), '[]'::jsonb),
                    'cv', coalesce(to_jsonb(v_set.o_carried_visible), '[]'::jsonb));
      end loop;
      if exists (select 1 from jsonb_array_elements(v_sets) e where (e ->> 'org')::uuid = p_organization_id) then
        for v_one in
          with sets as materialized (
            select (e ->> 'org')::uuid as org, (e ->> 'all')::boolean as all_v,
                   array(select jsonb_array_elements_text(e -> 'tv'))::platform.visibility[] as tv,
                   array(select jsonb_array_elements_text(e -> 'ga'))::uuid[] as ga,
                   array(select jsonb_array_elements_text(e -> 'gv'))::uuid[] as gv,
                   array(select jsonb_array_elements_text(e -> 'cv'))::uuid[] as cv
              from jsonb_array_elements(v_sets) e
          )
          select s.org,
                 coalesce((select string_agg(r.id::text, ',')
                             from custom.record r
                            where r.organization_id = s.org
                              and r.table_id = custom.table_kernel_id()
                              and r.deleted_at is null
                              and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                              and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
                              and case
                                    when s.all_v then true
                                    when coalesce(array_length(s.tv, 1), 0) > 0 then
                                      ( r.created_by = v_user
                                     or (r.visibility = any (s.tv) and not (r.id = any (s.ga)))
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                    else
                                      ( r.created_by = v_user
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                  end), '') as ids
            from sets s
        loop
          perform platform.memo_k_put('custom.qvi_kernel:' || v_user::text || ':' || v_one.org::text || ':' || v_snap, v_one.ids);
          if v_one.org = p_organization_id then
            v_m := v_one.ids;
          end if;
        end loop;
        return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
        return;
      end if;
    end if;
  end if;

  -- STORE-READ-PERF-5: the "shown to" context of this organization (and Table) only, without the
  -- teammates where no row can read them (custom._record_shown_to_ctx; same answers).
  v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);

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
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           -- THE ONE LADDER, per row, exactly as before this file.
           and custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level);

    elsif v_set.o_all_visible then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx);

    elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
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
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.tables_listed_among(p_organization_id uuid, p_tables uuid[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). OF THESE TABLES, THE ONES custom.query_visible_ids(org, Table
-- kernel) LISTS — without walking every other Table of the organization.
--
-- The scope screens ask the Table list of an organization only to keep the few Tables the context
-- system keeps; the list's cost is the one ladder's Table walk over EVERY live Table (400 for
-- test@test.com's five organizations, ~160 ms). This names the Tables asked about in the statement
-- memo for this person and organization, asks custom.query_visible_ids(org, Table kernel) once — which
-- then answers among them only (its own header says how, and when it answers in full instead) — and
-- drops the entry, so no other ask of the same statement sees it. The answer is the list's own
-- answer restricted to these Tables. It decides nothing.
declare
  v_user uuid := custom.query_principal();
  v_key  text;
begin
  if p_tables is null or cardinality(p_tables) = 0 then
    return;
  end if;
  if v_user is not null then
    v_key := 'custom.qvi_kernel_among:' || v_user::text || ':' || p_organization_id::text;
    perform platform.memo_k_put(v_key, array_to_string(array(select distinct x from unnest(p_tables) x
                                                               where x is not null order by 1), ','));
  end if;
  return query
    select v.v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v(v)
     where v.v = any (p_tables);
  if v_key is not null then
    perform platform.memo_k_drop(v_key);
  end if;
end;
$function$;

revoke all on function custom.tables_listed_among(uuid, uuid[]) from public;
revoke all on function custom.tables_listed_among(uuid, uuid[]) from anon, authenticated;

-- ─── 4. which of these records she sees, without the rung ───

CREATE OR REPLACE FUNCTION custom.seen_among(p_user_id uuid, p_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). WHICH OF THESE RECORDS THIS PERSON SEES — the "s" half of
-- custom.levels_of, without the rung.
--
-- public.get_scope_tree and public.get_user_full_context asked custom.levels_of about every scope of
-- an organization and read only its "s"; levels_of also works out "l" (custom.effective_level, ~11 ms
-- a class against ~6 ms for the viewer answer), so two thirds of the call answered a question
-- nobody read.
--
-- THE ANSWER, per id, is exactly levels_of's "s" (the one ladder's viewer answer, the read door's
-- own check), asked the way levels_of asks it:
--   * an ordinary record (one row with that id, not a row of the kernel Table) that no row names
--     is asked once per CLASS — its organization, its Table, whether it is live, whether this person
--     created it, and every other column of its row as a whole (to_jsonb of the row minus id, content
--     and clocks: a superset of the columns levels_of keys on, so a class here never spans two of
--     levels_of's) — through custom.reaches_directly, which is the ladder's whole viewer answer for a
--     record outside the kernel Table (the ladder's other arm reads only kernel rows);
--   * a NAMED record (the same naming rows levels_of lists: a grant, a membership on it, a library
--     grant, a closure row, a carrying association from either side), and every record while
--     `record` has a registered FK containment parent, walks alone on custom.reaches_directly;
--   * an id with no row, two rows, no Table, or a row of the kernel Table is answered by
--     custom.levels_of itself.
declare
  v_memo   jsonb := '{}'::jsonb;
  v_out    uuid[] := '{}'::uuid[];
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_s      boolean;
  r        record;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    with
    u as materialized (select distinct x.id from unnest(p_ids) x(id) where x.id is not null),
    x as materialized (select z.* from custom.record z where z.id = any (p_ids)),
    xn as materialized (select x.id, count(*) as n from x group by x.id),
    x1 as materialized (select distinct on (x.id) x.* from x order by x.id),
    -- The rows that NAME a record, exactly the arms custom.levels_of tests per id, asked once for
    -- the whole set (the same predicates, as unions over "= any (p_ids)").
    named as materialized (
      select p.resource_id as id from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = any (p_ids)
      union
      select m.container_id from iam.memberships m
       where m.container_type in ('record', 'scope') and m.container_id = any (p_ids)
      union
      select g.entity_id from platform.entity_grants g
       where g.entity_type = 'record' and g.entity_id = any (p_ids)
      union
      select rr.item_id from platform.reachability rr
       where rr.item_type = 'record' and rr.item_id = any (p_ids)
      union
      select a.target_id from platform.associations a
       where a.deleted_at is null and a.target_type = 'record' and a.target_id = any (p_ids)
         and ( exists (select 1 from platform.association_types t
                        where t.source_type = a.source_type and t.target_type = a.target_type
                          and (t.label is null or t.label = a.label)
                          and t.is_active and t.container_side = 'source')
            or exists (select 1 from custom.carrying_rule cr
                        where cr.role = a.role and cr.is_active and cr.container_side = 'source'))
      union
      select a.source_id from platform.associations a
       where a.deleted_at is null and a.source_type = 'record' and a.source_id = any (p_ids)
         and ( a.target_type = 'scope'
            or a.relation_field_id is not null and exists (
                 select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
            or exists (select 1 from platform.association_types t
                        where t.source_type = a.source_type and t.target_type = a.target_type
                          and (t.label is null or t.label = a.label)
                          and t.is_active and t.container_side = 'target')
            or exists (select 1 from custom.carrying_rule cr
                        where cr.role = a.role and cr.is_active and cr.container_side = 'target'))
    )
    select u.id, x1.organization_id, x1.table_id, x1.deleted_at is null as live,
           x1.created_by is not distinct from p_user_id as own,
           (to_jsonb(x1) - array['id','data','metadata','custom_fields','created_at','updated_at',
                                 'updated_by','version','deleted_at','created_by']) as cols,
           coalesce(xn.n, 0) as n,
           u.id in (select named.id from named) as named
      from u
      left join xn on xn.id = u.id
      left join x1 on x1.id = u.id
  loop
    if r.n <> 1 or r.table_id is null or r.table_id = v_kernel then
      v_s := coalesce((custom.levels_of(p_user_id, array[r.id]) -> r.id::text ->> 's')::boolean, false);
    else
      v_key := case when v_fk or r.named then null
                    else r.organization_id::text || ':' || r.table_id::text || ':' || r.live::text || ':'
                      || r.own::text || ':' || r.cols::text end;
      if v_key is not null and v_memo ? v_key then
        v_s := (v_memo ->> v_key)::boolean;
      else
        v_s := custom.reaches_directly(p_user_id, 'record', r.id, 'viewer'::public.permission_level);
        if v_key is not null then
          v_memo := v_memo || jsonb_build_object(v_key, v_s);
        end if;
      end if;
    end if;
    if v_s then
      v_out := v_out || r.id;
    end if;
  end loop;
  return v_out;
end;
$function$;

revoke all on function custom.seen_among(uuid, uuid[]) from public;
revoke all on function custom.seen_among(uuid, uuid[]) from anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'seen_among', 'p_user_id uuid, p_ids uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_user_id is the reader the CALLING reader already resolved and checked (public.get_scope_tree: auth.uid() after custom.assert_client_may_reach; public.get_user_full_context: its v_uid after the DD-192 self/service/admin check); p_ids are records that reader is about to list. It decides nothing of its own: for each id it answers exactly custom.levels_of''s "s" (the one ladder''s viewer answer) - custom.reaches_directly once per class of look-alike ordinary records, custom.levels_of for kernel rows, duplicate ids and absent ids.',
   'storereadperf5_the_scope_screens_ask_only_what_they_show.sql',
   'server_only: called only inside the definer readers public.get_scope_tree and public.get_user_full_context; a client learns which scopes it sees through those readers and custom.context_tree.',
   false, false);

-- ─── 5. the three scope doors ask the Table list among their scope Tables ───

CREATE OR REPLACE FUNCTION custom.context_tree(p_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_orgs   uuid[];
  v_org    uuid;
  v_admin  uuid[] := '{}'::uuid[];
  v_types  jsonb := '[]'::jsonb;
  v_scopes jsonb := '[]'::jsonb;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide): every organization named
  -- is one the caller may reach, or the call is refused here naming this door (42501) — never an
  -- empty tree that reads like "no scopes here".
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    -- THE ADMIN LANE (parity with the platform_admin_select policies the old scope tables carry): on
    -- a request from /administration/** (public.is_platform_admin() is true only with the admin-lane
    -- header, for a platform admin) an organization the admin is not a member of is read whole,
    -- for the scope console. Everyone else, and every user page, meets the wall.
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree');
  end loop;
  if v_me is null or cardinality(v_orgs) = 0 then
    return jsonb_build_object('types', v_types, 'scopes', v_scopes);
  end if;

  -- THE TWO-STEP SHAPE (SCOPES-CUTOVER-PLAN E7). Step 1: the scope types of these organizations —
  -- the live Tables the context system keeps — that the caller sees on the one ladder (asked only
  -- for organizations that keep a scope type at all). Step 2: their live Records the caller sees,
  -- by the (organization_id, table_id) index, and of each only the columns the caller may read.
  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  ),
  t as materialized (
    select t0.* from t0
     where t0.org = any (v_admin)
        -- STORE-READ-PERF-5: the Table list asked among these scope Tables only
        -- (custom.tables_listed_among: query_visible_ids' own answer, restricted to them).
        or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                        where not (t0.org = any (v_admin)) group by t0.org) o
                       cross join lateral custom.tables_listed_among(o.org, o.ids) v(v))
  ),
  -- The scope's own columns (name, description, slug, sort order) and each settings key are Fields
  -- the scope door derived on its Table (version-5 ids from custom._ctx_id). Each one is answered only
  -- where the one field decision (iam.may_touch_field, the step custom.read_mask_for takes for every
  -- Field) lets the caller read it: asked at viewer, the least a person who sees the Record holds,
  -- and — only where viewer may not — again at the caller's own level on the Table.
  -- STORE-READ-PERF-4: every column Field of these organizations, and every live Record of these
  -- Tables, read in ONE pass each (the same rows the per-Table and per-id lookups found).
  flds as materialized (
    -- found through the store's GIN index on the document: a Field whose entity_definition_id is
    -- this Table's id holds exactly that string there, so containment finds exactly those rows.
    select f0.id, f0.organization_id, f0.data, f0.metadata
      from t t1
      join custom.record f0
        on f0.organization_id = t1.org
       and f0.data @> jsonb_build_object('entity_definition_id', t1.id::text)
       and f0.table_id = v_fields and f0.deleted_at is null
       and substr(f0.id::text, 15, 1) = '5'
  ),
  recs as materialized (
    select r0.id, r0.organization_id, r0.table_id, r0.data, r0.created_by, r0.created_at, r0.updated_at
      from custom.record r0
     where r0.organization_id = any ((select array_agg(distinct t2.org) from t t2)::uuid[])
       and r0.table_id = any ((select array_agg(t3.id) from t t3)::uuid[])
       and r0.deleted_at is null
  ),
  colf as materialized (
    select t.org, t.id as tbl, f.id as fid, f.data ->> 'key' as key,
           f.id = custom._ctx_id('scope-column-field', t.id::text, 'description') as is_desc,
           custom._ctx_setting_of(f.id, t.id, f.metadata -> 'moved_from' ->> 'note') as setting,
           f.data ->> 'type' as behavior,
           f.data ->> 'sensitivity' as sens,
           -- STORE-READ-PERF-4: the ONE field decision reads a Field through its sensitivity, a grant
           -- naming it, the formula inputs it reads, and (for a portal principal of the organization)
           -- the portal's field list. A Field with none of the last three answers like every other
           -- Field of its organization and sensitivity, so the decision is asked once for them all;
           -- every other Field is asked on its own, exactly as before.
           (exists (select 1 from iam.permissions p where p.resource_type = 'record' and p.resource_id = f.id)
            or coalesce(f.data ->> 'type', '') = 'formula'
            or exists (select 1 from custom.portal_principal pp
                        where pp.user_id = v_me and pp.organization_id = t.org)) as alone
      from t
      join flds f
        on f.organization_id = t.org
       and f.data ->> 'entity_definition_id' = t.id::text
  ),
  fgroup as materialized (
    select g.org, g.sens,
           iam.may_touch_field(v_me, g.rep, g.org, 'viewer'::public.permission_level, 'read') as viewer_reads
      from (select c.org, c.sens, min(c.fid::text)::uuid as rep
              from colf c
             where not c.alone and not (c.org = any (v_admin))
             group by c.org, c.sens) g
  ),
  shown as materialized (
    select colf.*
      from colf
      left join fgroup g on g.org = colf.org and g.sens is not distinct from colf.sens and not colf.alone
     where case when colf.org = any (v_admin) then true
                when g.viewer_reads then true
                when not colf.alone and g.viewer_reads is not null then
                  iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read')
                when iam.may_touch_field(v_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           -- The description column answers to scope_description on a Table with an item of that key.
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, jsonb_build_object('setting', s.setting, 'behavior', s.behavior)) from shown s
                      where s.org = t.org and s.tbl = t.id and s.setting is not null), '{}'::jsonb) as setting_keys
      from t
  ),
  vis as materialized (
    select t.org, t.id as tbl, v.v as id
      from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
     where not (t.org = any (v_admin))
    union all
    select t.org, t.id, r.id
      from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
     where t.org = any (v_admin)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', t.id, 'organization_id', t.org,
                'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                'name', t.data -> 'name', 'icon', t.data -> 'icon', 'color', t.data -> 'color',
                'slug', t.data -> 'slug', 'description', t.data -> 'description',
                'sort_order', t.data -> 'sort_order',
                'max_assignments_per_entity', t.data -> 'max_assignments_per_entity',
                'default_variable_keys', t.data -> 'default_variable_keys',
                'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
              order by coalesce((t.data ->> 'sort_order')::numeric, 0), t.data ->> 'label_plural', t.id)
                from t), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.id, 'scope_type_id', r.table_id, 'organization_id', r.organization_id,
                'name', case when c.visible ? 'name' then r.data -> 'name' end,
                'description', case when c.visible ? c.desc_key then r.data -> c.desc_key end,
                'slug', case when c.visible ? 'slug' then r.data -> 'slug' end,
                'sort_order', case when c.visible ? 'sort_order' then r.data -> 'sort_order' end,
                'parent_scope_id', r.data -> 'parent_id',
                'settings', coalesce((select jsonb_object_agg(s.value ->> 'setting', custom._ctx_setting_back(r.data -> s.key, s.value ->> 'behavior'))
                                        from jsonb_each(c.setting_keys) s
                                       where r.data ? s.key
                                         and jsonb_typeof(r.data -> s.key) <> 'null'), '{}'::jsonb),
                'created_by', r.created_by, 'created_at', r.created_at, 'updated_at', r.updated_at)
              order by coalesce((r.data ->> 'sort_order')::numeric, 0), r.data ->> 'name', r.id)
                from vis
                join recs r
                  on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
                join cols c on c.org = vis.org and c.id = vis.tbl), '[]'::jsonb)
    into v_types, v_scopes;

  return jsonb_build_object('types', v_types, 'scopes', v_scopes);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_values(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'custom.context_values answers at most 200 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 200 or fewer.';
  end if;


  -- A value is a key of the scope's Record document; the document comes through
  -- custom.read_records_by_ids (the one ladder, the one read mask), so a key the caller may not see
  -- is simply absent. Beside each value: its version, when it was set, the source it came from and
  -- the old value id the copy carried (the Record's own value stamps).
  for v_grp in
    select r.organization_id as org, r.table_id as tbl, array_agg(r.id) as ids
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
     where r.id = any (v_ids) and r.deleted_at is null
     group by 1, 2
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_values');
    -- STORE-READ-PERF-5: the Table list asked about this one Table (custom.tables_listed_among:
    -- query_visible_ids' own answer, restricted to it), not every Table of the organization.
    continue when not exists (select 1 from custom.tables_listed_among(v_grp.org, array[v_grp.tbl]) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.ids, false) x
      ),
      h as materialized (
        select r.id, r.data -> '_values' as stamps, r.data -> '_sources' as sources, r.updated_at
          from custom.record r where r.organization_id = v_grp.org and r.id = any (v_grp.ids)
      ),
      f as materialized (
        select x.id, x.data, x.metadata from custom.record x
         where x.organization_id = v_grp.org and x.table_id = v_fields and x.deleted_at is null
           and x.data ->> 'entity_definition_id' = v_grp.tbl::text
           and substr(x.id::text, 15, 1) <> '5'
      ),
      v as materialized (
        select d.id as scope_id, f.id as item_id, f.data ->> 'key' as key, f.data as fdoc, f.metadata as fmeta,
               d.document -> (f.data ->> 'key') as value,
               h.stamps -> (f.data ->> 'key') as stamp, h.sources, h.updated_at
          from d join h on h.id = d.id
          join f on d.document ? (f.data ->> 'key') and jsonb_typeof(d.document -> (f.data ->> 'key')) <> 'null'
      ),
      -- The names of the scopes a reference points at, for its chip — only scopes the caller sees
      -- (the one ladder's level on each, custom.levels_of, asked once for all of them).
      refs as materialized (
        select distinct (e #>> '{}')::uuid as id
          from v cross join lateral jsonb_array_elements(case jsonb_typeof(v.value)
                                                           when 'array' then v.value
                                                           when 'string' then jsonb_build_array(v.value)
                                                           else '[]'::jsonb end) e
         where v.fdoc ->> 'type' = 'relation' and jsonb_typeof(e) = 'string'
           and (e #>> '{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ),
      lv as materialized (
        select custom.levels_of(v_me, (select array_agg(refs.id) from refs)) as l where exists (select 1 from refs)
      ),
      names as materialized (
        select x.id, x.data ->> 'name' as name,
               -- A File RECORD (the kernel File Table) names its file in data.file_id; the old fence
               -- named the file, so the answer carries it beside the name (lane SCOPES-READ-SWITCH-VALIDATE).
               case when x.table_id = '11111111-0000-4000-8000-000000000006'::uuid then x.data ->> 'file_id' end as file_id
          from custom.record x, lv
         where x.organization_id = v_grp.org and x.id in (select refs.id from refs)
           and (lv.l -> x.id::text ->> 'l') is not null
      )
      select jsonb_agg(jsonb_build_object(
               'scope_id', v.scope_id, 'context_item_id', v.item_id, 'key', v.key, 'value', v.value,
               'field', jsonb_build_object(
                 'type', v.fdoc -> 'type', 'multi', v.fdoc -> 'multi', 'format', v.fdoc -> 'format',
                 'display_format', v.fdoc -> 'display_format', 'config', v.fdoc -> 'config',
                 'relation_target', v.fdoc -> 'relation_target',
                 'carried', v.fmeta -> 'moved_from' -> 'carried'),
               'version', coalesce((v.stamp ->> 'ver')::int, 1),
               'set_at', coalesce(v.stamp ->> 'at', v.updated_at::text),
               'source_type', v.sources -> (v.stamp ->> 'src') ->> 'source_type',
               'value_id', v.sources -> (v.stamp ->> 'src') ->> 'old_value_id',
               'authored_by', case when (v.stamp ->> 'actor') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                                   then v.stamp ->> 'actor' end,
               'labels', (select jsonb_object_agg(n.id, n.name) from names n
                           where v.fdoc ->> 'type' = 'relation'
                             and (n.id::text = v.value #>> '{}'
                                  or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text))),
               'files', (select jsonb_object_agg(n.id, n.file_id) from names n
                          where n.file_id is not null and v.fdoc ->> 'type' = 'relation'
                            and (n.id::text = v.value #>> '{}'
                                 or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text)))))
        from v), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_items(p_scope_type_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_type_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;

  -- Each scope type opens in its own organization (read from the Table itself), decided in this
  -- door's name; the Fields come through custom.applicable_fields, the store's own Field door, which
  -- asks whether the caller may know the Table. A Field the scope door derived (the scope's own
  -- name / description / slug / sort-order columns, a settings key — a version-5 id from
  -- custom._ctx_id) was never a context item and is not answered.
  for v_grp in
    select t.organization_id as org, t.id as tbl
      from custom.record t
     where t.id = any (v_ids) and t.table_id = v_tables and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_items');
    -- STORE-READ-PERF-5: the Table list asked about this one Table (custom.tables_listed_among:
    -- query_visible_ids' own answer, restricted to it), not every Table of the organization.
    continue when not exists (select 1 from custom.tables_listed_among(v_grp.org, array[v_grp.tbl]) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'data', f.data, 'carried', f.metadata -> 'moved_from' -> 'carried',
               'created_by', f.created_by, 'created_at', f.created_at, 'updated_at', f.updated_at,
               'version', f.version)
             order by coalesce((f.data ->> 'sort')::numeric, 0), f.data ->> 'label', f.id)
        from custom.applicable_fields(v_grp.org, v_grp.tbl, null) f
       where f.deleted_at is null
         and substr(f.id::text, 15, 1) <> '5'), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

-- ─── 6. the two DB-switched scope readers ask seen_among ───

CREATE OR REPLACE FUNCTION public.get_scope_tree(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_member boolean;
  v_seen uuid[];
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_tree_from_the_image(p_org_id, p_type_id);
  end if;
  -- SCOPES-READS-TREE: read from the record store. WHO SEES WHAT is the store's own two
  -- questions, asked exactly as custom.read_record and custom.resolve_context ask them: the
  -- organization's wall (custom.assert_client_may_reach — a member, or somebody the organization
  -- admits from outside: a portal principal, a class member), then the one ladder
  -- (custom.levels_of) for every scope before any is named. DD-112 / CUT-30: plain membership no
  -- longer gates the list ahead of the ladder — whoever the store admits from outside is listed
  -- what was shared with her; an archived organization and a stranger are refused as before.
  v_member := auth.role() = 'service_role';
  if not v_member then
    begin
      perform custom.assert_client_may_reach(p_org_id, 'public.get_scope_tree');
    exception when insufficient_privilege or null_value_not_allowed then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', p_org_id)::text;
    end;
    v_member := (iam.has_org_access(p_org_id)) is true;
  end if;
  -- STORE-READ-PERF-5: which scopes she sees is custom.seen_among (the "s" of custom.levels_of,
  -- the one ladder's viewer answer, without the rung this reader never read).
  if auth.role() is distinct from 'service_role' then
    v_seen := custom.seen_among(auth.uid(), coalesce((
      select array_agg(r.id)
        from custom.record t
        join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
       where t.organization_id = p_org_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null
         and t.data ->> 'kept_for' = 'context' and (p_type_id is null or t.id = p_type_id)), '{}'::uuid[]));
  end if;
  select jsonb_agg(
    s.row_doc || jsonb_build_object(
      'type_label', s.type_doc -> 'label_singular',
      'type_label_plural', s.type_doc -> 'label_plural',
      'type_icon', coalesce(s.type_doc -> 'icon', 'null'::jsonb),
      'type_color', coalesce(s.type_doc -> 'color', 'null'::jsonb)
    ) order by s.type_sort, s.sort_order, s.name, s.id
  ) into v_result
  from custom.scope_rows_of(p_org_id, case when p_type_id is null then null else array[p_type_id] end) s
  where v_seen is null or s.id in (select x from unnest(v_seen) x);
  if not v_member and v_result is null then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[];
    -- SCOPES-READS-TREE: scopes, scope types and a project's scope tags are read from the record
    -- store; which scopes the person sees is the store's one ladder, asked once for the set.
    v_scopes jsonb;
    v_seen uuid[];
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_user_full_context_from_the_image(p_user_id);
  end if;
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
    end if;

    -- Only what this answer names (id, name, Table, parent), read straight from the Records of the
    -- person's organizations' live scope Tables, and only in organizations whose wall she passes.
    select coalesce(jsonb_agg(jsonb_build_object('o', r.organization_id, 'id', r.id, 't', r.table_id,
                                                  'ts', coalesce(nullif(t.data ->> 'sort_order', '')::int, 0),
                                                  'n', r.data ->> 'name', 'td', t.data - 'fields',
                                                  'p', coalesce(to_jsonb(nullif(r.data ->> 'parent_id', '')), 'null'::jsonb))), '[]'::jsonb)
      into v_scopes
      from iam.organization_member om
      join custom.record t on t.organization_id = om.organization_id
                          and t.table_id = custom.table_kernel_id()
                          and t.deleted_at is null
                          and t.data ->> 'kept_for' = 'context'
      join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
     where om.user_id = v_uid
       and iam.has_org_access_for(v_uid, om.organization_id);
    -- STORE-READ-PERF-5: custom.seen_among is the "s" of custom.levels_of (the one ladder's viewer
    -- answer) without the rung this reader never read.
    v_seen := custom.seen_among(v_uid, (select array_agg((e ->> 'id')::uuid) from jsonb_array_elements(v_scopes) e));

    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    seen as (
        select (e ->> 'o')::uuid as organization_id, (e ->> 'id')::uuid as id, (e ->> 't')::uuid as table_id,
               (e ->> 'ts')::int as type_sort, e ->> 'n' as name, e -> 'td' as td, e -> 'p' as parent_scope_id
          from jsonb_array_elements(v_scopes) e
         where (e ->> 'id')::uuid in (select x from unnest(v_seen) x)
    ),
    org_scope_types as (
        select t.organization_id,
            jsonb_agg(jsonb_build_object('id',t.id,'label_singular',t.data -> 'label_singular','label_plural',t.data -> 'label_plural',
                                         'icon',coalesce(t.data -> 'icon','null'::jsonb),'color',coalesce(t.data -> 'color','null'::jsonb),
                                         'sort_order',coalesce(nullif(t.data ->> 'sort_order','')::int,0),'parent_type_id',null,
                                         'max_assignments_per_entity',coalesce(t.data -> 'max_assignments_per_entity','null'::jsonb))
                      order by coalesce(nullif(t.data ->> 'sort_order','')::int,0), t.data ->> 'label_singular', t.id) as types
        from custom.record t
        where t.organization_id in (select id from user_orgs) and t.table_id = custom.table_kernel_id()
          and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
        group by t.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.table_id,'parent_scope_id',s.parent_scope_id,
                                         'type_label',s.td -> 'label_singular','type_icon',coalesce(s.td -> 'icon','null'::jsonb),
                                         'type_color',coalesce(s.td -> 'color','null'::jsonb))
                      order by s.type_sort, s.name, s.id) as scopes
        from seen s group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',sc.td -> 'label_singular',
                                                          'type_icon',coalesce(sc.td -> 'icon','null'::jsonb),'type_color',coalesce(sc.td -> 'color','null'::jsonb))
                                       order by sc.type_sort, sc.id)
                from (select distinct sa.target_id from platform.associations_live sa
                       where sa.target_type in ('scope', 'record', 'custom_record') and sa.source_type = 'project' and sa.source_id = p.id) tag
                join seen sc on sc.id = tag.target_id), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$;

-- ─── 7. the archived scope types read only the archived Tables the context system kept ───

CREATE OR REPLACE FUNCTION custom.context_archived_types(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_uid      uuid := auth.uid();
  v_tables   uuid := custom.table_kernel_id();
  v_cand     uuid[];
  v_level    public.permission_level;
  v_mask     jsonb;
  v_shown    text[];
  v_declared text[];
  v_rows     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return '[]'::jsonb;
  end if;
  -- STORE-READ-PERF-5 (2026-09-30). ONLY THE ARCHIVED TABLES THE CONTEXT SYSTEM KEPT ARE READ.
  -- This door used to page custom.read_records_archived over EVERY archived Table of the organization
  -- (200 a page, each row rendered: its derived values, the mask, the choice labels) and keep the
  -- ones whose document said kept_for = context. test@test.com's own workspace holds 1,313 archived
  -- Tables and no archived scope type: 7-30 s to answer []. The candidates are the archived,
  -- unquarantined kernel rows whose stored kept_for is context (a superset of what the old filter
  -- kept, which read the same key from the rendered document); none, and the answer is [].
  -- The organization's wall and the Table decision are asked first, as the archive door asked them.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_archived');
  perform custom.assert_may_know_table(p_organization_id, v_tables, 'custom.context_archived_types');
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_cand
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_tables
     and r.deleted_at is not null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and r.data ->> 'kept_for' = 'context';
  if cardinality(v_cand) = 0 then
    return '[]'::jsonb;
  end if;
  -- Of the candidates, exactly what the archive door answers about them: its rows through the one
  -- ladder's own predicate for this Table at viewer (custom.visible_predicate_sql, the sentence the
  -- archive door writes into its WHERE), each document through the one read mask
  -- (custom.read_mask_for at the caller's level on the Table), custom.mask_document,
  -- custom.choice_render and custom.with_whole_value_pointers, in that order, as the door renders it.
  v_level := custom.effective_level(v_uid, p_organization_id, v_tables);
  v_mask := custom.read_mask_for(v_uid, p_organization_id, v_tables, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_shown
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'doc', custom.record_values_of(r), 'wv', r.data -> '_values',
             'ws', r.data -> '_sources', 'at', r.deleted_at)), '[]'::jsonb)
      from custom.record r
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.id = any (%3$L::uuid[])
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %4$s
  $q$,
    p_organization_id, v_tables, v_cand,
    custom.visible_predicate_sql(v_uid, p_organization_id, v_tables, 'viewer'::public.permission_level, 'r'))
  into v_rows;
  -- Each carries how many of its scopes were archived, which is what a restore brings back.
  return (
    select coalesce(jsonb_agg(z.x order by z.x ->> 'deleted_at' desc, z.x ->> 'id'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
                 'label_singular', d.doc -> 'label_singular', 'label_plural', d.doc -> 'label_plural',
                 'icon', d.doc -> 'icon', 'color', d.doc -> 'color',
                 'deleted_at', p -> 'at',
                 'archived_scope_count', (select count(*) from custom.record r
                                           where r.organization_id = p_organization_id
                                             and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null)) as x
          from jsonb_array_elements(v_rows) p
          cross join lateral (
            select custom.with_whole_value_pointers(
                     custom.choice_render(p_organization_id, v_tables,
                       custom.mask_document(p -> 'doc', v_shown, v_mask -> 'notices', false,
                                            v_mask -> 'all_key_ids', v_declared)),
                     p -> 'wv', p -> 'ws', v_shown, false, v_mask -> 'all_key_ids') as doc) d
         where d.doc ->> 'kept_for' = 'context') z);
end;
$function$;

update platform.client_callable_door
   set reason = 'The archived scope types of one organization: decided through custom.assert_client_may_reach in this door''s name and the archive door''s, and custom.assert_may_know_table for the Table kernel; the candidates are the archived, unquarantined Tables whose stored kept_for is context, answered exactly as custom.read_records_archived answers them (the one ladder''s predicate at viewer from custom.visible_predicate_sql, the one read mask from custom.read_mask_for, custom.mask_document, custom.choice_render), of which the ones the context system kept, each with how many of its scopes are archived. It writes nothing. (STORE-READ-PERF-5)'
 where schema_name = 'custom' and function_name = 'context_archived_types' and identity_args = 'p_organization_id uuid';
