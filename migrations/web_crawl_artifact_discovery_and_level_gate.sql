-- Contextual crawler artifacts convey read-only access and never participate
-- in global Files enumeration. This closes two gaps in the initial file gate:
-- the web_site container cannot convey editor/admin through a viewer edge, and
-- files.files.created_by cannot make an artifact discoverable after transfer.

create or replace function files.has_access_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, platform, iam
as $$
  select case
    when p_user_id is null then false
    when exists (
      select 1
      from platform.associations a
      where a.source_type = 'file'
        and a.source_id = p_file_id
        and a.target_type = 'web_site'
        and a.role = 'crawl_artifact'
    ) then p_required = 'viewer'::public.permission_level and exists (
      select 1
      from platform.associations a
      join platform.association_types at
        on at.source_type = a.source_type
       and at.target_type = a.target_type
       and at.is_active
      where a.source_type = 'file'
        and a.source_id = p_file_id
        and a.target_type = 'web_site'
        and a.role = 'crawl_artifact'
        and at.container_side = 'target'
        and at.conveys_max = 'viewer'::public.permission_level
        and iam.has_access_for(
          p_user_id,
          'web_site',
          a.target_id,
          'viewer'
        )
    )
    else iam.has_access_for(p_user_id, 'file', p_file_id, p_required)
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
set search_path = pg_catalog, public, files, platform, iam
as $$
  select not exists (
    select 1
    from platform.associations a
    where a.source_type = 'file'
      and a.source_id = p_file_id
      and a.target_type = 'web_site'
      and a.role = 'crawl_artifact'
  ) and iam.is_discoverable(p_user_id, 'file', p_file_id, p_required);
$$;

revoke all on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  from public;
grant execute on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  to authenticated, service_role;

create or replace function public.count_user_files(
  p_user_id uuid,
  p_include_folders boolean default true,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
stable
security definer
as $$
declare v_files int; v_folders int;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()' using errcode = '42501';
  end if;
  select count(*) into v_files from files.files f
  where (p_include_deleted or f.deleted_at is null)
    and f.parent_file_id is null
    and f.file_path not like 'system-files/%'
    and files.is_discoverable_for(p_user_id, f.id, 'viewer');
  if p_include_folders then
    select count(*) into v_folders from files.folders d
    where (p_include_deleted or d.deleted_at is null) and d.created_by = p_user_id;
  else
    v_folders := 0;
  end if;
  return jsonb_build_object('files', v_files, 'folders', v_folders, 'total', v_files + v_folders);
end;
$$;

create or replace function public.get_org_file_list(
  p_user_id uuid,
  p_org_id uuid
)
returns jsonb
language plpgsql
stable
security definer
as $$
declare v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_result
  from (
    select f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at
    from files.files f
    where f.organization_id = p_org_id
      and f.deleted_at is null
      and files.is_discoverable_for(p_user_id, f.id, 'viewer')
    order by f.updated_at desc nulls last
  ) t;
  return v_result;
end;
$$;

create or replace function public.search_files(
  p_user_id uuid,
  p_query text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_mime_prefix text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_limit := least(greatest(p_limit, 1), 200);
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select id, file_path, file_name, mime_type, size_bytes, visibility,
             current_version, parent_folder_id, created_by, created_at, updated_at
      from files.files
      where deleted_at is null
        and parent_file_id is null
        and file_path not like 'system-files/%'
        and file_path not like 'generations/%'
        and (p_mime_prefix is null or mime_type like p_mime_prefix || '%')
        and (lower(file_name) like '%' || lower(p_query) || '%'
             or lower(file_path) like '%' || lower(p_query) || '%')
        and files.is_discoverable_for(p_user_id, id, 'viewer')
      order by updated_at desc
      limit p_limit offset p_offset
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_user_file_tree(
  p_user_id uuid,
  p_limit integer default 5000,
  p_offset integer default 0,
  p_include_folders boolean default true,
  p_include_deleted boolean default false,
  p_order_by text default 'name'
)
returns jsonb
language plpgsql
stable
security definer
as $$
declare v_result jsonb; v_order text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()' using errcode = '42501';
  end if;
  p_limit := least(greatest(p_limit, 1), 5000);
  v_order := case lower(coalesce(p_order_by, 'name'))
    when 'updated_at_desc' then '13 DESC NULLS LAST'
    when 'created_at_desc' then '12 DESC NULLS LAST'
    when 'name' then '5' else '5' end;
  execute format($q$
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    from (
      select 'file'::text as kind, f.id, f.created_by,
        f.file_path as path, f.file_name as name, f.parent_folder_id as parent_id,
        f.mime_type, f.size_bytes, f.visibility, f.current_version,
        f.metadata, f.created_at, f.updated_at, f.deleted_at,
        case when files.has_access_for(%L, f.id, 'admin') then 'admin'
             when files.has_access_for(%L, f.id, 'editor') then 'editor'
             when files.has_access_for(%L, f.id, 'viewer') then 'viewer'
             else null end as effective_permission
      from files.files f
      where (%L or f.deleted_at is null)
        and f.parent_file_id is null
        and not is_system_path(f.file_path)
        and files.is_discoverable_for(%L, f.id, 'viewer')
      union all
      select 'folder'::text as kind, d.id, d.created_by,
        d.folder_path as path, d.folder_name as name, d.parent_id,
        null::text as mime_type, null::bigint as size_bytes,
        d.visibility, null::int as current_version,
        d.metadata, d.created_at, d.updated_at, d.deleted_at,
        case when d.created_by = %L then 'admin' else null end as effective_permission
      from files.folders d
      where %L and (%L or d.deleted_at is null) and d.created_by = %L
        and not is_system_path(d.folder_path)
      order by %s limit %s offset %s
    ) t
  $q$,
    p_user_id, p_user_id, p_user_id,
    p_include_deleted, p_user_id,
    p_user_id, p_include_folders, p_include_deleted, p_user_id,
    v_order, p_limit, p_offset
  ) into v_result;
  return v_result;
end;
$$;
