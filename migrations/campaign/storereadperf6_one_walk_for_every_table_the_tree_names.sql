-- chair-step: it REPLACES the bodies of custom.context_tree, custom.query_visible_ids and custom.read_door_carried_ids (same signatures, grants, owners and door rows; no new function, table, index, policy, permission or data row). custom.context_tree names, in the statement memo, its organizations with their scope Tables and then the (organization, scope Table) pairs it reads, and drops both names when the tree is built; custom.query_visible_ids answers the Table list's "among" walk once for all named organizations and every named ordinary Table pair in one pass at viewer; custom.read_door_carried_ids walks containment once for all named pairs at viewer. Only in a transaction that has written nothing; every other call is answered by the bodies' old code, unchanged. Nothing a person sees changes: every answer is the same (scripts/campaign-tests/storereadperf6_green.sql, both seats), only faster.
-- lane: STORE-READ-PERF-6
-- based-on: custom.context_tree(uuid[]) b179d95cae8fe72ac5a287978ad7832da4266755e848f21a6a5733f01d12f285
-- based-on: custom.query_visible_ids(uuid, uuid, text) 4d2014f6091d71202400636a56042cf3aa0d8595b2d48e9c4e319a7595d5730d
-- based-on: custom.read_door_carried_ids(uuid, uuid, uuid, permission_level) 952ba889a3590a391e3c807a87788e10022b2c539fac93205e17aec990a84d6c
--
-- STORE-READ-PERF-6 — ONE WALK FOR EVERY TABLE THE TREE NAMES.
--
-- THE PROBLEM (dev clone clone-20260929, function-level profile, warm): custom.context_tree asked
-- custom.query_visible_ids once per scope Table (admin@admin.com: 53 organizations, 49 scope Tables), and
-- each call paid the "shown to" context, custom.visible_set and custom.read_door_carried_ids' containment
-- walk (the organization's edges, UP, the ladder per ancestor, DOWN) for that one Table; the Table list was
-- walked once per organization (custom.tables_seen_among, four calls for test@test.com).
--
-- THE FIX (statement memos, platform.memo_k_*, keyed by person, snapshot and level, read only while the
-- transaction has written nothing, exactly like STORE-READ-PERF-3/4/5):
--   1. custom.context_tree works out its Table set first (the same rows) with every organization and its
--      scope Tables named ('custom.kernel_among_batch:<person>'), then names the (organization, Table)
--      pairs of organizations outside the admin lane ('custom.qvi_pairs:<person>') for the records step.
--   2. custom.query_visible_ids: the among walk once for all named organizations (used only when the
--      batch names this organization with every Table the call asks about; filtered to this
--      organization); and for a named ordinary pair at viewer, its own four branches for every named
--      pair in ONE query (custom.visible_set per pair; pairs at a stop walk in their own call).
--   3. custom.read_door_carried_ids: one containment walk for every named pair at viewer, edges and both
--      recursions tagged by organization, ancestors / count / ceiling per pair, the ladder once per
--      (organization, container), DOWN once per organization, filtered per pair to its Table.
-- Plan-attacked before build (independent reviewer, 2026-10-01): level in every key, organization tags in
-- every recursion step, organization filter on the batched among answer, subset check, no null-Table
-- context, read-only check at every read, admin-lane organizations not named.

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
  -- STORE-READ-PERF-6
  v_among  jsonb;
  v_tids   uuid[];
  v_pairs  text;
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
  -- STORE-READ-PERF-6 (2026-10-01): STEP 1 FIRST, ON ITS OWN, SO THE READS BELOW CAN BE ASKED FOR ALL
  -- ORGANIZATIONS AT ONCE. The same Tables as before: the admin lane's whole, and of the others the ones
  -- custom.tables_listed_among keeps — with every organization and its scope Tables named in the
  -- statement memo first, so the one ladder's Table walk is asked once for all of them
  -- (custom.query_visible_ids' among path), not once per organization. Then the (organization, Table)
  -- pairs the records step reads are named the same way, so custom.query_visible_ids and
  -- custom.read_door_carried_ids answer them all in one pass. Both names are dropped when the tree is built.
  select coalesce(jsonb_object_agg(o.org, o.ids), '{}'::jsonb) into v_among
    from (select t.organization_id as org, jsonb_agg(t.id order by t.id) as ids
            from custom.record t
           where t.organization_id = any (v_orgs)
             and not (t.organization_id = any (v_admin))
             and t.table_id = v_tables
             and t.deleted_at is null
             and t.data ->> 'kept_for' = 'context'
           group by t.organization_id) o;
  perform platform.memo_k_put('custom.kernel_among_batch:' || v_me::text, v_among::text);
  with t0 as materialized (
    select t.organization_id as org, t.id
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  )
  select coalesce(array_agg(t0.id), '{}'::uuid[]),
         string_agg(case when not (t0.org = any (v_admin)) then t0.org::text || ':' || t0.id::text end, ',' order by t0.org, t0.id)
    into v_tids, v_pairs
    from t0
   where t0.org = any (v_admin)
      -- STORE-READ-PERF-5: the Table list asked among these scope Tables only
      -- (custom.tables_listed_among: query_visible_ids' own answer, restricted to them).
      or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                      where not (t0.org = any (v_admin)) group by t0.org) o
                     cross join lateral custom.tables_listed_among(o.org, o.ids) v(v));
  perform platform.memo_k_drop('custom.kernel_among_batch:' || v_me::text);
  if v_pairs is not null then
    perform platform.memo_k_put('custom.qvi_pairs:' || v_me::text, v_pairs);
  end if;

  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  ),
  t as materialized (
    select t0.* from t0 where t0.id = any (v_tids)
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
  perform platform.memo_k_drop('custom.qvi_pairs:' || v_me::text);

  return jsonb_build_object('types', v_types, 'scopes', v_scopes);
end;
$function$;

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
  -- STORE-READ-PERF-6
  v_seen  uuid[];
  v_b     jsonb;
  v_list  text;
  v_pk    text;
  v_pairs text[];
  v_x     text;
  v_t     uuid;
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
      -- STORE-READ-PERF-6 (2026-10-01): THE AMONG WALK ONCE FOR EVERY ORGANIZATION OF THE STATEMENT. A
      -- door that asks this list for several organizations (custom.context_tree) may name them with
      -- their Tables in the statement memo ('custom.kernel_among_batch:<person>': {organization: [Table
      -- ids]}). Then, in a transaction that has written nothing, custom.tables_seen_among is asked once
      -- for all those organizations and all those Tables (a Table's answer never depends on which Tables
      -- or organizations are walked beside it — it is the one ladder's viewer answer about that Table),
      -- and kept in the statement memo; the filter below reads only this organization's Tables of it.
      -- Otherwise it is asked for this organization and these Tables, as before.
      v_seen := null;
      if pg_catalog.pg_current_xact_id_if_assigned() is null then
        v_b := nullif(platform.memo_k_get('custom.kernel_among_batch:' || v_user::text), '')::jsonb;
        -- only when the batch names this organization with every Table this call asks about
        if v_b ? p_organization_id::text
           and not exists (select 1 from unnest(v_among) a
                            where not (v_b -> p_organization_id::text) ? a::text) then
          v_pk := 'custom.kernel_among_seen:' || v_user::text || ':' || md5(v_b::text) || ':'
               || pg_catalog.pg_current_snapshot()::text;
          v_m := platform.memo_k_get(v_pk);
          if v_m is null then
            select coalesce(string_agg(g.organization_id::text || ':' || g.id::text, ','), '') into v_m
              from custom.tables_seen_among(
                     v_user,
                     array(select k::uuid from jsonb_object_keys(v_b) k order by 1),
                     array(select distinct e::uuid from jsonb_each(v_b) t, jsonb_array_elements_text(t.value) e order by 1)) g
             where g.seen;
            perform platform.memo_k_put(v_pk, v_m);
          end if;
          -- this organization's seen Tables only (a record id is unique only within its organization)
          v_seen := array(select split_part(x, ':', 2)::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x
                           where split_part(x, ':', 1) = p_organization_id::text);
        end if;
      end if;
      if v_seen is null then
        select coalesce(array_agg(g.id), '{}'::uuid[]) into v_seen
          from custom.tables_seen_among(v_user, array[p_organization_id], v_among) g
         where g.seen and g.organization_id = p_organization_id;
      end if;
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
              or r.id = any (v_seen) );
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

  -- STORE-READ-PERF-6 (2026-10-01): EVERY NAMED (ORGANIZATION, TABLE) OF THE STATEMENT AT ONCE. A door
  -- that reads many ordinary Tables in one statement (custom.context_tree: its scope Tables) names the
  -- pairs in the statement memo ('custom.qvi_pairs:<person>'). The first call here about a named pair,
  -- at viewer, in a transaction that has written nothing, works out THIS function's own answer for
  -- every named pair in one pass — the loop below (a Table with no live record of the organization
  -- answers nothing; custom.visible_set per pair; its four branches), with ONE query over all pairs —
  -- and leaves each pair's ids in the statement memo; the rest read theirs. A pair at one of
  -- visible_set's stops is left out and walks below in its own call, as always. The "shown to"
  -- context is one for all the named organizations: the whole platform.shown_to_context('record')
  -- when a live row of a named pair says my_team, else custom._record_shown_to_ctx for those
  -- organizations (which is the whole context when one of their defaults is my_team, else each
  -- organization's default without the teammates) — any of these answers platform.shown_to_lists
  -- exactly as the per-Table context does, because a row reads only its own organization's default
  -- and reads the teammates only when its list resolves to my_team. Each call still meets the wall
  -- above, for its own organization, before its answer is read.
  if p_table_id is not null and p_table_id <> custom.table_kernel_id() and p_required = 'viewer'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_list := platform.memo_k_get('custom.qvi_pairs:' || v_user::text);
    if v_list is not null
       and strpos(',' || v_list || ',', ',' || p_organization_id::text || ':' || p_table_id::text || ',') > 0 then
      v_pk := 'custom.qvi_pair:' || v_user::text || ':' || md5(v_list) || ':' || pg_catalog.pg_current_snapshot()::text || ':';
      v_m := platform.memo_k_get(v_pk || p_organization_id::text || ':' || p_table_id::text);
      if v_m is null and platform.memo_k_get(v_pk || 'asked') is null then
        perform platform.memo_k_put(v_pk || 'asked', '1');
        v_pairs := array(select distinct x from unnest(string_to_array(v_list, ',')) x where x <> '' order by 1);
        v_orgs := array(select distinct split_part(x, ':', 1)::uuid from unnest(v_pairs) x order by 1);
        if exists (select 1
                     from unnest(v_pairs) x
                     join custom.record r
                       on r.organization_id = split_part(x, ':', 1)::uuid
                      and r.table_id = split_part(x, ':', 2)::uuid
                      and r.deleted_at is null
                      and r.shown_to = 'my_team'::platform.shown_to) then
          v_ctx := platform.shown_to_context('record');
        else
          v_ctx := custom._record_shown_to_ctx(v_orgs, split_part(v_pairs[1], ':', 2)::uuid);
        end if;
        foreach v_x in array v_pairs loop
          v_o := split_part(v_x, ':', 1)::uuid;
          v_t := split_part(v_x, ':', 2)::uuid;
          if not exists (select 1 from custom.record r
                          where r.organization_id = v_o and r.deleted_at is null and r.table_id = v_t) then
            perform platform.memo_k_put(v_pk || v_x, '');
            continue;
          end if;
          v_set := custom.visible_set(v_user, v_o, v_t, 'viewer'::public.permission_level);
          continue when v_set.o_fallback;
          v_sets := v_sets || jsonb_build_object('org', v_o, 'tbl', v_t, 'all', v_set.o_all_visible,
                      'tv', coalesce(to_jsonb(v_set.o_true_visibility), '[]'::jsonb),
                      'ga', coalesce(to_jsonb(v_set.o_granted_all), '[]'::jsonb),
                      'gv', coalesce(to_jsonb(v_set.o_granted_visible), '[]'::jsonb),
                      'cv', coalesce(to_jsonb(v_set.o_carried_visible), '[]'::jsonb));
        end loop;
        for v_one in
          with sets as materialized (
            select (e ->> 'org')::uuid as org, (e ->> 'tbl')::uuid as tbl, (e ->> 'all')::boolean as all_v,
                   array(select jsonb_array_elements_text(e -> 'tv'))::platform.visibility[] as tv,
                   array(select jsonb_array_elements_text(e -> 'ga'))::uuid[] as ga,
                   array(select jsonb_array_elements_text(e -> 'gv'))::uuid[] as gv,
                   array(select jsonb_array_elements_text(e -> 'cv'))::uuid[] as cv
              from jsonb_array_elements(v_sets) e
          )
          select s.org, s.tbl,
                 coalesce((select string_agg(r.id::text, ',')
                             from custom.record r
                            where r.organization_id = s.org
                              and r.table_id = s.tbl
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
          perform platform.memo_k_put(v_pk || v_one.org::text || ':' || v_one.tbl::text, v_one.ids);
        end loop;
        v_m := platform.memo_k_get(v_pk || p_organization_id::text || ':' || p_table_id::text);
      end if;
      if v_m is not null then
        return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
        return;
      end if;
      v_m := null;
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

CREATE OR REPLACE FUNCTION custom.read_door_carried_ids(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level, OUT o_ids uuid[], OUT o_containers integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-6 (2026-10-01): ONE WALK FOR EVERY TABLE THE STATEMENT NAMED. A door that reads many
-- (organization, Table) pairs in one statement (custom.context_tree: one per scope Table) names them in
-- the statement memo ('custom.qvi_pairs:<person>'). The first ask here about a named pair, in a
-- transaction that has written nothing, walks containment ONCE for all of them — the same walk as
-- below, each UP row tagged with the pair it started from — and leaves each pair's answer in the
-- statement memo (keyed by the snapshot and the level); the rest read theirs. Per pair it is the
-- answer below: its ancestors (max level along a path >= the level asked), their count, the ceiling
-- stop (NULL ids over it), the one ladder (custom.reaches_directly) about every ancestor of a pair
-- under the ceiling — asked once per (organization, container) — and DOWN from the admitted ones of
-- that organization, keeping the live records of that pair's Table reached at >= the level asked.
-- Why the shared DOWN, filtered by Table, is the per-Table answer: a record of Table X reached DOWN
-- from an admitted container C at min level >= L along a simple path of at most 16 edges is, read
-- backwards, an UP path from that record to C at the same min level, the same bound and simple — so
-- C is an ancestor of X at >= L, and (X under the ceiling) admitted for X; and every container
-- admitted for X is admitted here. Anything else — no list, an unnamed pair, a writing transaction,
-- no Table — walks below exactly as before.
declare
  v_list text;
  v_key  text;
  v_hit  text;
  v_ids  text;
  v_one  record;
begin
  o_ids := '{}'::uuid[];
  o_containers := 0;

  if p_user is not null and p_organization_id is not null and p_table_id is not null
     and p_required = 'viewer'::public.permission_level
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_list := platform.memo_k_get('custom.qvi_pairs:' || p_user::text);
    if v_list is not null
       and strpos(',' || v_list || ',', ',' || p_organization_id::text || ':' || p_table_id::text || ',') > 0 then
      v_key := 'custom.carried_pair:' || p_user::text || ':' || p_required::text || ':'
            || pg_catalog.pg_current_snapshot()::text || ':';
      v_hit := platform.memo_k_get(v_key || p_organization_id::text || ':' || p_table_id::text);
      if v_hit is null then
        for v_one in
          with recursive pairs as materialized (
            select distinct split_part(x, ':', 1)::uuid as org, split_part(x, ':', 2)::uuid as tbl
              from unnest(string_to_array(v_list, ',')) x
             where x <> ''
          ),
          edges as materialized (
            select o.org, e.*
              from (select distinct p.org from pairs p) o
              cross join lateral custom.carrying_edges_in(o.org) e
          ),
          up as (
            select p.org, p.tbl, e.container_type, e.container_id, 1 as depth, e.conveys_max as max_level,
                   array['record:' || e.item_id::text,
                         e.container_type || ':' || e.container_id::text] as path
              from pairs p
              join edges e
                on e.org = p.org
               and e.item_type = 'record'
              join custom.record r
                on r.organization_id = p.org
               and r.id = e.item_id
               and r.deleted_at is null
               and r.table_id is not distinct from p.tbl
            union all
            select u.org, u.tbl, e.container_type, e.container_id, u.depth + 1,
                   least(u.max_level, e.conveys_max),
                   u.path || (e.container_type || ':' || e.container_id::text)
              from up u
              join edges e
                on e.org = u.org
               and e.item_type = u.container_type
               and e.item_id   = u.container_id
             where u.depth < 16
               and not (e.container_type || ':' || e.container_id::text) = any (u.path)
          ),
          anc as materialized (
            select u.org, u.tbl, u.container_type, u.container_id
              from up u
             group by u.org, u.tbl, u.container_type, u.container_id
            having max(u.max_level) >= p_required
          ),
          cnt as materialized (
            select p.org, p.tbl,
                   (select count(*) from anc a where a.org = p.org and a.tbl = p.tbl)::integer as n
              from pairs p
          ),
          ok as materialized (
            select c.org, c.container_type, c.container_id
              from (select distinct a.org, a.container_type, a.container_id
                      from anc a
                      join cnt n on n.org = a.org and n.tbl = a.tbl
                     where n.n <= custom.read_door_ladder_ceiling()) c
             where custom.reaches_directly(p_user, c.container_type, c.container_id, p_required)
          ),
          down as (
            select o.org, e.item_type, e.item_id, e.conveys_max as min_level, 1 as depth,
                   array[e.container_type || ':' || e.container_id::text,
                         e.item_type || ':' || e.item_id::text] as path
              from ok o
              join edges e
                on e.org = o.org
               and e.container_type = o.container_type
               and e.container_id   = o.container_id
            union all
            select d.org, e.item_type, e.item_id, least(d.min_level, e.conveys_max), d.depth + 1,
                   d.path || (e.item_type || ':' || e.item_id::text)
              from down d
              join edges e
                on e.org = d.org
               and e.container_type = d.item_type
               and e.container_id   = d.item_id
             where d.depth < 16
               and not (e.item_type || ':' || e.item_id::text) = any (d.path)
          ),
          reached as materialized (
            select d.org, d.item_id
              from down d
             where d.item_type = 'record'
               and d.min_level >= p_required
          )
          select c.org, c.tbl, c.n,
                 case when c.n > custom.read_door_ladder_ceiling() then null
                      else coalesce((select array_agg(distinct x.item_id)
                                       from reached x
                                       join custom.record r
                                         on r.organization_id = c.org
                                        and r.id = x.item_id
                                        and r.deleted_at is null
                                        and r.table_id is not distinct from c.tbl
                                      where x.org = c.org), '{}'::uuid[]) end as ids
            from cnt c
        loop
          perform platform.memo_k_put(v_key || v_one.org::text || ':' || v_one.tbl::text,
                    v_one.n::text || '|' || coalesce(array_to_string(v_one.ids, ','), '~'));
        end loop;
        v_hit := platform.memo_k_get(v_key || p_organization_id::text || ':' || p_table_id::text);
      end if;
      if v_hit is not null then
        o_containers := split_part(v_hit, '|', 1)::integer;
        v_ids := substr(v_hit, strpos(v_hit, '|') + 1);
        o_ids := case when v_ids = '~' then null
                      when v_ids = '' then '{}'::uuid[]
                      else string_to_array(v_ids, ',')::uuid[] end;
        return;
      end if;
    end if;
  end if;

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
       -- SHARED-ONLY: `custom.reaches_directly`, NOT the whole ladder. Everything under an
       -- admitted container is handed to the caller below, and a Table can be a container
       -- here (a Table homed in a Record, the `home` rule) - so admitting it on arm 4, which
       -- only says the person may KNOW that Table, would hand them its whole contents.
       and custom.reaches_directly(p_user, a.container_type, a.container_id, p_required)
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
