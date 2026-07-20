-- files_listing_owner_grant_only.sql
--
-- SECURITY FIX (regression of the "other users' files in my file list" leak).
--
-- Root cause: the personal file ENUMERATION surfaces (get_user_file_tree,
-- search_files, count_user_files) gated rows with files.is_discoverable_for →
-- iam.is_discoverable_base, which is an ACCESS predicate: it intentionally
-- returns true for visibility='public' files (and org/internal branches) so
-- that direct, contextual access to a known file id works. Feeding an access
-- predicate to a listing surface let every public file on the platform flood
-- every user's "my files" tree/search/count.
--
-- Doctrine established by this migration:
--   LISTING surfaces ("my files" tree, search, counts, pickers) may ONLY show
--   files the user OWNS or was EXPLICITLY GRANTED (iam.permissions row or an
--   explicit iam.memberships grant on the file). Visibility (public/internal),
--   org membership, and containment reachability NEVER admit a row into a
--   personal listing. Access-by-id (open a link, resolve a reference) keeps
--   using files.has_access_for / is_discoverable_for as before.
--
-- New primitive: files.is_listable_for(user, file). Any future listing RPC or
-- picker query MUST use it. Never point a listing surface at
-- is_discoverable_for / has_access_for again.

create or replace function files.is_listable_for(
  p_user_id uuid,
  p_file_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, iam, auth
as $$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
    when p_user_id is null then false
    else exists (
      select 1
      from files.files f
      where f.id = p_file_id
        and not files.is_crawl_artifact(f.id)
        and (
          f.created_by = p_user_id
          or public.has_permission_for(p_user_id, 'file', f.id, 'viewer'::public.permission_level)
          or exists (
            select 1
            from iam.memberships m
            join iam.membership_grant g
              on g.member_role = m.role and g.container_type in ('file', '*')
            where m.container_type = 'file' and m.container_id = f.id
              and m.user_id = p_user_id and m.deleted_at is null
              and g.confers >= 'viewer'::public.permission_level
          )
        )
    )
  end;
$$;

comment on function files.is_listable_for(uuid, uuid) is
  'LISTING gate for personal file surfaces (tree/search/count/pickers): owner or explicit grant ONLY. No visibility, org, or reachability branches — ever. Access-by-id uses files.has_access_for instead.';

grant execute on function files.is_listable_for(uuid, uuid) to authenticated, service_role;
revoke execute on function files.is_listable_for(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- get_user_file_tree: same shape/signature, listing gate swapped to
-- files.is_listable_for. (effective_permission still computed via
-- has_access_for so explicitly-granted files report their real level.)
-- ---------------------------------------------------------------------------
create or replace function public.get_user_file_tree(
  p_user_id uuid,
  p_limit integer default 5000,
  p_offset integer default 0,
  p_include_folders boolean default true,
  p_include_deleted boolean default false,
  p_order_by text default 'name'
) returns jsonb
language plpgsql
stable
security definer
as $function$
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
        and files.is_listable_for(%L, f.id)
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
$function$;

-- ---------------------------------------------------------------------------
-- search_files: listing gate swapped to files.is_listable_for.
-- ---------------------------------------------------------------------------
create or replace function public.search_files(
  p_user_id uuid,
  p_query text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_mime_prefix text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
        and files.is_listable_for(p_user_id, id)
      order by updated_at desc
      limit p_limit offset p_offset
    ) t
  ), '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------------
-- count_user_files: listing gate swapped to files.is_listable_for.
-- ---------------------------------------------------------------------------
create or replace function public.count_user_files(
  p_user_id uuid,
  p_include_folders boolean default true,
  p_include_deleted boolean default false
) returns jsonb
language plpgsql
stable
security definer
as $function$
declare v_files int; v_folders int;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()' using errcode = '42501';
  end if;
  select count(*) into v_files from files.files f
  where (p_include_deleted or f.deleted_at is null)
    and f.parent_file_id is null
    and f.file_path not like 'system-files/%'
    and files.is_listable_for(p_user_id, f.id);
  if p_include_folders then
    select count(*) into v_folders from files.folders d
    where (p_include_deleted or d.deleted_at is null) and d.created_by = p_user_id;
  else
    v_folders := 0;
  end if;
  return jsonb_build_object('files', v_files, 'folders', v_folders, 'total', v_files + v_folders);
end;
$function$;
