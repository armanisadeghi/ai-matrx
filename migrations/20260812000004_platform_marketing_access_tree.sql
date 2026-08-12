-- Platform access trees + complete marketing hierarchy.
--
-- Owner ruling (2026-08-12): a grant on a canonical resource opens that row
-- and every structural descendant. It never opens the parent or siblings.
-- Components may still be direct share points when they are registered in
-- platform.shareable_resource_registry; their grants are additive to inherited
-- parent access. Association conveyance remains viewer-capped contextual access.

-- ---------------------------------------------------------------------------
-- 1. One recursive kernel for entities, shareable components, and descendants
-- ---------------------------------------------------------------------------

create or replace function iam.has_access_for_base(
  p_user_id uuid,
  p_type text,
  p_id uuid,
  p_required public.permission_level default 'viewer'::public.permission_level
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam', 'rag'
as $$
declare
  v_schema text;
  v_table text;
  v_uid uuid := p_user_id;
  v_vis platform.visibility;
  v_owner uuid;
  v_org uuid;
  v_found boolean;
  v_parent_id uuid;
  rec record;
begin
  if v_uid is null then
    return false;
  end if;

  select et.schema_name, et.table_name
    into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then
    return false;
  end if;

  if p_type = 'data_store'
     and p_required = 'viewer'::public.permission_level
     and public.user_can_read_data_store_via_grant(v_uid, p_id)
  then
    return true;
  end if;

  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then
    return false;
  end if;

  -- Direct lanes apply to every registered row. This is load-bearing for a
  -- shareable component such as web_page: its explicit permission must not be
  -- discarded merely because it also inherits from web_site.
  if v_owner = v_uid then
    return true;
  end if;
  if p_required = 'viewer'::public.permission_level
     and v_org is not null
     and public.is_org_admin_for(v_uid, v_org)
  then
    return true;
  end if;
  if v_vis = 'public'::platform.visibility
     and p_required = 'viewer'::public.permission_level
  then
    return true;
  end if;
  if p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility
     and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable)
  then
    return true;
  end if;
  if v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid)
  then
    return true;
  end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then
    return true;
  end if;
  if exists (
    select 1
    from iam.memberships m
    join iam.membership_grant g
      on g.member_role = m.role
     and g.container_type in (p_type, '*')
    where m.container_type = p_type
      and m.container_id = p_id
      and m.user_id = v_uid
      and m.deleted_at is null
      and g.confers >= p_required
  ) then
    return true;
  end if;
  if p_required = 'viewer'::public.permission_level
     and public._edu_can_read_via_assignment(v_uid, p_type, p_id)
  then
    return true;
  end if;

  -- Semantic/contextual conveyance (association reachability). Resolve the
  -- container through THE kernel so a structurally inherited container works:
  -- page grant -> screenshot -> attached note/file. The old hand-inlined
  -- permission check recognized only a direct screenshot grant and broke that
  -- exact chain.
  for rec in
    select r.container_type, r.container_id
    from platform.reachability r
    where r.item_type = p_type
      and r.item_id = p_id
      and r.max_level >= p_required
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for(
         v_uid, rec.container_type, rec.container_id, p_required
       )
    then
      return true;
    end if;
  end loop;

  if v_vis >= 'internal'::platform.visibility
     and v_org is not null
     and iam.has_org_access_for(v_uid, v_org)
  then
    return true;
  end if;

  -- Structural inheritance. Composition means the child has no independent
  -- access identity. Containment means the child may also be shared directly.
  -- Both grant downward access from ANY registered parent, regardless of the
  -- child's own visibility; a parent share is a promise to include its tree.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format(
      'select %I from %I.%I where id = $1',
      rec.fk_column, v_schema, v_table
    ) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for(v_uid, rec.parent_type, v_parent_id, p_required)
    then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function iam.has_access_for_base(
  uuid, text, uuid, public.permission_level
) is
  'Canonical access-tree resolver. Direct access on a row is additive to access inherited from every composition/containment parent. A grant opens descendants, never ancestors or siblings.';

create or replace function iam.accessible_entity_ids(
  p_type text,
  p_required public.permission_level default 'viewer'::public.permission_level,
  p_depth integer default 0
) returns uuid[]
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'platform', 'iam'
as $$
declare
  v_uid uuid := auth.uid();
  v_schema text;
  v_table text;
  v_tbl text;
  v_owner_col text;
  v_has_org boolean;
  v_has_vis boolean;
  v_parent_ids uuid[];
  v_more uuid[];
  v_trusted text;
  v_sql text;
  v_ids uuid[] := '{}';
  rec record;
