-- iam_org_internal_lane_editor_cap.sql
--
-- THE ORG-INTERNAL LANE GETS ITS LEVEL RULE (Arman ruling, 2026-08-12).
--
-- WHAT WAS WRONG: the org-internal lane in the access kernels —
--   "visibility >= 'internal' AND caller is in the owning org → true"
-- — had NO level guard, while every neighboring lane is level-guarded. A plain
-- `member`-role org member therefore passed viewer, editor, AND admin on every
-- internal row org-wide (verified live: real RLS UPDATE + hard DELETE of the
-- owner's note as a plain member, plus `entity_soft_delete` and
-- `access_request_decide` admin gates). That made `iam.membership_grant`'s
-- grading decorative and let any member hard-delete org work or silently
-- approve outsiders' access requests. The lane has carried plain
-- "return true" since the earliest traceable resolver (2026-06-27) with no
-- recorded decision — an accident that survived, not a ruling.
--
-- THE RATIFIED RULE (editor-cap, NOT viewer):
--   * Plain org member on internal+ org rows  → up to EDITOR.
--     Org work product stays collectively owned and editable — nothing is
--     taken from a working person. (Role-mapping members to viewer via
--     membership_grant was considered and REJECTED as over-tightening: the
--     org role vocabulary has no `editor`, so members would have lost the
--     ability to edit shared work — a blocked legitimate worker.)
--   * Org owner/admin on internal+ org rows   → ADMIN (their previously
--     implicit power, now stated). Their viewer-read of `personal`-visibility
--     org rows is unchanged.
--   * Creator always passes everything (unchanged). Explicit grants,
--     memberships, reachability, structural parents: all unchanged.
--
-- What members LOSE: admin-gated ops on rows they didn't create — hard/soft
-- delete of others' work (std_delete RLS, entity_soft_delete, hard_delete_file,
-- crm_party_purge), deciding access requests (access_request_decide), and the
-- files grant-management family. Governance belongs to org owners/admins.
--
-- FOUR bodies carry the lane; all four get the same rule in this migration
-- (the PARITY OBLIGATION of access-architecture FEATURE.md §5):
--   iam.has_access_for_base, iam.is_discoverable_base,
--   iam.accessible_entity_ids, iam.discoverable_ids.
-- iam.apply_config_rls's generated cfg_select uses the lane for READ only —
-- correct as-is, untouched.

BEGIN;

-- ── 1. iam.has_access_for_base ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
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

  -- Org work product is collectively owned and EDITABLE: any active org
  -- member passes up to editor on internal+ rows. GOVERNANCE (admin level —
  -- deleting others' work, deciding access requests, managing grants) belongs
  -- to org owners/admins. Editor-cap ruling: Arman 2026-08-12
  -- (SHARING_MODEL.md §5). Viewer-mapping was rejected as over-tightening.
  if v_vis >= 'internal'::platform.visibility
     and v_org is not null
  then
    if public.is_org_admin_for(v_uid, v_org) then
      return true;
    end if;
    if p_required <= 'editor'::public.permission_level
       and iam.has_org_access_for(v_uid, v_org)
    then
      return true;
    end if;
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
$function$;

-- ── 2. iam.is_discoverable_base ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION iam.is_discoverable_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  rec record;
begin
  if v_uid is null then return false; end if;
  select schema_name, table_name, coalesce(is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types where token = p_type;
  if v_schema is null then return false; end if;
  if v_is_component then
    select parent_type, fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships
    where child_type = p_type and kind = 'composition' limit 1;
    if v_parent_type is null then return false; end if;
    execute format('select %I from %I.%I where id=$1', v_parent_col, v_schema, v_table)
      into v_parent_id using p_id;
    if v_parent_id is null then return false; end if;
    return iam.is_discoverable_base(v_uid, v_parent_type, v_parent_id, p_required);
  end if;
  if p_type = 'data_store' and p_required = 'viewer'
       and public.user_can_read_data_store_via_grant(v_uid, p_id) then return true; end if;
  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer' and v_org is not null
       and public.is_org_admin_for(v_uid, v_org) then return true; end if;
  if v_vis = 'public' and p_required = 'viewer' then return true; end if;
  if p_required = 'viewer' and v_vis >= 'internal'::platform.visibility
       and v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable)
  then return true; end if;
  if v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable)
       and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g
      on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id
      and m.user_id = v_uid and m.deleted_at is null and g.confers >= p_required
  ) then return true; end if;
  -- Org-internal lane: members up to editor; governance (admin) is
  -- owner/admin-role only. Editor-cap ruling: Arman 2026-08-12.
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if public.is_org_admin_for(v_uid, v_org) then return true; end if;
    if p_required <= 'editor'::public.permission_level
       and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  if v_vis >= 'internal'::platform.visibility then
    for rec in
      select parent_type, fk_column from platform.entity_relationships
      where child_type = p_type and kind = 'containment'
    loop
      execute format('select %I from %I.%I where id=$1', rec.fk_column, v_schema, v_table)
        into v_parent_id using p_id;
      if v_parent_id is not null
         and iam.is_discoverable_base(v_uid, rec.parent_type, v_parent_id, p_required)
      then return true; end if;
    end loop;
  end if;
  return false;
end;
$function$;

-- ── 3. iam.accessible_entity_ids (the component-RLS membrane) ───────────────

CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level DEFAULT 'viewer'::permission_level, p_depth integer DEFAULT 0)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
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
  -- The visibility lane exists only for the CANONICAL access column. A domain
  -- column that happens to be named "visibility" (numeric SERP index, text
  -- status, ...) must degrade to no-lane, never be compared against enum
  -- labels: numeric crashed every read of seo.competitor* (2026-08-12), and
  -- text would collate 'personal' >= 'internal' and over-expose.
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema
      and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform'
      and c.udt_name = 'visibility'
  ) into v_has_vis;

  -- Direct/mass lanes are valid for entities and components alike. Registry
  -- controls which types may receive new shares; the kernel faithfully honors
  -- any valid direct grant that already exists.
  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false'
  end;
  -- Org-internal lane, level-ruled (editor-cap ruling, Arman 2026-08-12):
  -- viewer/editor → any active org member; admin → org owner/admin role only.
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1))';
    else
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
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
$function$;

-- ── 4. iam.discoverable_ids (the enumeration twin) ──────────────────────────

CREATE OR REPLACE FUNCTION iam.discoverable_ids(p_user_id uuid, p_type text, p_required permission_level DEFAULT 'viewer'::permission_level, p_depth integer DEFAULT 0)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
declare
  v_uid          uuid := p_user_id;
  v_schema       text;
  v_table        text;
  v_is_component boolean;
  v_tbl          text;
  v_owner_col    text;
  v_has_org      boolean;
  v_has_vis      boolean;
  v_parent_type  text;
  v_parent_col   text;
  v_parent_ids   uuid[];
  v_more         uuid[];
  v_trusted      text;
  v_sql          text;
  v_ids          uuid[] := '{}';
  rec            record;
begin
  if v_uid is null or p_depth > 4 then
    return '{}'::uuid[];
  end if;
  -- Anti-spoof (same contract as iam.is_discoverable): an authenticated
  -- caller may only enumerate for themselves; anon enumerates nothing.
  -- Server-side (postgres/service_role) auth.role() is null and passes.
  if auth.role() = 'anon' then
    return '{}'::uuid[];
  end if;
  if auth.role() = 'authenticated'
     and (auth.uid() is null or auth.uid() is distinct from p_user_id) then
    return '{}'::uuid[];
  end if;

  select et.schema_name, et.table_name, coalesce(et.is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types et
  where et.token = p_type;
  if v_schema is null then
    return '{}'::uuid[];
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = 'organization_id') into v_has_org;
  -- Canonical-type guard — see iam.accessible_entity_ids (migration 0338):
  -- a domain column named "visibility" that is not platform.visibility gets
  -- NO visibility lane (fail-closed) instead of a crash or a text mis-rank.
  select exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = 'visibility'
                   and c.udt_schema = 'platform'
                   and c.udt_name = 'visibility') into v_has_vis;

  -- A component is discoverable iff ITS composition parent is (plus the
  -- parent-optional owner arm when the FK is nullable).
  if v_is_component then
    select er.parent_type, er.fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships er
    where er.child_type = p_type and er.kind = 'composition'
    limit 1;
    if v_parent_type is null then
      return '{}'::uuid[];
    end if;
    v_parent_ids := iam.discoverable_ids(v_uid, v_parent_type, p_required, p_depth + 1);
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t where t.%I = any($1)%s',
      v_tbl, v_parent_col,
      case when v_owner_col is not null
           then format(' or (t.%I is null and t.%I = $2)', v_parent_col, v_owner_col)
           else '' end);
    execute v_sql into v_ids using v_parent_ids, v_uid;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;

  -- 1) Trusted set-wise lanes — exact mirrors of is_discoverable_base's
  --    cheap always-true arms.
  v_trusted := case when v_owner_col is not null
                    then format('t.%I = $1', v_owner_col)
                    else 'false' end;
  -- Org-internal lane, level-ruled (editor-cap ruling, Arman 2026-08-12):
  -- viewer/editor → any active org member; admin → org owner/admin role only.
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'''
        || ' and t.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = $1))';
    else
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'''
        || ' and t.organization_id in (select om.organization_id from iam.organization_member om'
        || '                           where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || ' or t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)';
  end if;
  -- VIEWER only: public rows, internal+ rows in global_readable system orgs,
  -- and org-admin's org rows regardless of visibility.
  if p_required = 'viewer' then
    if v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      if v_has_org then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'''
          || ' and t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    if v_has_org then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id from iam.organization_member om'
        || '                          where om.user_id = $1 and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format('select coalesce(array_agg(t.id), ''{}'') from %s t where %s', v_tbl, v_trusted);
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- 2) Sparse candidate lanes (grants + memberships — NO reachability),
  --    each candidate confirmed by THE discoverability authority.
  for rec in
    select distinct c.id from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (p.granted_to_user_id = v_uid
             or p.granted_to_organization_id in
                (select om.organization_id from iam.organization_member om where om.user_id = v_uid))
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
    ) c
    where not (c.id = any (v_ids))
  loop
    if iam.is_discoverable(v_uid, p_type, rec.id, p_required) then
      v_ids := v_ids || rec.id;
    end if;
  end loop;

  -- 3) Containment recursion: internal+ rows under a discoverable
  --    containment parent.
  if v_has_vis then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_type and er.kind = 'containment'
    loop
      if exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = rec.fk_column) then
        v_parent_ids := iam.discoverable_ids(v_uid, rec.parent_type, p_required, p_depth + 1);
        if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
          v_sql := format(
            'select coalesce(array_agg(t.id), ''{}'') from %s t
             where t.visibility >= ''internal'' and t.%I = any($1) and not (t.id = any($2))',
            v_tbl, rec.fk_column);
          execute v_sql into v_more using v_parent_ids, v_ids;
          v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
        end if;
      end if;
    end loop;
  end if;

  return v_ids;
end;
$function$;

COMMIT;
