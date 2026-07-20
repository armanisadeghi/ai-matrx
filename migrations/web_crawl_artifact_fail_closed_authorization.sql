-- Make crawler artifacts fail closed across every database file-access path.
-- The file -> web_site relationship is a service-managed invariant, not a
-- user-editable association. Missing, forged, cross-tenant, or noncanonical
-- edges must deny access and must never fall back to historical file ownership.

create or replace function files.has_web_site_edge(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, platform
as $$
  select exists (
    select 1
    from platform.associations a
    where a.source_type = 'file'
      and a.source_id = p_file_id
      and a.target_type = 'web_site'
  );
$$;

create or replace function files.is_crawl_artifact(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, web
as $$
  select exists (
    select 1
    from files.files f
    where f.id = p_file_id
      and coalesce((f.metadata ->> 'system_artifact')::boolean, false)
      and f.metadata ->> 'artifact_domain' = 'web_crawl'
  ) or exists (
    select 1
    from web.snapshot s
    where s.body_file_id = p_file_id or s.markdown_file_id = p_file_id
  ) or exists (
    select 1 from web.screenshot s where s.file_id = p_file_id
  );
$$;

revoke all on function files.has_web_site_edge(uuid) from public;
revoke all on function files.is_crawl_artifact(uuid) from public;

-- Preserve the generic IAM implementation behind a private base function.
-- The public iam.has_access_for signature is replaced below with a dispatcher,
-- so every existing policy/function dependency on that OID uses the canonical
-- crawler-aware file judge.
create or replace function iam.has_access_for_base(
  p_user_id uuid,
  p_type text,
  p_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, platform, iam, rag
as $$
declare
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid; v_c_found boolean;
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
    where child_type = p_type and kind = 'composition'
    limit 1;
    if v_parent_type is null then return false; end if;
    execute format('select %I from %I.%I where id=$1', v_parent_col, v_schema, v_table)
      into v_parent_id using p_id;
    if v_parent_id is null then return false; end if;
    return iam.has_access_for(v_uid, v_parent_type, v_parent_id, p_required);
  end if;

  if p_type = 'data_store' and p_required = 'viewer'
       and public.user_can_read_data_store_via_grant(v_uid, p_id) then
    return true;
  end if;

  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then return false; end if;

  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer' and v_org is not null
       and public.is_org_admin_for(v_uid, v_org) then return true; end if;
  if v_vis = 'public' and p_required = 'viewer' then return true; end if;

  if p_required = 'viewer'
       and v_vis >= 'internal'::platform.visibility
       and v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable)
  then return true; end if;

  if v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable)
       and public.is_super_admin_for(v_uid)
  then return true; end if;

  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;

  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g
      on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required
  ) then return true; end if;

  if p_required = 'viewer'
       and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then
    return true;
  end if;

  for rec in
    select r.container_type, r.container_id
    from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id
      and r.max_level >= p_required
  loop
    if public.has_permission_for(v_uid, rec.container_type, rec.container_id, p_required)
    then return true; end if;
    if rec.container_type = 'data_store' and p_required = 'viewer'
         and public.user_can_read_data_store_via_grant(v_uid, rec.container_id)
    then return true; end if;
    if exists (
      select 1 from iam.memberships m
      join iam.membership_grant g
        on g.member_role = m.role and g.container_type in (rec.container_type, '*')
      where m.container_type = rec.container_type and m.container_id = rec.container_id
        and m.user_id = v_uid and m.deleted_at is null and g.confers >= p_required
    ) then return true; end if;
    select et.schema_name, et.table_name into v_c_schema, v_c_table
    from platform.entity_types et where et.token = rec.container_type;
    if v_c_schema is not null then
      select * into v_c_vis, v_c_owner, v_c_org, v_c_found
      from platform.entity_row_access_attrs(v_c_schema, v_c_table, rec.container_id);
      if v_c_owner = v_uid then return true; end if;
      if p_required = 'viewer' and v_c_vis is not null then
        if v_c_vis = 'public' then return true; end if;
        if v_c_vis >= 'internal'::platform.visibility
             and v_c_org is not null and iam.has_org_access_for(v_uid, v_c_org)
        then return true; end if;
      end if;
    end if;
  end loop;

  if v_vis >= 'internal'::platform.visibility and v_org is not null
       and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  if v_vis >= 'internal'::platform.visibility then
    for rec in
      select parent_type, fk_column from platform.entity_relationships
      where child_type = p_type and kind = 'containment'
    loop
      execute format('select %I from %I.%I where id=$1', rec.fk_column, v_schema, v_table)
        into v_parent_id using p_id;
      if v_parent_id is not null
           and iam.has_access_for(v_uid, rec.parent_type, v_parent_id, p_required)
      then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function iam.has_access_for_base(uuid, text, uuid, public.permission_level)
  from public;

