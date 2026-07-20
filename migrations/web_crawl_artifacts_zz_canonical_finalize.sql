-- Replay-safe final state for crawler artifacts. This migration intentionally
-- sorts after every immutable cutover migration and reasserts the live contract
-- with type-safe JSON predicates, caller-bound helpers, and private artifacts.

alter table web.snapshot
  add column if not exists body_file_id uuid,
  add column if not exists markdown_file_id uuid;
alter table web.screenshot add column if not exists file_id uuid;

alter table web.snapshot alter column body_file_id set not null;
alter table web.screenshot alter column file_id set not null;
alter table web.snapshot drop column if exists body_ref;
alter table web.screenshot drop column if exists storage_bucket;
alter table web.screenshot drop column if exists storage_path;

create or replace function files.is_crawl_artifact(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, web
as $$
  select exists (
    select 1 from files.files f
    where f.id = p_file_id
      and f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
  ) or exists (
    select 1 from web.snapshot s
    where s.body_file_id = p_file_id or s.markdown_file_id = p_file_id
  ) or exists (
    select 1 from web.screenshot s where s.file_id = p_file_id
  );
$$;

create or replace function files.has_access_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, platform, web, iam, auth
as $$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
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
        and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
        and f.metadata ->> 'web_site_id' = ws.id::text
        and (
          exists (
            select 1 from web.snapshot s
            where s.site_id = ws.id and s.organization_id = ws.organization_id
              and s.deleted_at is null
              and (s.body_file_id = f.id or s.markdown_file_id = f.id)
          ) or exists (
            select 1 from web.screenshot s
            where s.site_id = ws.id and s.organization_id = ws.organization_id
              and s.deleted_at is null and s.file_id = f.id
          )
        )
        and iam.has_access_for_base(
          p_user_id, 'web_site', ws.id, 'viewer'::public.permission_level
        )
    )
    else iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
  end;
$$;

