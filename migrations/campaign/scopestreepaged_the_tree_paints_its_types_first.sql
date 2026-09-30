-- draft: Claude Opus 5.5 (lane SCOPES-TREE-PAGED) rehearsed on the dev clone only; three new client doors (a grant each) wait for the chair's go before production
-- chair-step: it CREATES four new functions in schema custom — one SECURITY INVOKER helper with no client EXECUTE (custom._ctx_tree_part, the scope tree's one body for its three paged shapes) and three client doors that READ the scope tree in pieces (custom.context_tree_types: the organizations' scope types with the count of scopes the caller sees in each; custom.context_tree_type_scopes: one type's scopes, a page at a time; custom.context_tree_search: the scopes whose name holds a text, across the organizations named; SECURITY DEFINER, each declared in platform.client_callable_door before its EXECUTE grant to authenticated). Nothing is replaced — custom.context_tree keeps answering the whole tree exactly as today for the readers that still need it — and no table, index, policy or data row is touched. Every door writes nothing.
-- lane: SCOPES-TREE-PAGED
--
-- THE SCOPE TREE PAINTS ITS TYPES FIRST (lane SCOPES-TREE-PAGED, 2026-09-30).
--
-- custom.context_tree answers every scope of every organization in one 1.1 MB answer (admin@admin.com:
-- 47 organizations, 49 scope types, 2,486 scopes; 446 ms server side on the clone). Most screens show
-- far less at first paint: the scopes page lists types with a count, the chat lens lists organizations
-- and types and opens a type's scopes when the person expands it, the pickers search. These doors let
-- the web ask for exactly that:
--
--   custom.context_tree_types(orgs)                 the scope types of the organizations named, each
--                                                   with scope_count = the scopes the caller sees in it
--   custom.context_tree_type_scopes(type, off, lim) one type's scopes, `lim` at a time from `off`
--                                                   (default 200, at most 1000), with the total
--   custom.context_tree_search(orgs, text, lim)     the scopes whose (readable) name holds `text`,
--                                                   across every type of the organizations named
--
-- SAME ROWS AS TODAY, BY CONSTRUCTION. The three doors decide the caller exactly as custom.context_tree
-- does (every organization named through custom.assert_client_may_reach in the door's own name, refused
-- by name, never an empty answer; the admin lane's non-member organization read whole), and answer
-- through ONE body, custom._ctx_tree_part, which is custom.context_tree's own body (STORE-READ-PERF-5,
-- verbatim: the Table list among the scope Tables, the one field decision per column, the Records the
-- caller sees through custom.query_visible_ids) restricted to the types asked. A type's object and a
-- scope's object are byte-for-byte the objects custom.context_tree answers; a type's scope_count is the
-- number of scopes custom.context_tree answers for it; the pages of a type, concatenated, are its scopes
-- in custom.context_tree's order. Proof: scripts/campaign-tests/scopestreepaged_same_rows_as_the_tree.sql
-- (both seats, every organization, every type, every page; a planted difference goes red).
--
-- Search matches the scope's name as the caller may read it (a name column the field decision hides is
-- never searched), case-insensitively, as the chat lens's own filter did over the whole tree.