create or replace function files.has_access_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, platform, web, iam
as $$
  select case
    when p_user_id is null then false
    when files.is_crawl_artifact(p_file_id) or files.has_web_site_edge(p_file_id)
    then p_required = 'viewer'::public.permission_level and exists (
      select 1
      from files.files f
      join platform.associations a
        on a.source_type = 'file' and a.source_id = f.id
       and a.target_type = 'web_site' and a.role = 'crawl_artifact'
      join platform.association_types at
        on at.source_type = a.source_type and at.target_type = a.target_type
       and at.is_active and at.container_side = 'target'
       and at.conveys_max = 'viewer'::public.permission_level
      join web.site ws on ws.id = a.target_id and ws.deleted_at is null
      where f.id = p_file_id
        and f.deleted_at is null
        and f.organization_id = a.organization_id
        and ws.organization_id = a.organization_id
        and coalesce((f.metadata ->> 'system_artifact')::boolean, false)
        and coalesce((f.metadata ->> 'system_immutable')::boolean, false)
        and f.metadata ->> 'artifact_domain' = 'web_crawl'
        and f.metadata ->> 'web_site_id' = ws.id::text
        and (
          exists (
            select 1 from web.snapshot s
            where s.site_id = ws.id and s.organization_id = ws.organization_id
              and (s.body_file_id = f.id or s.markdown_file_id = f.id)
          ) or exists (
            select 1 from web.screenshot s
            where s.site_id = ws.id and s.organization_id = ws.organization_id
              and s.file_id = f.id
          )
        )
        and iam.has_access_for_base(
          p_user_id, 'web_site', ws.id, 'viewer'::public.permission_level
        )
    )
    else iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
  end;
$$;

