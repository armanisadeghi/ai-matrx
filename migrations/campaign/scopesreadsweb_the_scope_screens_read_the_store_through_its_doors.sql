-- chair-step: it CREATES seven new functions in schema custom — six client doors that READ the scope system from the record store (custom.context_tree, custom.context_scopes, custom.context_items, custom.context_values, custom.context_archived_types, custom.context_system_items; SECURITY DEFINER, each declared in platform.client_callable_door before its EXECUTE grant to authenticated) and one server-only door (custom.context_class_for_checkout, EXECUTE to service_role only, a non_client_lane row). Nothing is replaced, no table, policy, index or data row is touched, and nothing a person sees changes until the web reads through them. Every door writes nothing.
-- lane: SCOPES-READS-WEB
--
-- THE SCOPE SCREENS READ THE RECORD STORE (SCOPES-CUTOVER-PLAN step 2.4, lane L10).
--
-- A scope type is a store Table (kept_for = context), a scope is a Record of it, a context item is a
-- Field of it (Arman, 2026-09-27). Since SCOPES-PRESS-EVERYONE (2026-09-29 20:07Z) every scope write in
-- every organization lands in the store first, so the store is exact and a reader may move to it for
-- everyone at once. The web's readers of context.scope_types / scopes / context_items /
-- context_item_values (features/scopes/service/scopesService.ts, the scope short link, the class
-- checkout, the knowledge hub's tags, the envelope's scope chips) move to these doors; the web keeps
-- a permanent adapter (features/scopes/service/storeScopeAdapter.ts) that turns their answers into the
-- node types every scope screen already holds.
--
-- THE DOORS DECIDE, IN THEIR OWN NAMES (pnpm check:store-doors-decide): an organization named is decided
-- through custom.assert_client_may_reach; a Record through custom.query_visible_ids or
-- custom.read_records_by_ids (the one ladder, the one read mask); a Field through custom.applicable_fields
-- and iam.may_touch_field. Ids named without an organization open where the object lives (never the
-- caller's working organization) and an organization the caller cannot reach answers nothing for them —
-- the old RLS's answer. custom.context_tree keeps the old tables' platform-admin arm on the admin lane
-- only (public.is_platform_admin(): a platform admin on an /administration request), for the scope console.
--
-- THE TREE IS THE TWO-STEP SHAPE (plan E7): the context Tables of the named organizations first, then
-- their Records by the (organization_id, table_id) index. Measured on the dev clone (clone-20260929) as
-- admin@admin.com over her 47 live organizations (42 scope types, 2,366 scopes): ~0.85 s server time as
-- the store owner, ~1.7 s as the signed-in person — the store's own ladder (custom.visible_set per Table,
-- custom.query_visible_ids) and the per-Field decision are the cost; the old RLS read was ~20 ms. Handed to
-- the store read-performance owner in PROGRESS-SCOPES-READS-WEB.md; the answer is exact either way.
--
-- Guard: matrx-frontend features/scopes/service/__tests__/scope-reads-come-from-the-store.test.ts (+ the four
-- service suites it rewired), pnpm check:old-system-unreachable (relation "context.* scope tables"),
-- pnpm check:store-doors-decide.
-- Inverse: migrations/inverse/scopesreadsweb_the_scope_screens_read_the_store_through_its_doors_down.sql

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. custom.context_tree(p_organization_ids uuid[]) — THE SCOPE TREE, FROM THE STORE, IN ONE CALL.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_tree(p_organization_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
        or t0.id in (select v.v from (select distinct t0.org from t0 where not (t0.org = any (v_admin))) o
                       cross join lateral custom.query_visible_ids(o.org, v_tables) v(v))
  ),
  -- The scope's own columns (name, description, slug, sort order) and each settings key are Fields
  -- the scope door derived on its Table (version-5 ids from custom._ctx_id). Each one is answered only
  -- where the one field decision (iam.may_touch_field, the step custom.read_mask_for takes for every
  -- Field) lets the caller read it: asked at viewer, the least a person who sees the Record holds,
  -- and — only where viewer may not — again at the caller's own level on the Table.
  colf as materialized (
    select t.org, t.id as tbl, f.id as fid, f.data ->> 'key' as key,
           f.id = custom._ctx_id('scope-column-field', t.id::text, 'description') as is_desc,
           substring(f.metadata -> 'moved_from' ->> 'note' from '^the ''(.+)'' key of this type''s scopes'' settings') as setting
      from t
      join custom.record f
        on f.organization_id = t.org and f.table_id = v_fields and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = t.id::text
       and substr(f.id::text, 15, 1) = '5'
  ),
  shown as materialized (
    select colf.*
      from colf
     where case when colf.org = any (v_admin) then true
                when iam.may_touch_field(v_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           -- The description column answers to scope_description on a Table with an item of that key.
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, s.setting) from shown s
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
                'settings', coalesce((select jsonb_object_agg(s.value #>> '{}', r.data -> s.key)
                                        from jsonb_each(c.setting_keys) s
                                       where r.data ? s.key
                                         and jsonb_typeof(r.data -> s.key) <> 'null'), '{}'::jsonb),
                'created_by', r.created_by, 'created_at', r.created_at, 'updated_at', r.updated_at)
              order by coalesce((r.data ->> 'sort_order')::numeric, 0), r.data ->> 'name', r.id)
                from vis
                join custom.record r
                  on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
                 and r.deleted_at is null
                join cols c on c.org = vis.org and c.id = vis.tbl), '[]'::jsonb)
    into v_types, v_scopes;

  return jsonb_build_object('types', v_types, 'scopes', v_scopes);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. custom.context_scopes(p_scope_ids uuid[]) — SCOPES BY ID, IN WHATEVER ORGANIZATION EACH OPENS.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_scopes(p_scope_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
  if cardinality(v_ids) > 1000 then
    raise exception 'custom.context_scopes answers at most 1000 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 1000 or fewer.';
  end if;

  -- WHERE EACH ID OPENS IS READ FROM THE OBJECT ITSELF (a scope is a Record of a context Table), never
  -- from the caller's working organization. Each organization is decided in this door's name: one the
  -- caller cannot reach answers nothing for its ids (the old RLS's answer), and every document comes
  -- through custom.read_records_by_ids — the one ladder and the one read mask.
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
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_scopes');
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.ids, false) x
      )
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'name', d.document -> 'name',
               'description', d.document -> coalesce((select f.data ->> 'key' from custom.record f
                                  where f.organization_id = v_grp.org
                                    and f.id = custom._ctx_id('scope-column-field', v_grp.tbl::text, 'description')), 'description'),
               'slug', d.document -> 'slug', 'sort_order', d.document -> 'sort_order',
               'parent_scope_id', d.document -> 'parent_id',
               'settings', coalesce((select jsonb_object_agg(
                                          substring(f.metadata -> 'moved_from' ->> 'note' from '^the ''(.+)'' key of this type''s scopes'' settings'),
                                          d.document -> (f.data ->> 'key'))
                                       from custom.record f
                                      where f.organization_id = v_grp.org and f.table_id = v_fields and f.deleted_at is null
                                        and f.data ->> 'entity_definition_id' = v_grp.tbl::text
                                        and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'
                                        and d.document ? (f.data ->> 'key')
                                        and jsonb_typeof(d.document -> (f.data ->> 'key')) <> 'null'), '{}'::jsonb),
               'created_by', h.created_by, 'created_at', h.created_at, 'updated_at', h.updated_at,
               'scope_type', jsonb_build_object(
                 'id', t.id, 'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                 'icon', t.data -> 'icon', 'color', t.data -> 'color', 'slug', t.data -> 'slug')))
        from d
        join custom.record h on h.organization_id = v_grp.org and h.id = d.id
        join custom.record t on t.organization_id = v_grp.org and t.id = v_grp.tbl), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. custom.context_items(p_scope_type_ids uuid[]) — THE CONTEXT ITEMS OF SCOPE TYPES (their Fields).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_items(p_scope_type_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. custom.context_values(p_scope_ids uuid[]) — THE CURRENT VALUE OF EVERY CONTEXT ITEM OF SCOPES.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_values(p_scope_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
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
        select x.id, x.data ->> 'name' as name
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
                                  or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text)))))
        from v), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. custom.context_archived_types(p_organization_id uuid) — THE ARCHIVED SCOPE TYPES OF ONE ORGANIZATION.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_archived_types(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_out    jsonb := '[]'::jsonb;
  v_off    int := 0;
  v_page   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return v_out;
  end if;
  -- The archived Tables come through the store's own archive door (the ladder, the mask, both
  -- lanes of the archive); of those, the ones the context system kept. Each carries how many of its
  -- scopes were archived, which is what a restore brings back.
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'document', a.document, 'archived_at', a.archived_at)), '[]'::jsonb)
      into v_page
      from custom.read_records_archived(p_organization_id, v_tables, 'org', false, 200, v_off) a;
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
               'label_singular', p -> 'document' -> 'label_singular', 'label_plural', p -> 'document' -> 'label_plural',
               'icon', p -> 'document' -> 'icon', 'color', p -> 'document' -> 'color',
               'deleted_at', p -> 'archived_at',
               'archived_scope_count', (select count(*) from custom.record r
                                         where r.organization_id = p_organization_id
                                           and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null)))
        from jsonb_array_elements(v_page) p
       where p -> 'document' ->> 'kept_for' = 'context'), '[]'::jsonb);
    exit when jsonb_array_length(v_page) < 200;
    v_off := v_off + 200;
  end loop;
  return (select coalesce(jsonb_agg(x order by x ->> 'deleted_at' desc), '[]'::jsonb) from jsonb_array_elements(v_out) x);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. custom.context_system_items() — THE PLATFORM'S SYSTEM CONTEXT ITEMS (reference data).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_system_items()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid := custom.query_principal();