-- ─── 1. the one body ────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION custom._ctx_tree_part(
  p_me uuid, p_orgs uuid[], p_admin uuid[], p_mode text,
  p_type_ids uuid[] DEFAULT NULL, p_query text DEFAULT NULL,
  p_offset integer DEFAULT 0, p_limit integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_types  jsonb := '[]'::jsonb;
  v_scopes jsonb := '[]'::jsonb;
  v_total  integer := 0;
  v_pat    text;
begin
  -- Called only by the three definer doors below, after they decided the caller; it has no client
  -- EXECUTE. p_me is the caller they resolved, p_orgs the organizations they decided, p_admin those of
  -- them read whole on the admin lane.
  if p_mode is null or p_mode not in ('types', 'scopes', 'search') then
    raise exception 'custom._ctx_tree_part: mode % is not types, scopes or search', p_mode using errcode = '22023';
  end if;
  if p_me is null or cardinality(coalesce(p_orgs, '{}'::uuid[])) = 0 then
    return case p_mode when 'types' then jsonb_build_object('types', v_types)
                       else jsonb_build_object('scopes', v_scopes, 'total', 0) end;
  end if;
  if p_mode = 'search' then
    v_pat := '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- ── the scope types (custom.context_tree's t0 / t, restricted to the types asked) ──
  if p_mode = 'types' then
    with t0 as materialized (
      select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
        from custom.record t
       where t.organization_id = any (p_orgs)
         and t.table_id = v_tables
         and t.deleted_at is null
         and t.data ->> 'kept_for' = 'context'
         and (p_type_ids is null or t.id = any (p_type_ids))
    ),
    t as materialized (
      select t0.* from t0
       where t0.org = any (p_admin)
          or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                          where not (t0.org = any (p_admin)) group by t0.org) o
                         cross join lateral custom.tables_listed_among(o.org, o.ids) v(v))
    ),
    vis as materialized (
      select t.org, t.id as tbl, v.v as id
        from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
       where not (t.org = any (p_admin))
      union all
      select t.org, t.id, r.id
        from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
       where t.org = any (p_admin)
    ),
    -- custom.context_tree answers a scope where a visible id is a live Record of its Table: the same join.
    cnt as materialized (
      select vis.tbl, count(*)::integer as n
        from vis
        join custom.record r
          on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id and r.deleted_at is null
       group by vis.tbl
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'organization_id', t.org,
             'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
             'name', t.data -> 'name', 'icon', t.data -> 'icon', 'color', t.data -> 'color',
             'slug', t.data -> 'slug', 'description', t.data -> 'description',
             'sort_order', t.data -> 'sort_order',
             'max_assignments_per_entity', t.data -> 'max_assignments_per_entity',
             'default_variable_keys', t.data -> 'default_variable_keys',
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at,
             'scope_count', coalesce(cnt.n, 0))
           order by coalesce((t.data ->> 'sort_order')::numeric, 0), t.data ->> 'label_plural', t.id), '[]'::jsonb)
      into v_types
      from t left join cnt on cnt.tbl = t.id;
    return jsonb_build_object('types', v_types);
  end if;

  -- ── the scopes (custom.context_tree's body from t0 to the scope objects, verbatim, restricted) ──
  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (p_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
       and (p_type_ids is null or t.id = any (p_type_ids))
  ),
  t as materialized (
    select t0.* from t0
     where t0.org = any (p_admin)
        or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                        where not (t0.org = any (p_admin)) group by t0.org) o
                       cross join lateral custom.tables_listed_among(o.org, o.ids) v(v))
  ),
  flds as materialized (
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
           (exists (select 1 from iam.permissions p where p.resource_type = 'record' and p.resource_id = f.id)
            or coalesce(f.data ->> 'type', '') = 'formula'
            or exists (select 1 from custom.portal_principal pp
                        where pp.user_id = p_me and pp.organization_id = t.org)) as alone
      from t
      join flds f
        on f.organization_id = t.org
       and f.data ->> 'entity_definition_id' = t.id::text
  ),
  fgroup as materialized (
    select g.org, g.sens,
           iam.may_touch_field(p_me, g.rep, g.org, 'viewer'::public.permission_level, 'read') as viewer_reads
      from (select c.org, c.sens, min(c.fid::text)::uuid as rep
              from colf c
             where not c.alone and not (c.org = any (p_admin))
             group by c.org, c.sens) g
  ),
  shown as materialized (
    select colf.*
      from colf
      left join fgroup g on g.org = colf.org and g.sens is not distinct from colf.sens and not colf.alone
     where case when colf.org = any (p_admin) then true
                when g.viewer_reads then true
                when not colf.alone and g.viewer_reads is not null then
                  iam.may_touch_field(p_me, colf.fid, colf.org, custom.effective_level(p_me, colf.org, colf.tbl), 'read')
                when iam.may_touch_field(p_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(p_me, colf.fid, colf.org, custom.effective_level(p_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, jsonb_build_object('setting', s.setting, 'behavior', s.behavior)) from shown s
                      where s.org = t.org and s.tbl = t.id and s.setting is not null), '{}'::jsonb) as setting_keys
      from t
  ),
  vis as materialized (
    select t.org, t.id as tbl, v.v as id
      from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
     where not (t.org = any (p_admin))
    union all
    select t.org, t.id, r.id
      from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
     where t.org = any (p_admin)
  ),
  matched as materialized (
    select r.id, r.organization_id, r.table_id, r.data, r.created_by, r.created_at, r.updated_at,
           c.visible, c.desc_key, c.setting_keys,
           -- search answers in the tree's own reading order: type by type, then the type's scopes
           coalesce((tt.data ->> 'sort_order')::numeric, 0) as t_sort, tt.data ->> 'label_plural' as t_label
      from vis
      join recs r
        on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
      join cols c on c.org = vis.org and c.id = vis.tbl
      join t tt on tt.org = vis.org and tt.id = vis.tbl
     where p_mode <> 'search'
        or (c.visible ? 'name' and (r.data ->> 'name') ilike v_pat escape '\')
  ),
  ordered as (
    select m.*,
           row_number() over (order by
             case when p_mode = 'search' then m.t_sort end,
             case when p_mode = 'search' then m.t_label end,
             case when p_mode = 'search' then m.table_id end,
             coalesce((m.data ->> 'sort_order')::numeric, 0), m.data ->> 'name', m.id) as rn,
           count(*) over () as total
      from matched m
  )
  select coalesce(max(o.total), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'scope_type_id', o.table_id, 'organization_id', o.organization_id,
             'name', case when o.visible ? 'name' then o.data -> 'name' end,
             'description', case when o.visible ? o.desc_key then o.data -> o.desc_key end,
             'slug', case when o.visible ? 'slug' then o.data -> 'slug' end,
             'sort_order', case when o.visible ? 'sort_order' then o.data -> 'sort_order' end,
             'parent_scope_id', o.data -> 'parent_id',
             'settings', coalesce((select jsonb_object_agg(s.value ->> 'setting', custom._ctx_setting_back(o.data -> s.key, s.value ->> 'behavior'))
                                     from jsonb_each(o.setting_keys) s
                                    where o.data ? s.key
                                      and jsonb_typeof(o.data -> s.key) <> 'null'), '{}'::jsonb),
             'created_by', o.created_by, 'created_at', o.created_at, 'updated_at', o.updated_at)
           order by o.rn)
           filter (where o.rn > greatest(coalesce(p_offset, 0), 0)
                     and (p_limit is null or o.rn <= greatest(coalesce(p_offset, 0), 0) + p_limit)), '[]'::jsonb)
    into v_total, v_scopes
    from ordered o;

  return jsonb_build_object('scopes', v_scopes, 'total', v_total);