-- Preserve generic discovery behind a private base and dispatch every file
-- question through the crawler-aware wrapper.
create or replace function iam.is_discoverable_base(
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
         and iam.is_discoverable_base(v_uid, rec.parent_type, v_parent_id, p_required)
      then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create or replace function files.is_discoverable_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, iam, auth
as $$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
    else not files.is_crawl_artifact(p_file_id)
      and not files.has_web_site_edge(p_file_id)
      and iam.is_discoverable_base(p_user_id, 'file', p_file_id, p_required)
  end;
$$;

create or replace function iam.is_discoverable(
  p_user_id uuid,
  p_type text,
  p_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, iam, auth
as $$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
    when p_type = 'file'
      then files.is_discoverable_for(p_user_id, p_id, p_required)
    else iam.is_discoverable_base(p_user_id, p_type, p_id, p_required)
  end;
$$;

create or replace function web.assert_crawl_artifact_file(
  p_file_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_session_id uuid,
  p_mime_prefix text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, files, web, platform
as $$
begin
  if p_file_id is null then return; end if;
  if not exists (
    select 1 from files.files f
    where f.id = p_file_id and f.organization_id = p_organization_id
      and f.deleted_at is null and f.visibility::text = 'private'
      and f.mime_type like p_mime_prefix || '%'
      and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
      and f.metadata ->> 'web_site_id' = p_site_id::text
      and f.metadata ->> 'crawl_session_id' = p_session_id::text
      and exists (
        select 1 from platform.associations a
        where a.source_type = 'file' and a.source_id = f.id
          and a.target_type = 'web_site' and a.target_id = p_site_id
          and a.organization_id = p_organization_id and a.role = 'crawl_artifact'
      )
  ) then
    raise exception 'invalid canonical crawl artifact file %', p_file_id
      using errcode = '23514';
  end if;
end;
$$;

create or replace function web.validate_snapshot_artifact_files()
returns trigger
language plpgsql
set search_path = pg_catalog, web
as $$
begin
  perform web.assert_crawl_artifact_file(
    new.body_file_id, new.organization_id, new.site_id, new.session_id, 'text/html'
  );
  perform web.assert_crawl_artifact_file(
    new.markdown_file_id, new.organization_id, new.site_id, new.session_id,
    'text/markdown'
  );
  return new;
end;
$$;

create or replace function web.validate_screenshot_artifact_file()
returns trigger
language plpgsql
set search_path = pg_catalog, web
as $$
declare v_session_id uuid;
begin
  select s.session_id into v_session_id
  from web.snapshot s
  where s.id = new.snapshot_id
    and s.organization_id = new.organization_id
    and s.site_id = new.site_id
    and s.page_id = new.page_id;
  if v_session_id is null then
    raise exception 'screenshot context does not match snapshot %', new.snapshot_id
      using errcode = '23514';
  end if;
  perform web.assert_crawl_artifact_file(
    new.file_id, new.organization_id, new.site_id, v_session_id, 'image/png'
  );
  return new;
end;
$$;

drop trigger if exists snapshot_validate_artifact_files on web.snapshot;
create trigger snapshot_validate_artifact_files
before insert or update on web.snapshot
for each row execute function web.validate_snapshot_artifact_files();

drop trigger if exists screenshot_validate_artifact_file on web.screenshot;
create trigger screenshot_validate_artifact_file
before insert or update on web.screenshot
for each row execute function web.validate_screenshot_artifact_file();

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
    ) or exists (select 1 from web.screenshot s where s.file_id = v_file_id) then
      raise exception 'referenced crawl artifact association for file % is immutable', v_file_id
        using errcode = '55000';
    end if;
  end if;
  if v_new_managed and (
    new.role is distinct from 'crawl_artifact'
    or not exists (
      select 1 from files.files f
      join web.site s on s.id = new.target_id and s.deleted_at is null
      where f.id = new.source_id and f.deleted_at is null
        and f.organization_id = new.organization_id
        and s.organization_id = new.organization_id
        and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
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

alter policy std_select on files.files
  using (files.has_access_for((select auth.uid()), id, 'viewer'));
alter policy std_update on files.files
  using (files.has_access_for((select auth.uid()), id, 'editor'))
  with check (files.has_access_for((select auth.uid()), id, 'editor'));
alter policy std_delete on files.files
  using (files.has_access_for((select auth.uid()), id, 'admin'));
alter policy pub_read on files.files
  using (
    deleted_at is null and visibility = 'public'::platform.visibility
    and not (metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb)
  );

drop function if exists files.can_read_web_artifact(uuid);

-- Remove every inherited/explicit client grant before granting only the exact
-- caller-bound surface required by authenticated RLS.
revoke all on function files.has_access_for(uuid, uuid, public.permission_level)
  from public, anon, authenticated;
grant execute on function files.has_access_for(uuid, uuid, public.permission_level)
  to authenticated, service_role;
revoke all on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  from public, anon, authenticated;
grant execute on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  to service_role;
revoke all on function files.has_web_site_edge(uuid)
  from public, anon, authenticated;
grant execute on function files.has_web_site_edge(uuid) to service_role;
revoke all on function files.is_crawl_artifact(uuid)
  from public, anon, authenticated;
grant execute on function files.is_crawl_artifact(uuid) to service_role;
revoke all on function files.reject_web_artifact_file_mutation()
  from public, anon, authenticated;
revoke all on function platform.enforce_managed_file_web_site_association()
  from public, anon, authenticated;
revoke all on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  to service_role;
revoke all on function iam.is_discoverable_base(uuid, text, uuid, public.permission_level)
  from public, anon, authenticated;
revoke all on function iam.is_discoverable(uuid, text, uuid, public.permission_level)
  from public, anon, authenticated;
grant execute on function iam.is_discoverable(uuid, text, uuid, public.permission_level)
  to service_role;