begin
  -- Global public facts of the platform (SCOPES-CUTOVER-PLAN decision 3: reference data, not scope
  -- data, and it stays where it is). A signed-out caller is nobody's and is answered nothing.
  if v_me is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'key', s.key, 'display_name', s.display_name, 'description', s.description,
             'item_class', s.item_class, 'value_type', s.value_type, 'sensitivity', s.sensitivity,
             'sort_order', s.sort_order)
           order by s.sort_order, s.key)
      from context.system_context_item s
     where s.is_active and s.deleted_at is null), '[]'::jsonb);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 7. custom.context_class_for_checkout(p_scope_id uuid) — THE SERVER'S READ OF A PAID CLASS (server only).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.context_class_for_checkout(p_scope_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_rec    custom.record;
begin
  -- The class checkout runs on the server for a person who is NOT yet a member of the class's
  -- organization (that is what paying makes her), so it reads the class as the server, exactly
  -- as it did with its service connection. Only the facts the checkout needs: which class, whose
  -- it is, whether it is live, and its settings (access mode, price).
  select r.* into v_rec
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
     and t.table_id = v_tables and t.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id
   limit 1;
  if v_rec.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_rec.id, 'name', v_rec.data -> 'name', 'created_by', v_rec.created_by,
    'organization_id', v_rec.organization_id, 'scope_type_id', v_rec.table_id, 'deleted_at', v_rec.deleted_at,
    'settings', coalesce((select jsonb_object_agg(
                               substring(f.metadata -> 'moved_from' ->> 'note' from '^the ''(.+)'' key of this type''s scopes'' settings'),
                               v_rec.data -> (f.data ->> 'key'))
                            from custom.record f
                           where f.organization_id = v_rec.organization_id and f.table_id = v_fields and f.deleted_at is null
                             and f.data ->> 'entity_definition_id' = v_rec.table_id::text
                             and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'
                             and v_rec.data ? (f.data ->> 'key')
                             and jsonb_typeof(v_rec.data -> (f.data ->> 'key')) <> 'null'), '{}'::jsonb));
