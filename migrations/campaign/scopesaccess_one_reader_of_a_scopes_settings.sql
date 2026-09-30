-- chair-step: lane SCOPES-READS-ACCESS (chair ruling 2026-09-29 (4): "Settings rebuilt in three places: consolidate to ONE function (yours), decode JSON there, and make L6's and L10's paths call it"). A scope's settings object was rebuilt from the record store in five bodies: custom._ctx_scope_settings (this lane), custom.scope_rows_of + custom.scope_setting_back (L6), custom.context_tree / custom.context_scopes / custom.context_class_for_checkout (L10) — and L10's three handed a list of objects (a class's exam dates) back as JSON text. Now there is one reader in three pieces: custom._ctx_setting_of (which old key a Field holds, proved by its id), custom._ctx_setting_back (one value read back; custom.scope_setting_back now says only that) and custom._ctx_scope_settings (the object); L6's rows and L10's tree, scopes and class checkout call them. Proof: scripts/campaign-tests/scopesaccess_one_settings_reader_red_green.sql — L6's rows and decode byte-identical; L10's three hand back exactly the old context.scopes.settings for every scope and nothing else moves (RED before: the exam dates). Function bodies only; no DDL on any table, no rows.
-- based-on: custom._ctx_setting_back(jsonb, text) 474df6819fd9f51619197349b2b099c1f49c492c7ca98ddfbe02e3215366c006
-- based-on: custom._ctx_scope_settings(uuid, uuid, jsonb) 1f4ec3c5c6aeb01c6193e2287f658ab15002413ab23d5575ff2a64ad5ac1c618
-- based-on: custom.scope_setting_back(jsonb, text) 12ee413fff25475a8cafd5a342452c39788baaf318755cc041872e24a11684d3
-- based-on: custom.scope_rows_of(uuid, uuid[]) 50488fc87faa4be5211f3b4303e083df0944a2985e3ec9de714997f12150694e
-- based-on: custom.context_scopes(uuid[]) be5cdb64101533cf3e3effc04cbc2213e81c13df2b59ed914f5274dda517d887
-- based-on: custom.context_class_for_checkout(uuid) ecc70452e1c08730ab60525386c9778f0abdbe822cac5ed3a1491607d64d8352
-- based-on: custom.context_tree(uuid[]) 1ccd79feb7e5c99c263fcc3bf316cabed3a702322145ef26a56872b167b85eac
-- lane: SCOPES-READS-ACCESS
-- INVERSE: migrations/inverse/scopesaccess_one_reader_of_a_scopes_settings_down.sql
-- window-class: function bodies; no DDL on any table.

-- ═══════════════════════════════════════════════════ the ONE reader of a scope's settings (three pieces)

-- 1. Which old settings key a Field holds: the key its moved_from note names, and only when the Field's id is the
--    one both twins derive for that key on that Table (custom._ctx_id('scope-setting-field', table, key)).
create function custom._ctx_setting_of(p_field uuid, p_table uuid, p_note text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select m[1]
    from regexp_match(p_note, '^the ''(.*)'' key of this type''s scopes'' settings') m
   where p_field = custom._ctx_id('scope-setting-field', p_table::text, m[1])
$function$;
revoke all on function custom._ctx_setting_of(uuid, uuid, text) from public, anon, authenticated;

-- 2. One settings value as context.scopes.settings held it. A text Field keeps a non-text value as its JSON text
--    (custom._ctx_words), which is read back as the value it was; a list is read back element by element.
CREATE OR REPLACE FUNCTION custom._ctx_setting_back(p_value jsonb, p_behavior text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_out jsonb;
begin
  if p_value is null or p_behavior is distinct from 'text' then
    return p_value;
  end if;
  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(custom._ctx_setting_back(e.value, 'text') order by e.ord), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(p_value) with ordinality e(value, ord);
    return v_out;
  end if;
  if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\s*[\[{]'
     and pg_input_is_valid(p_value #>> '{}', 'jsonb') then
    return (p_value #>> '{}')::jsonb;
  end if;
  return p_value;
end;
$function$;

-- 3. A scope's settings object, rebuilt from its Record (or from the document a read door handed back): every live
--    settings Field of its Table, under its old key, its value read back. A key with no value is left out.
CREATE OR REPLACE FUNCTION custom._ctx_scope_settings(p_org uuid, p_table uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- plpgsql, not sql: its plan is kept for the session (a SQL function is planned again on every call).
declare v_out jsonb;
begin
  select coalesce(jsonb_object_agg(sf.setting, custom._ctx_setting_back(p_data -> sf.fkey, sf.behavior)), '{}'::jsonb)
    into v_out
    from (select custom._ctx_setting_of(f.id, p_table, f.metadata -> 'moved_from' ->> 'note') as setting,
                 f.data ->> 'key' as fkey, f.data ->> 'type' as behavior
            from custom.record f
           where f.organization_id = p_org
             and f.table_id = custom.field_kernel_id()
             and f.data @> jsonb_build_object('entity_definition_id', p_table::text)
             and f.deleted_at is null
             and f.metadata -> 'moved_from' ->> 'table' = 'context.scopes') sf
   where sf.setting is not null
     and sf.fkey is not null
     and p_data ? sf.fkey
     and jsonb_typeof(p_data -> sf.fkey) <> 'null';
  return v_out;
end;
$function$;

-- L6's decode is the same reading, now said once.
CREATE OR REPLACE FUNCTION custom.scope_setting_back(p_value jsonb, p_behavior text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select custom._ctx_setting_back(p_value, p_behavior)
$function$;

-- L6's rows, L10's tree, scopes and class checkout call the one reader.
CREATE OR REPLACE FUNCTION custom.scope_rows_of(p_org uuid, p_types uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, table_id uuid, type_sort integer, sort_order integer, name text, type_doc jsonb, row_doc jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Each CTE is asked once per call, never once per scope row.
  with t as materialized (
    select x.id, x.data
      from custom.record x
     where x.organization_id = p_org
       and x.table_id = custom.table_kernel_id()
       and x.deleted_at is null
       and x.data ->> 'kept_for' = 'context'
       and (p_types is null or x.id = any (p_types))
  ), fx as materialized (
    select (f.data ->> 'entity_definition_id')::uuid as tid, f.id, f.data, f.metadata
      from custom.record f
     where f.organization_id = p_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' in (select t.id::text from t)
       and f.metadata -> 'moved_from' ->> 'table' = 'context.scopes'
  ), per_type as materialized (
    select t.id as tid, t.data as tdata,
           coalesce((select fx.data ->> 'key' from fx
                      where fx.id = custom._ctx_id('scope-column-field', t.id::text, 'description')),
                    'description') as desc_key,
           -- THE SETTINGS KEYS: each is a declared Field whose note names the old key.
           coalesce((select jsonb_agg(jsonb_build_object(
                              'old', custom._ctx_setting_of(fx.id, t.id, fx.metadata -> 'moved_from' ->> 'note'),
                              'key', fx.data ->> 'key', 'behavior', fx.data ->> 'type'))
                       from fx
                      where fx.tid = t.id
                        and fx.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'),
                    '[]'::jsonb) as settings_fields
      from t
  )
  select r.id, r.table_id,
         coalesce(nullif(pt.tdata ->> 'sort_order', '')::int, 0),
         coalesce(nullif(r.data ->> 'sort_order', '')::int, 0),
         r.data ->> 'name',
         pt.tdata,
         (to_jsonb(r) - array['table_id', 'data', 'data_class', 'metadata'])
         || jsonb_build_object(
              'scope_type_id', r.table_id,
              'parent_scope_id', coalesce(to_jsonb(nullif(r.data ->> 'parent_id', '')), 'null'::jsonb),
              'name', coalesce(r.data -> 'name', 'null'::jsonb),
              'description', coalesce(r.data -> pt.desc_key, 'null'::jsonb),
              'settings', case when jsonb_array_length(pt.settings_fields) = 0 then '{}'::jsonb else coalesce((select jsonb_object_agg(s ->> 'old', custom._ctx_setting_back(r.data -> (s ->> 'key'), s ->> 'behavior'))
                                      from jsonb_array_elements(pt.settings_fields) s
                                     where s ->> 'old' is not null
                                       and jsonb_typeof(r.data -> (s ->> 'key')) is distinct from 'null'
                                       and r.data ? (s ->> 'key')), '{}'::jsonb) end,
              'slug', coalesce(r.data -> 'slug', 'null'::jsonb),
              'sort_order', coalesce(nullif(r.data ->> 'sort_order', '')::int, 0),
              'metadata', '{}'::jsonb,
              'published_to_web', false,
              'published_to_web_at', null,
              'published_to_web_by', null)
    from custom.record r
    join per_type pt on pt.tid = r.table_id
   where r.organization_id = p_org
     and r.table_id in (select t.id from t)
     and r.deleted_at is null
$function$;

CREATE OR REPLACE FUNCTION custom.context_scopes(p_scope_ids uuid[])
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
               'settings', custom._ctx_scope_settings(v_grp.org, v_grp.tbl, d.document),
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

CREATE OR REPLACE FUNCTION custom.context_class_for_checkout(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    'settings', custom._ctx_scope_settings(v_rec.organization_id, v_rec.table_id, v_rec.data));
end;
$function$;

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

  -- STORE-READ-PERF-4 (2026-09-29): ONE TABLE WALK FOR EVERY ORGANIZATION THAT KEEPS A SCOPE TYPE.
  -- Which Tables she sees in those organizations is asked once, for all of them together
  -- (custom.tables_seen_once_per_group: the one ladder once per group of look-alike Tables); the
  -- answer waits in this statement's memo and each custom.query_visible_ids(org, Table kernel) below
  -- reads its organization's part. It decides nothing: without it every answer is the same.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select distinct t.organization_id
              from custom.record t
             where t.organization_id = any (v_orgs)
               and not (t.organization_id = any (v_admin))
               and t.table_id = v_tables
               and t.deleted_at is null
               and t.data ->> 'kept_for' = 'context'));

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