create or replace function iam.has_access_for(
  p_user_id uuid,
  p_type text,
  p_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, iam
as $$
  select case
    when p_type = 'file' then files.has_access_for(p_user_id, p_id, p_required)
    else iam.has_access_for_base(p_user_id, p_type, p_id, p_required)
  end;
$$;

revoke all on function files.has_access_for(uuid, uuid, public.permission_level)
  from public;
grant execute on function files.has_access_for(uuid, uuid, public.permission_level)
  to authenticated, service_role;

create or replace function files.is_discoverable_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, iam
as $$
  select not files.is_crawl_artifact(p_file_id)
     and not files.has_web_site_edge(p_file_id)
     and iam.is_discoverable(p_user_id, 'file', p_file_id, p_required);
$$;

revoke all on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  from public;
grant execute on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  to authenticated, service_role;

-- Existing dependencies on iam.has_access[_for] now dispatch file questions to
-- files.has_access_for. The direct files policies do the same for every action.
alter policy std_select on files.files
  using (files.has_access_for((select auth.uid()), id, 'viewer'));
alter policy std_update on files.files
  using (files.has_access_for((select auth.uid()), id, 'editor'))
  with check (files.has_access_for((select auth.uid()), id, 'editor'));
alter policy std_delete on files.files
  using (files.has_access_for((select auth.uid()), id, 'admin'));

-- The entire pair is service-managed. The scraper inserts the edge before the
-- web row in one server-side transaction; ordinary JWT callers can never add,
-- repoint, relabel, or remove it. Referenced edges cannot be changed even by a
-- trusted maintenance connection: remove the web rows first during a purge.
create or replace function platform.enforce_managed_file_web_site_association()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, files, platform, web, auth
as $$
declare
  v_old_managed boolean := false;
  v_new_managed boolean := false;
  v_file_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_managed := old.source_type = 'file' and old.target_type = 'web_site';
  end if;
  if tg_op <> 'DELETE' then
    v_new_managed := new.source_type = 'file' and new.target_type = 'web_site';
  end if;

  if not v_old_managed and not v_new_managed then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'file -> web_site associations are service-managed'
      using errcode = '42501';
  end if;

  if v_old_managed then
    v_file_id := old.source_id;
    if exists (
      select 1 from web.snapshot s
      where s.body_file_id = v_file_id or s.markdown_file_id = v_file_id
    ) or exists (
      select 1 from web.screenshot s where s.file_id = v_file_id
    ) then
      raise exception 'referenced crawl artifact association for file % is immutable', v_file_id
        using errcode = '55000';
    end if;
  end if;

  if v_new_managed and (
    new.role is distinct from 'crawl_artifact'
    or not exists (
      select 1
      from files.files f
      join web.site s on s.id = new.target_id and s.deleted_at is null
      where f.id = new.source_id and f.deleted_at is null
        and f.organization_id = new.organization_id
        and s.organization_id = new.organization_id
        and coalesce((f.metadata ->> 'system_artifact')::boolean, false)
        and coalesce((f.metadata ->> 'system_immutable')::boolean, false)
        and f.metadata ->> 'artifact_domain' = 'web_crawl'
        and f.metadata ->> 'web_site_id' = s.id::text
    )
  ) then
    raise exception 'invalid canonical file -> web_site crawl artifact association'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function platform.enforce_managed_file_web_site_association()
  from public;

-- The pair was introduced solely for crawler artifacts. Remove any malformed
-- pre-trigger edges (the current cutover data is disposable and canonical rows
-- are retained).
delete from platform.associations a
where a.source_type = 'file' and a.target_type = 'web_site'
  and (
    a.role is distinct from 'crawl_artifact'
    or not exists (
      select 1 from files.files f join web.site s on s.id = a.target_id
      where f.id = a.source_id
        and f.organization_id = a.organization_id
        and s.organization_id = a.organization_id
        and f.metadata ->> 'artifact_domain' = 'web_crawl'
        and f.metadata ->> 'web_site_id' = s.id::text
    )
  );

drop trigger if exists associations_enforce_managed_file_web_site
  on platform.associations;
create trigger associations_enforce_managed_file_web_site
before insert or update or delete on platform.associations
for each row execute function platform.enforce_managed_file_web_site_association();

-- SECURITY DEFINER discovery and association RPCs must not be executable by
-- PUBLIC/anon. Authenticated RPCs retain their own-user guard; service_role is
-- the trusted server boundary.
revoke all on function public.count_user_files(uuid, boolean, boolean)
  from public, anon;
revoke all on function public.get_org_file_list(uuid, uuid)
  from public, anon;
revoke all on function public.search_files(uuid, text, integer, integer, text)
  from public, anon;
revoke all on function public.get_user_file_tree(uuid, integer, integer, boolean, boolean, text)
  from public, anon;
grant execute on function public.count_user_files(uuid, boolean, boolean),
  public.get_org_file_list(uuid, uuid),
  public.search_files(uuid, text, integer, integer, text),
  public.get_user_file_tree(uuid, integer, integer, boolean, boolean, text)
  to authenticated, service_role;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('assoc_add', 'assoc_remove', 'assoc_set_targets')
  loop
    execute format('revoke all on function %s from public, anon', r.signature);
    execute format('grant execute on function %s to authenticated, service_role', r.signature);
  end loop;
end;
$$;