end;
$function$;

-- The door rows FIRST, then the grants (the order the ddl guard requires: it fires on the grant).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'context_tree', 'p_organization_ids uuid[]', array['uuid[]'::regtype::oid],
   'The scope tree read from the record store. Every organization named is decided first through custom.assert_client_may_reach (refused by name, 42501, never an empty tree), except on the admin lane, where public.is_platform_admin() (a platform admin on an /administration request) reads a non-member organization whole, as the old tables'' platform_admin_select policies let it; then the live Tables the context system keeps (kept_for = context) that the caller sees through custom.query_visible_ids on the Table kernel, and their live Records the caller sees through custom.query_visible_ids on each Table, each column and settings key answered only where iam.may_touch_field (the field step of custom.read_mask_for) lets the caller read it. It writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_scopes', 'p_scope_ids uuid[]', array['uuid[]'::regtype::oid],
   'Scopes by id, each in the organization its Record lives in (read from the object, never the caller''s working organization). An organization the caller cannot reach (iam.has_org_access / custom.portal_admits, then custom.assert_client_may_reach in this door''s name) answers nothing for its ids; a scope type the caller does not see answers nothing; every document comes through custom.read_records_by_ids, the one ladder and the one read mask. It writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_items', 'p_scope_type_ids uuid[]', array['uuid[]'::regtype::oid],
   'The context items (Fields) of scope types by id, each type in the organization its Table lives in. An organization the caller cannot reach answers nothing (decided through custom.assert_client_may_reach in this door''s name); a Table the caller does not see answers nothing; the Fields come through custom.applicable_fields, the store''s own Field door. Fields the scope door derived (version-5 ids) are not items. It writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_values', 'p_scope_ids uuid[]', array['uuid[]'::regtype::oid],
   'The current value of each context item of scopes by id, each scope in the organization its Record lives in, decided through custom.assert_client_may_reach in this door''s name; the documents come through custom.read_records_by_ids (the one ladder and the one read mask), so a value the caller may not see is absent. Beside each value its own stamps from the Record (version, when, source, the old value id) and the names of referenced scopes the caller sees (custom.levels_of). It writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_archived_types', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'The archived scope types of one organization: decided through custom.assert_client_may_reach in this door''s name; the archived Tables come through custom.read_records_archived (the ladder, the mask), of which the ones the context system kept, each with how many of its scopes are archived. It writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_system_items', '', array[]::oid[],
   'The platform''s active System context items (context.system_context_item, reference data that stays where it is): global public facts every signed-in person may read, with no owner and no organization. A caller with no principal gets nothing. It takes no id and writes nothing.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql', null, true, false),
  ('custom', 'context_class_for_checkout', 'p_scope_id uuid', array['uuid'::regtype::oid],
   'The class checkout reads one class scope (its owner, organization, liveness and settings) as the server, for a person who is not yet a member of its organization.',
   'scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql',
   'server_only: called only by the class checkout route (matrx-frontend app/api/stripe/class-checkout/route.ts) with the service connection, after it has verified the signed-in person; no browser holds EXECUTE.',
   false, false)
on conflict do nothing;

grant execute on function custom.context_tree(uuid[]) to authenticated;
grant execute on function custom.context_scopes(uuid[]) to authenticated;
grant execute on function custom.context_items(uuid[]) to authenticated;
grant execute on function custom.context_values(uuid[]) to authenticated;
grant execute on function custom.context_archived_types(uuid) to authenticated;
grant execute on function custom.context_system_items() to authenticated;
grant execute on function custom.context_class_for_checkout(uuid) to service_role;