end;
$function$;

REVOKE ALL ON FUNCTION custom._ctx_tree_part(uuid, uuid[], uuid[], text, uuid[], text, integer, integer) FROM PUBLIC;

-- ─── 2. the three doors ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION custom.context_tree_types(p_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_orgs  uuid[];
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME — exactly as custom.context_tree does.
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_types');
  end loop;
  return custom._ctx_tree_part(v_me, v_orgs, v_admin, 'types');
end;
$function$;

CREATE FUNCTION custom.context_tree_type_scopes(p_scope_type_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_lim   integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_part  jsonb;
  v_total integer;
begin
  -- The type's organization is read from the type itself (never the caller's working organization);
  -- a type that is not a live scope Table answers nothing, the same answer as a type she cannot see.
  select t.organization_id into v_org
    from custom.record t
   where t.id = p_scope_type_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context';
  if v_org is null then
    return jsonb_build_object('scopes', '[]'::jsonb, 'total', 0, 'offset', v_off, 'next_offset', null);
  end if;
  -- THE DOOR DECIDES, IN ITS OWN NAME, exactly as custom.context_tree decides the type's organization.
  if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
    v_admin := array[v_org];
  else
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_type_scopes');
  end if;
  v_part := custom._ctx_tree_part(v_me, array[v_org], v_admin, 'scopes', array[p_scope_type_id], null, v_off, v_lim);
  v_total := (v_part ->> 'total')::integer;
  return v_part || jsonb_build_object(
    'offset', v_off,
    'next_offset', case when v_off + v_lim < v_total then v_off + v_lim end);
end;
$function$;

CREATE FUNCTION custom.context_tree_search(p_organization_ids uuid[], p_query text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_orgs  uuid[];
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
  v_q     text := btrim(coalesce(p_query, ''));
  v_lim   integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME — exactly as custom.context_tree does.
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_search');
  end loop;
  if v_q = '' then
    return jsonb_build_object('scopes', '[]'::jsonb, 'total', 0);
  end if;
  return custom._ctx_tree_part(v_me, v_orgs, v_admin, 'search', null, v_q, 0, v_lim);
end;
$function$;

-- The door rows FIRST, then the grants (the order the ddl guard requires: it fires on the grant).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'context_tree_types', 'p_organization_ids uuid[]', array['uuid[]'::regtype::oid],
   'The scope types of the organizations named, each with the count of its scopes the caller sees — the first paint of the scope tree. Every organization named is decided first through custom.assert_client_may_reach (refused by name, 42501, never an empty tree), except on the admin lane, where public.is_platform_admin() reads a non-member organization whole, exactly as custom.context_tree decides; the types and counts come from custom._ctx_tree_part, custom.context_tree''s own body (the Table list through custom.tables_listed_among, the Records through custom.query_visible_ids). It writes nothing.',
   'scopestreepaged_the_tree_paints_its_types_first.sql', null, true, false),
  ('custom', 'context_tree_type_scopes', 'p_scope_type_id uuid, p_offset integer, p_limit integer',
   array['uuid'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid],
   'One scope type''s scopes, a page at a time (at most 1000 a call), in custom.context_tree''s order, with the total. The type''s organization is read from the type itself and decided through custom.assert_client_may_reach in this door''s name (the admin lane as custom.context_tree); a type that is not a live scope Table, or one the caller does not see, answers nothing; each scope and each of its columns exactly as custom.context_tree answers it (custom._ctx_tree_part). It writes nothing.',
   'scopestreepaged_the_tree_paints_its_types_first.sql', null, true, false),
  ('custom', 'context_tree_search', 'p_organization_ids uuid[], p_query text, p_limit integer',
   array['uuid[]'::regtype::oid, 'text'::regtype::oid, 'integer'::regtype::oid],
   'The scopes whose readable name holds a text (case-insensitive), across the organizations named, at most 500, with the total. Every organization named is decided first through custom.assert_client_may_reach (the admin lane as custom.context_tree); only scopes custom.context_tree would answer the caller are searched, and a name column the one field decision hides from her is never searched. It writes nothing.',
   'scopestreepaged_the_tree_paints_its_types_first.sql', null, true, false);

grant execute on function custom.context_tree_types(uuid[]) to authenticated;
grant execute on function custom.context_tree_type_scopes(uuid, integer, integer) to authenticated;
grant execute on function custom.context_tree_search(uuid[], text, integer) to authenticated;