begin
  if v_uid is null or p_depth > 12 then
    return '{}'::uuid[];
  end if;

  select et.schema_name, et.table_name
    into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then
    return '{}'::uuid[];
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema
    and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1
    when 'owner_id' then 2
    else 3
  end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema
      and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema
      and c.table_name = v_table
      and c.column_name = 'visibility'
  ) into v_has_vis;

  -- Direct/mass lanes are valid for entities and components alike. Registry
  -- controls which types may receive new shares; the kernel faithfully honors
  -- any valid direct grant that already exists.
  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false'
  end;
  if v_has_vis and v_has_org then
    v_trusted := v_trusted
      || ' or (t.visibility >= ''internal'' and t.organization_id in ('
      || 'select om.organization_id from iam.organization_member om '
      || 'where om.user_id = $1))';
  end if;
  if v_has_org and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || ' or t.organization_id in ('
      || 'select so.organization_id from iam.system_orgs so '
      || 'where so.global_readable)';
  end if;
  if p_required = 'viewer'::public.permission_level then
    if v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      if v_has_org then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so '
          || 'where so.global_readable))';
      end if;
    end if;
    if v_has_org then
      v_trusted := v_trusted
        || ' or t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- Sparse lanes are candidate-enumerated and confirmed by the one resolver.
  for rec in
    select distinct c.id
    from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type
        and m.user_id = v_uid
        and m.deleted_at is null
      union
      select r.item_id
      from platform.reachability r
      where r.item_type = p_type
        and r.max_level >= p_required
      union
      select a.source_id
      from platform.associations a
      where a.source_type = p_type
        and a.role = 'assignment'
        and a.target_type = 'scope'
    ) c
    where not (c.id = any(v_ids))
  loop
    if iam.has_access_for(v_uid, p_type, rec.id, p_required) then
      v_ids := v_ids || rec.id;
    end if;
  end loop;

  -- Structural parents are OR lanes. Multiple parents support flattened rows
  -- such as a screenshot carrying site_id, page_id, and snapshot_id: a grant
  -- on any true container reaches it without granting any sibling.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema
        and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      v_parent_ids := iam.accessible_entity_ids(
        rec.parent_type, p_required, p_depth + 1
      );
      if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
        v_sql := format(
          'select coalesce(array_agg(t.id), ''{}'') from %s t '
          || 'where t.%I = any($1) and not (t.id = any($2))',
          v_tbl, rec.fk_column
        );
        execute v_sql into v_more using v_parent_ids, v_ids;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  return coalesce((
    select array_agg(distinct x)
    from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$$;

comment on function iam.accessible_entity_ids(
  text, public.permission_level, integer
) is
  'Set-wise access-tree resolver used by RLS. Unions direct lanes with every structural parent lane; depth is bounded and registry cycles remain drift errors.';

revoke all on function iam.accessible_entity_ids(
  text, public.permission_level, integer
) from public;
grant execute on function iam.accessible_entity_ids(
  text, public.permission_level, integer
) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Component RLS: select the child-access set once; writes use any parent
-- ---------------------------------------------------------------------------

create or replace function iam.apply_rls(
  p_schema text,
  p_table text,
  p_token text,
  p_variant text default 'entity'::text
) returns void
language plpgsql
as $$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_created boolean;
  v_has_org boolean;
  v_has_del boolean;
  v_has_vis boolean;
  v_delpfx text := '';
  v_parent_expr_edit text := '';
  v_all_parent_null text := '';
  v_parent_count integer := 0;
  rec record;
  pol record;
begin
  select coalesce(is_component, false) into v_is_component
  from platform.entity_types
  where token = p_token;

  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'created_by'
  ) into v_has_created;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'deleted_at'
  ) into v_has_del;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'visibility'
  ) into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  execute format('alter table %s enable row level security', v_tbl);
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass loop
    execute format('drop policy %I on %s', pol.polname, v_tbl);
  end loop;
  execute format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)',
    v_tbl
  );

  if p_variant = 'ledger' then
    execute format(
      'create policy std_select on %s for select to authenticated using (iam.has_org_access(organization_id))',
      v_tbl
    );
    return;
  end if;

  if v_is_component or p_variant = 'component' then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_token and er.kind = 'composition'
      order by er.parent_type, er.fk_column
    loop
      v_parent_count := v_parent_count + 1;
      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format(
          '%I in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
          rec.fk_column, rec.parent_type
        );
      v_all_parent_null := v_all_parent_null
        || case when v_all_parent_null = '' then '' else ' and ' end
        || format('%I is null', rec.fk_column);
    end loop;
    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships',
        p_token;
    end if;
    if v_has_created then
      v_parent_expr_edit := '(' || v_parent_expr_edit || ') or ('
        || v_all_parent_null || ' and created_by = (select auth.uid()))';
    end if;

    -- SELECT/UPDATE/DELETE resolve the CHILD token once per statement. That
    -- includes direct grants on shareable components plus every parent lane.
    execute format(
      'create policy std_select on %s for select to authenticated using ('
      || 'id in (select unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level))))',
      v_tbl, p_token
    );
    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through at least one structural parent (or be an owned orphan).
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s)',
      v_tbl, v_parent_expr_edit
    );
    execute format(
      'create policy std_update on %s for update to authenticated using ('
      || 'id in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) '
      || 'with check ((%s) or public.has_permission(%L, id, ''editor''::public.permission_level))',
      v_tbl, p_token, v_parent_expr_edit, p_token
    );
    execute format(
      'create policy std_delete on %s for delete to authenticated using ('
      || 'id in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level))))',
      v_tbl, p_token
    );
    return;
  end if;

  if not v_has_created then
    raise exception
      'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  if not v_has_org then
    raise exception
      'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;

  if p_variant = 'restricted' then
    execute format(
      'create policy std_select on %s for select to authenticated using (%s(created_by = (select auth.uid()) or public.is_super_admin()))',
      v_tbl, v_delpfx
    );
    if v_has_vis then
      execute format(
        'create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx
      );
    end if;
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (public.is_super_admin() or organization_id is null or iam.has_org_access(organization_id)))',
      v_tbl
    );
    execute format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid()) or public.is_super_admin()) with check (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl
    );
    execute format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl
    );
    return;
  end if;

  if p_variant = 'system' then
    if not v_has_vis then
      raise exception
        'apply_rls: system variant on %.% requires a visibility column',
        p_schema, p_table;
    end if;
    execute format(
      'create policy std_select on %s for select to authenticated using ((visibility = ''public'' or created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token
    );
  else
    execute format(
      'create policy std_select on %s for select to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token
    );
  end if;
  if v_has_vis then
    execute format(
      'create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
      v_tbl, v_delpfx
    );
  end if;
  execute format(
    'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id) or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())))',
    v_tbl
  );
  execute format(
    'create policy std_update on %s for update to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))',
    v_tbl, p_token, p_token
  );
  execute format(
    'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Canonical marketing access points and structural hierarchy
-- ---------------------------------------------------------------------------

-- Existing canonical entities which contain other independently addressable
-- entities. These are containment edges because the child may also be shared.
insert into platform.entity_relationships(
  child_type, parent_type, fk_column, kind, note
) values
  ('web_site', 'web_brand', 'brand_id', 'containment',
   'Marketing account -> managed website. Brand grants cascade to the site tree.'),
  ('growth_loop_run', 'web_site', 'site_id', 'containment',
   'Site -> growth loop run.'),
  ('seo_collection_run', 'web_site', 'site_id', 'containment',
   'Site -> SEO collection run.'),
  ('seo_collection_run', 'web_page', 'page_id', 'containment',
   'Page-specific collection runs inherit a direct page share.'),
  ('seo_rank_target', 'web_site', 'site_id', 'containment',
   'Site -> rank target.'),
  ('seo_rank_target', 'web_page', 'target_page_id', 'containment',
   'Page-specific rank targets inherit a direct page share.'),
  ('plan_entity', 'web_site', 'site_id', 'containment',
   'Site -> content-plan entity.'),
  ('plan_node', 'web_site', 'site_id', 'containment',
   'Site -> content-plan node.')
on conflict (child_type, parent_type, fk_column) do update
set kind = excluded.kind, note = excluded.note;

-- Existing component rows may have several legitimate structural parents.
-- Keeping site_id as a parent preserves whole-site access; adding page/snapshot
-- parents makes granular sharing complete instead of treating them as siblings.
insert into platform.entity_relationships(
  child_type, parent_type, fk_column, kind, note
) values
  ('web_property', 'web_site', 'site_id', 'composition',
   'Website property alias inherits from its canonical site; social properties retain brand_id.'),
  ('web_result', 'web_page', 'page_id', 'composition', 'Page analysis result.'),
  ('web_crawl_event', 'web_page', 'page_id', 'composition', 'Page crawl event.'),
  ('web_crawl_event', 'web_crawl_session', 'session_id', 'composition', 'Crawl-session event.'),
  ('web_crawl_event', 'web_crawl_url', 'crawl_url_id', 'composition', 'Crawl-URL event.'),
  ('web_crawl_preset', 'web_site', 'site_id', 'composition', 'Site crawl preset.'),
  ('web_crawl_url', 'web_page', 'page_id', 'composition', 'Resolved page crawl URL.'),
  ('web_crawl_url', 'web_page', 'discovered_from_page_id', 'composition', 'Page-discovered crawl URL.'),
  ('web_crawl_url', 'web_crawl_session', 'session_id', 'composition', 'Crawl-session URL.'),
  ('web_crawl_url', 'web_snapshot', 'snapshot_id', 'composition', 'Snapshot crawl URL.'),
  ('web_finding', 'web_page', 'page_id', 'composition', 'Page finding.'),
  ('web_gsc_page_stat', 'web_page', 'page_id', 'composition', 'Page Search Console statistic.'),
  ('web_link_edge', 'web_page', 'source_page_id', 'composition', 'Source-page link edge.'),
  ('web_link_edge', 'web_page', 'target_page_id', 'composition', 'Target-page link edge.'),
  ('web_link_edge', 'web_snapshot', 'snapshot_id', 'composition', 'Snapshot link edge.'),
  ('web_page_content', 'web_page', 'page_id', 'composition', 'Page content.'),
  ('web_page_evidence', 'web_page', 'page_id', 'composition', 'Page evidence.'),
  ('web_page_sitemap', 'web_page', 'page_id', 'composition', 'Page sitemap membership.'),
  ('web_page_sitemap', 'web_sitemap', 'sitemap_id', 'composition', 'Sitemap page membership.'),
  ('web_screenshot', 'web_page', 'page_id', 'composition', 'Page screenshot.'),
  ('web_screenshot', 'web_snapshot', 'snapshot_id', 'composition', 'Snapshot screenshot.'),
  ('web_snapshot', 'web_page', 'page_id', 'composition', 'Page snapshot.'),
  ('web_snapshot', 'web_crawl_session', 'session_id', 'composition', 'Crawl-session snapshot.')
on conflict (child_type, parent_type, fk_column) do update
set kind = excluded.kind, note = excluded.note;

-- The canonical granular entry points requested by the marketing hierarchy.
insert into platform.shareable_resource_registry(
  resource_type, schema_name, table_name, id_column, owner_column,
  display_label, url_path_template, rls_uses_has_permission, is_active,
  notes, content_role, is_scopeable, is_link_shareable, public_columns
) values
  ('web_property', 'web', 'property', 'id', 'created_by',
   'Marketing Property', '/marketing/properties/{id}', true, true,
   'Canonical social/website presence below a brand. Website shares should use web_site; social presences share this row.',
   'container', true, false, null),
  ('web_snapshot', 'web', 'snapshot', 'id', 'created_by',
   'Web Snapshot', '/marketing/snapshots/{id}', true, true,
   'Point-in-time page capture; direct access includes its screenshots and stored body/markdown files.',
   'container', true, false, null),
  ('web_screenshot', 'web', 'screenshot', 'id', 'created_by',
   'Web Screenshot', '/marketing/screenshots/{id}', true, true,
   'Granular capture access point. Direct or inherited access conveys viewer access to attached notes and supplemental files.',
   'container', true, false, null)
on conflict (resource_type) do update set
  schema_name = excluded.schema_name,
  table_name = excluded.table_name,
  id_column = excluded.id_column,
  owner_column = excluded.owner_column,
  display_label = excluded.display_label,
  url_path_template = excluded.url_path_template,
  rls_uses_has_permission = excluded.rls_uses_has_permission,
  is_active = excluded.is_active,
  notes = excluded.notes,
  content_role = excluded.content_role,
  is_scopeable = excluded.is_scopeable,
  is_link_shareable = excluded.is_link_shareable,
  public_columns = excluded.public_columns,
  updated_at = now();

-- Correct the prior local interpretation: the screenshot is the container.
-- The stored image is still the screenshot.file_id FK; file associations here
-- mean supplemental attachments, not the image row itself.
update platform.association_types
set container_side = 'target',
    conveys_max = 'viewer'::public.permission_level,
    notes = case source_type
      when 'note' then
        'A note about this capture. Screenshot access conveys viewer access to the note.'
      when 'file' then
        'A supplemental file about this capture. Screenshot access conveys viewer access; screenshot.file_id remains the image FK.'
    end,
    updated_at = now()
where target_type = 'web_screenshot'
  and source_type in ('note', 'file');

-- ---------------------------------------------------------------------------
-- 4. Register every addressable table in the marketing FK tree
-- ---------------------------------------------------------------------------

-- These rows are components: they do not become independent sharing concepts.
-- Registration gives the one kernel a stable token so they always inherit.
insert into platform.entity_types(
  token, schema_name, table_name, label, base_tier,
  is_versioned, has_soft_delete, is_component, rls_variant,
  category, notes
) values
  ('growth_loop_event', 'growth', 'loop_event', 'Growth Loop Event', 1, false, false, true, 'component', 'marketing', 'Always inherits from growth_loop_run.'),
  ('growth_loop_stage_run', 'growth', 'loop_stage_run', 'Growth Loop Stage Run', 1, false, false, true, 'component', 'marketing', 'Always inherits from growth_loop_run.'),
  ('plan_cms_fill_job', 'plan', 'cms_fill_job', 'CMS Fill Job', 1, false, false, true, 'component', 'marketing', 'Internal execution row; access identity derives from web_site.'),
  ('plan_cms_fill_item', 'plan', 'cms_fill_item', 'CMS Fill Item', 1, false, false, true, 'component', 'marketing', 'Internal execution row; access identity derives from its job/page.'),
  ('seo_ai_visibility_citation', 'seo', 'ai_visibility_citation', 'AI Visibility Citation', 1, false, false, true, 'component', 'marketing', 'Always inherits from response/site.'),
  ('seo_ai_visibility_claim', 'seo', 'ai_visibility_claim', 'AI Visibility Claim', 1, false, false, true, 'component', 'marketing', 'Always inherits from response/site.'),
  ('seo_ai_visibility_response', 'seo', 'ai_visibility_response', 'AI Visibility Response', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run/site.'),
  ('seo_ai_visibility_signal', 'seo', 'ai_visibility_signal', 'AI Visibility Signal', 1, false, false, true, 'component', 'marketing', 'Always inherits from response/site.'),
  ('seo_backlink', 'seo', 'backlink', 'SEO Backlink', 1, false, false, true, 'component', 'marketing', 'Always inherits from site/page.'),
  ('seo_backlink_dimension_snapshot', 'seo', 'backlink_dimension_snapshot', 'Backlink Dimension Snapshot', 1, false, false, true, 'component', 'marketing', 'Always inherits from backlink snapshot/run/site.'),
  ('seo_backlink_observation', 'seo', 'backlink_observation', 'Backlink Observation', 1, false, false, true, 'component', 'marketing', 'Always inherits from backlink/snapshot/run/site/page.'),
  ('seo_backlink_snapshot', 'seo', 'backlink_snapshot', 'Backlink Snapshot', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run/site/page.'),
  ('seo_change_assessment', 'seo', 'change_assessment', 'SEO Change Assessment', 1, false, false, true, 'component', 'marketing', 'Always inherits from change set/site.'),
  ('seo_change_event', 'seo', 'change_event', 'SEO Change Event', 1, false, false, true, 'component', 'marketing', 'Always inherits from change set/site.'),
  ('seo_change_item', 'seo', 'change_item', 'SEO Change Item', 1, true, true, true, 'component', 'marketing', 'Always inherits from change set/site/page.'),
  ('seo_change_metric', 'seo', 'change_metric', 'SEO Change Metric', 1, true, true, true, 'component', 'marketing', 'Always inherits from change set/site.'),
  ('seo_change_theory', 'seo', 'change_theory', 'SEO Change Theory', 1, true, true, true, 'component', 'marketing', 'Always inherits from change set/site/page.'),
  ('seo_competitor', 'seo', 'competitor', 'SEO Competitor', 1, false, false, true, 'component', 'marketing', 'Always inherits from site.'),
  ('seo_competitor_opportunity', 'seo', 'competitor_opportunity', 'Competitor Opportunity', 1, false, false, true, 'component', 'marketing', 'Always inherits from competitor/run/site/page.'),
  ('seo_competitor_observation', 'seo', 'competitor_observation', 'Competitor Observation', 1, false, false, true, 'component', 'marketing', 'Always inherits from competitor/run.'),
  ('seo_gsc_dig_rule', 'seo', 'gsc_dig_rule', 'GSC Dig Rule', 1, true, true, true, 'component', 'marketing', 'Always inherits from site.'),
  ('seo_keyword_class_rule', 'seo', 'keyword_class_rule', 'Keyword Class Rule', 1, true, true, true, 'component', 'marketing', 'Always inherits from site.'),
  ('seo_keyword_market_observation', 'seo', 'keyword_market_observation', 'Keyword Market Observation', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run.'),
  ('seo_page_performance', 'seo', 'page_performance', 'Page Performance', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run/site/page.'),
  ('seo_provider_call', 'seo', 'provider_call', 'SEO Provider Call', 1, false, false, true, 'component', 'marketing', 'Operational provenance; always inherits from collection run.'),
  ('seo_provider_task', 'seo', 'provider_task', 'SEO Provider Task', 1, false, false, true, 'component', 'marketing', 'Operational provenance; always inherits from collection run.'),
  ('seo_rank_observation', 'seo', 'rank_observation', 'Rank Observation', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run/rank target.'),
  ('seo_raw_payload', 'seo', 'raw_payload', 'SEO Raw Payload', 1, false, false, true, 'component', 'marketing', 'Operational evidence; always inherits from collection run.'),
  ('seo_referring_domain_profile', 'seo', 'referring_domain_profile', 'Referring Domain Profile', 1, false, false, true, 'component', 'marketing', 'Always inherits from site.'),
  ('seo_reputation_case', 'seo', 'reputation_case', 'Reputation Case', 1, false, false, true, 'component', 'marketing', 'Always inherits from site/page/run.'),
  ('seo_search_performance_daily', 'seo', 'search_performance_daily', 'Search Performance Daily', 1, false, false, true, 'component', 'marketing', 'Always inherits from site/page/run.'),
  ('seo_serp_snapshot', 'seo', 'serp_snapshot', 'SERP Snapshot', 1, false, false, true, 'component', 'marketing', 'Always inherits from collection run/rank target.'),
  ('seo_serp_result', 'seo', 'serp_result', 'SERP Result', 1, false, false, true, 'component', 'marketing', 'Always inherits from SERP snapshot.'),
  ('seo_web_analytics_daily', 'seo', 'web_analytics_daily', 'Web Analytics Daily', 1, false, false, true, 'component', 'marketing', 'Always inherits from site/page/run.')
on conflict (token) do update set
  schema_name = excluded.schema_name,
  table_name = excluded.table_name,
  label = excluded.label,
  is_component = true,
  rls_variant = 'component',
  category = excluded.category,
  notes = excluded.notes,
  table_ref = format('%I.%I', excluded.schema_name, excluded.table_name)::regclass;

-- Composition edges for the newly registered components. OR semantics are
-- intentional: flattened tables retain their broad site/run parent while page
-- or nested-resource grants reach only rows that actually reference that node.
insert into platform.entity_relationships(
  child_type, parent_type, fk_column, kind, note
) values
  ('growth_loop_event', 'growth_loop_run', 'loop_run_id', 'composition', 'Loop event -> run.'),
  ('growth_loop_event', 'growth_loop_stage_run', 'stage_run_id', 'composition', 'Loop event -> stage run.'),
  ('growth_loop_stage_run', 'growth_loop_run', 'loop_run_id', 'composition', 'Stage run -> loop run.'),
  ('plan_cms_fill_job', 'web_site', 'web_site_id', 'composition', 'CMS fill job -> site.'),
  ('plan_cms_fill_item', 'plan_cms_fill_job', 'job_id', 'composition', 'CMS fill item -> job.'),
  ('seo_ai_visibility_response', 'web_site', 'site_id', 'composition', 'AI response -> site.'),
  ('seo_ai_visibility_response', 'seo_collection_run', 'command_run_id', 'composition', 'AI response -> command run.'),
  ('seo_ai_visibility_response', 'seo_collection_run', 'provider_run_id', 'composition', 'AI response -> provider run.'),
  ('seo_ai_visibility_citation', 'seo_ai_visibility_response', 'response_id', 'composition', 'Citation -> response.'),
  ('seo_ai_visibility_citation', 'web_site', 'site_id', 'composition', 'Citation -> site.'),
  ('seo_ai_visibility_claim', 'seo_ai_visibility_response', 'response_id', 'composition', 'Claim -> response.'),
  ('seo_ai_visibility_claim', 'web_site', 'site_id', 'composition', 'Claim -> site.'),
  ('seo_ai_visibility_signal', 'seo_ai_visibility_response', 'response_id', 'composition', 'Signal -> response.'),
  ('seo_ai_visibility_signal', 'web_site', 'site_id', 'composition', 'Signal -> site.'),
  ('seo_backlink', 'web_site', 'site_id', 'composition', 'Backlink -> site.'),
  ('seo_backlink', 'web_page', 'page_id', 'composition', 'Backlink -> page.'),
  ('seo_backlink_snapshot', 'web_site', 'site_id', 'composition', 'Backlink snapshot -> site.'),
  ('seo_backlink_snapshot', 'web_page', 'page_id', 'composition', 'Backlink snapshot -> page.'),
  ('seo_backlink_snapshot', 'seo_collection_run', 'run_id', 'composition', 'Backlink snapshot -> run.'),
  ('seo_backlink_dimension_snapshot', 'web_site', 'site_id', 'composition', 'Dimension snapshot -> site.'),
  ('seo_backlink_dimension_snapshot', 'seo_collection_run', 'run_id', 'composition', 'Dimension snapshot -> run.'),
  ('seo_backlink_dimension_snapshot', 'seo_backlink_snapshot', 'snapshot_id', 'composition', 'Dimension snapshot -> backlink snapshot.'),
  ('seo_backlink_observation', 'seo_backlink', 'backlink_id', 'composition', 'Backlink observation -> backlink.'),
  ('seo_backlink_observation', 'seo_backlink_snapshot', 'snapshot_id', 'composition', 'Backlink observation -> snapshot.'),
  ('seo_backlink_observation', 'seo_collection_run', 'run_id', 'composition', 'Backlink observation -> run.'),
  ('seo_backlink_observation', 'web_site', 'site_id', 'composition', 'Backlink observation -> site.'),
  ('seo_backlink_observation', 'web_page', 'page_id', 'composition', 'Backlink observation -> page.'),
  ('seo_change_assessment', 'seo_change_set', 'change_set_id', 'composition', 'Change assessment -> change set.'),
  ('seo_change_assessment', 'web_site', 'site_id', 'composition', 'Change assessment -> site.'),
  ('seo_change_event', 'seo_change_set', 'change_set_id', 'composition', 'Change event -> change set.'),
  ('seo_change_event', 'web_site', 'site_id', 'composition', 'Change event -> site.'),
  ('seo_change_item', 'seo_change_set', 'change_set_id', 'composition', 'Change item -> change set.'),
  ('seo_change_item', 'web_site', 'site_id', 'composition', 'Change item -> site.'),
  ('seo_change_item', 'web_page', 'page_id', 'composition', 'Change item -> page.'),
  ('seo_change_metric', 'seo_change_set', 'change_set_id', 'composition', 'Change metric -> change set.'),
  ('seo_change_metric', 'web_site', 'site_id', 'composition', 'Change metric -> site.'),
  ('seo_change_theory', 'seo_change_set', 'change_set_id', 'composition', 'Change theory -> change set.'),
  ('seo_change_theory', 'web_site', 'site_id', 'composition', 'Change theory -> site.'),
  ('seo_change_theory', 'web_page', 'page_id', 'composition', 'Change theory -> page.'),
  ('seo_competitor', 'web_site', 'site_id', 'composition', 'Competitor -> site.'),
  ('seo_competitor_opportunity', 'seo_competitor', 'competitor_id', 'composition', 'Opportunity -> competitor.'),
  ('seo_competitor_opportunity', 'seo_collection_run', 'run_id', 'composition', 'Opportunity -> run.'),
  ('seo_competitor_opportunity', 'web_site', 'site_id', 'composition', 'Opportunity -> site.'),
  ('seo_competitor_opportunity', 'web_page', 'target_page_id', 'composition', 'Opportunity -> target page.'),
  ('seo_competitor_observation', 'seo_competitor', 'competitor_id', 'composition', 'Competitor observation -> competitor.'),
  ('seo_competitor_observation', 'seo_collection_run', 'run_id', 'composition', 'Competitor observation -> run.'),
  ('seo_gsc_dig_rule', 'web_site', 'site_id', 'composition', 'GSC dig rule -> site.'),
  ('seo_keyword_class_rule', 'web_site', 'site_id', 'composition', 'Keyword class rule -> site.'),
  ('seo_keyword_market_observation', 'seo_collection_run', 'run_id', 'composition', 'Keyword market observation -> run.'),
  ('seo_page_performance', 'seo_collection_run', 'run_id', 'composition', 'Page performance -> run.'),
  ('seo_page_performance', 'web_site', 'site_id', 'composition', 'Page performance -> site.'),
  ('seo_page_performance', 'web_page', 'page_id', 'composition', 'Page performance -> page.'),
  ('seo_provider_call', 'seo_collection_run', 'run_id', 'composition', 'Provider call -> run.'),
  ('seo_provider_task', 'seo_collection_run', 'run_id', 'composition', 'Provider task -> run.'),
  ('seo_rank_observation', 'seo_collection_run', 'run_id', 'composition', 'Rank observation -> run.'),
  ('seo_rank_observation', 'seo_rank_target', 'rank_target_id', 'composition', 'Rank observation -> target.'),
  ('seo_raw_payload', 'seo_collection_run', 'run_id', 'composition', 'Raw payload -> run.'),
  ('seo_referring_domain_profile', 'web_site', 'site_id', 'composition', 'Referring domain profile -> site.'),
  ('seo_reputation_case', 'seo_collection_run', 'run_id', 'composition', 'Reputation case -> run.'),
  ('seo_reputation_case', 'web_site', 'site_id', 'composition', 'Reputation case -> site.'),
  ('seo_reputation_case', 'web_page', 'page_id', 'composition', 'Reputation case -> page.'),
  ('seo_search_performance_daily', 'seo_collection_run', 'run_id', 'composition', 'Search performance -> run.'),
  ('seo_search_performance_daily', 'web_site', 'site_id', 'composition', 'Search performance -> site.'),
  ('seo_search_performance_daily', 'web_page', 'page_id', 'composition', 'Search performance -> page.'),
  ('seo_serp_snapshot', 'seo_collection_run', 'run_id', 'composition', 'SERP snapshot -> run.'),
  ('seo_serp_snapshot', 'seo_rank_target', 'rank_target_id', 'composition', 'SERP snapshot -> rank target.'),
  ('seo_serp_result', 'seo_serp_snapshot', 'snapshot_id', 'composition', 'SERP result -> snapshot.'),
  ('seo_web_analytics_daily', 'seo_collection_run', 'run_id', 'composition', 'Web analytics -> run.'),
  ('seo_web_analytics_daily', 'web_site', 'site_id', 'composition', 'Web analytics -> site.'),
  ('seo_web_analytics_daily', 'web_page', 'page_id', 'composition', 'Web analytics -> page.')
on conflict (child_type, parent_type, fk_column) do update
set kind = excluded.kind, note = excluded.note;

-- Complete the two existing shareable component roots which previously had no
-- registry parent and therefore resolved to an empty accessible-id set.
insert into platform.entity_relationships(
  child_type, parent_type, fk_column, kind, note
) values
  ('seo_change_set', 'web_site', 'site_id', 'composition', 'Change set -> site.'),
  ('seo_change_set', 'web_page', 'primary_page_id', 'composition', 'Change set -> primary page.')
on conflict (child_type, parent_type, fk_column) do update
set kind = excluded.kind, note = excluded.note;

-- seo.keyword_market is already an entity. Its source observation is the only
-- physical bridge back into the site/run tree.
insert into platform.entity_relationships(
  child_type, parent_type, fk_column, kind, note
) values (
  'seo_keyword_market', 'seo_keyword_market_observation',
  'source_observation_id', 'containment',
  'Derived keyword market -> source observation -> collection run -> site.'
)
on conflict (child_type, parent_type, fk_column) do update
set kind = excluded.kind, note = excluded.note;

-- Reinstall canonical component membranes. Table privileges remain the
-- capability boundary: read-only operational tables receive policies but no
-- INSERT/UPDATE/DELETE grants are added here.
do $$
declare rec record;
begin
  for rec in
    select et.schema_name, et.table_name, et.token
    from platform.entity_types et
    where et.rls_variant = 'component'
      and exists (
        select 1 from platform.entity_relationships er
        where er.child_type = et.token and er.kind = 'composition'
      )
    order by et.schema_name, et.table_name
  loop
    perform iam.apply_rls(rec.schema_name, rec.table_name, rec.token, 'component');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Files referenced by snapshots/screenshots inherit the artifact, not site
-- ---------------------------------------------------------------------------

create or replace function files.crawl_site_conveys(
  p_user_id uuid,
  p_file_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'files', 'web', 'iam'
as $$
  select exists (
    select 1
    from files.files f
    where f.id = p_file_id
      and f.deleted_at is null
      and (
        -- Metadata-only legacy/site artifact.
        exists (
          select 1
          from web.site ws
          where ws.organization_id = f.organization_id
            and ws.deleted_at is null
            and f.metadata ->> 'web_site_id'
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and ws.id = (f.metadata ->> 'web_site_id')::uuid
            and iam.has_access_for(
              p_user_id, 'web_site', ws.id, 'viewer'::public.permission_level
            )
        )
        -- Snapshot body/markdown: a page or snapshot share is sufficient.
        or exists (
          select 1
          from web.snapshot s
          where s.organization_id = f.organization_id
            and s.deleted_at is null
            and (s.body_file_id = f.id or s.markdown_file_id = f.id)
            and iam.has_access_for(
              p_user_id, 'web_snapshot', s.id, 'viewer'::public.permission_level
            )
        )
        -- Screenshot image: a page, snapshot, or screenshot share is sufficient.
        or exists (
          select 1
          from web.screenshot s
          where s.organization_id = f.organization_id
            and s.deleted_at is null
            and s.file_id = f.id
            and iam.has_access_for(
              p_user_id, 'web_screenshot', s.id, 'viewer'::public.permission_level
            )
        )
      )
  );
$$;

comment on function files.crawl_site_conveys(uuid, uuid) is
  'Viewer conveyance for crawl files. Despite the legacy name, the nearest real artifact (snapshot/screenshot) is authoritative, so granular page/artifact shares include their bytes.';

-- ---------------------------------------------------------------------------
-- 6. Relationship drift understands inherited access containers
-- ---------------------------------------------------------------------------

create or replace function platform.entity_type_has_shareable_ancestor(
  p_type text
) returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'platform'
as $$
  with recursive ancestors(token, depth, path) as (
    select p_type, 0, array[p_type]
    union all
    select er.parent_type, a.depth + 1, a.path || er.parent_type
    from ancestors a
    join platform.entity_relationships er on er.child_type = a.token
    where a.depth < 12 and not (er.parent_type = any(a.path))
  )
  select exists (
    select 1
    from ancestors a
    join platform.shareable_resource_registry s
      on s.resource_type = a.token and s.is_active
  );
$$;

comment on function platform.entity_type_has_shareable_ancestor(text) is
  'True when the type is directly shareable or structurally descends from a shareable type. Used by relationship drift: inherited containers can convey access even when they are not direct share targets.';

revoke all on function platform.entity_type_has_shareable_ancestor(text)
from public, anon, authenticated;
grant execute on function platform.entity_type_has_shareable_ancestor(text)
to service_role;

create or replace function public.admin_relationship_problems()
returns table (
  kind text,
  severity text,
  source_type text,
  target_type text,
  label text,
  container_side text,
  edge_count bigint,
  detail text
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'unregistered_pair'::text, 'error'::text,
         a.source_type, a.target_type, a.label, null::text, count(*),
         'Association shape exists in data but no active rule registers it.'::text
  from platform.associations a
  where public.is_super_admin()
    and not exists (
      select 1 from platform.association_types r
      where r.source_type = a.source_type
        and r.target_type = a.target_type
        and (r.label is null or r.label = a.label)
        and r.is_active
    )
  group by a.source_type, a.target_type, a.label

  union all
  select 'wrong_way_edges'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations a
          where a.source_type = r.target_type
            and a.target_type = r.source_type
            and (r.label is null or a.label = r.label)),
         'Edges exist in the reverse direction of this registered pair.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.source_type <> r.target_type
    and not exists (
      select 1 from platform.association_types rr
      where rr.source_type = r.target_type
        and rr.target_type = r.source_type
        and rr.label is not distinct from r.label
        and rr.is_active
    )
    and exists (
      select 1 from platform.associations a
      where a.source_type = r.target_type
        and a.target_type = r.source_type
        and (r.label is null or a.label = r.label)
    )

  union all
  select 'conveying_container_not_shareable'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations a
          where a.source_type = r.source_type
            and a.target_type = r.target_type
            and (r.label is null or a.label = r.label)),
         'This rule conveys access, but its container type has neither a direct share entry nor a structural path from any shareable ancestor.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.container_side <> 'none'
    and not platform.entity_type_has_shareable_ancestor(
      case when r.container_side = 'target' then r.target_type else r.source_type end
    )

  union all
  select 'conveying_rule_no_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side, 0::bigint,
         'Rule conveys access but no associations of this shape exist yet.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.container_side <> 'none'
    and not exists (
      select 1 from platform.associations a
      where a.source_type = r.source_type
        and a.target_type = r.target_type
        and (r.label is null or a.label = r.label)
    )

  union all
  select 'inactive_rule_with_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations a
          where a.source_type = r.source_type
            and a.target_type = r.target_type
            and (r.label is null or a.label = r.label)),
         'Rule is inactive but associations of this shape still exist.'::text
  from platform.association_types r
  where public.is_super_admin()
    and not r.is_active
    and exists (
      select 1 from platform.associations a
      where a.source_type = r.source_type
        and a.target_type = r.target_type
        and (r.label is null or a.label = r.label)
    )
  order by 2, 7 desc;
$$;

revoke all on function public.admin_relationship_problems() from public, anon;
grant execute on function public.admin_relationship_problems()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Fail loudly if any canonical marketing node is detached
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  select string_agg(et.token, ', ' order by et.token) into v_missing
  from platform.entity_types et
  where et.category = 'marketing'
    and et.is_active
    and et.token not in ('web_brand')
    and not exists (
      select 1 from platform.entity_relationships er
      where er.child_type = et.token
        and er.kind in ('composition', 'containment')
    );
  if v_missing is not null then
    raise exception 'marketing access hierarchy has detached tokens: %', v_missing;
  end if;

  if exists (
    select 1
    from platform.association_types r
    where r.target_type = 'web_screenshot'
      and r.source_type in ('note', 'file')
      and (r.container_side <> 'target' or r.conveys_max <> 'viewer')
  ) then
    raise exception 'screenshot note/file conveyance is not target-container viewer access';
  end if;
end;
$$;
