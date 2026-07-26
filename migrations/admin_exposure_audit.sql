-- admin_exposure_audit.sql
--
-- Read-only, super-admin exposure audit for resources that can be seen outside
-- their owner. This is the database boundary behind the Administration
-- Relationships → Exposure Audit surface.
--
-- No new table: files.files, workbench.notes, iam.permissions,
-- platform.share_links, and platform.reachability remain the sources of truth.

-- Publicly visible deleted notes must never remain anonymously readable.
drop policy if exists pub_read on workbench.notes;
create policy pub_read on workbench.notes
  for select to anon
  using (deleted_at is null and visibility = 'public'::platform.visibility);

create index if not exists idx_notes_visibility_active
  on workbench.notes (visibility, updated_at desc)
  where deleted_at is null;

create or replace function public.admin_exposure_audit_summary()
returns table (
  resource_type text,
  visibility text,
  active_count bigint,
  deleted_count bigint,
  owner_count bigint,
  active_grant_count bigint,
  active_share_link_count bigint,
  contextual_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, files, workbench, iam, platform, auth
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  return query
  with resources as (
    select
      'file'::text as resource_type,
      f.id,
      f.created_by,
      f.visibility::text as visibility,
      f.deleted_at
    from files.files f

    union all

    select
      'note'::text as resource_type,
      n.id,
      n.created_by,
      n.visibility::text as visibility,
      n.deleted_at
    from workbench.notes n
  ),
  grants as (
    select
      p.resource_type,
      p.resource_id,
      count(*)::bigint as active_grant_count
    from iam.permissions p
    where p.resource_type in ('file', 'note')
      and coalesce(p.status, 'active') = 'active'
      and (p.expires_at is null or p.expires_at > now())
    group by p.resource_type, p.resource_id
  ),
  links as (
    select
      l.resource_type,
      l.resource_id,
      count(*)::bigint as active_share_link_count
    from platform.share_links l
    where l.resource_type in ('file', 'note')
      and l.is_active
      and (l.expires_at is null or l.expires_at > now())
      and (l.max_uses is null or l.use_count < l.max_uses)
    group by l.resource_type, l.resource_id
  ),
  contextual as (
    select
      r.item_type as resource_type,
      r.item_id as resource_id,
      count(*)::bigint as contextual_count
    from platform.reachability r
    where r.item_type in ('file', 'note')
    group by r.item_type, r.item_id
  )
  select
    r.resource_type,
    r.visibility,
    count(*) filter (where r.deleted_at is null)::bigint as active_count,
    count(*) filter (where r.deleted_at is not null)::bigint as deleted_count,
    count(distinct r.created_by) filter (where r.deleted_at is null)::bigint as owner_count,
    coalesce(sum(g.active_grant_count) filter (where r.deleted_at is null), 0)::bigint
      as active_grant_count,
    coalesce(sum(l.active_share_link_count) filter (where r.deleted_at is null), 0)::bigint
      as active_share_link_count,
    count(*) filter (
      where r.deleted_at is null and coalesce(c.contextual_count, 0) > 0
    )::bigint as contextual_count
  from resources r
  left join grants g
    on g.resource_type = r.resource_type and g.resource_id = r.id
  left join links l
    on l.resource_type = r.resource_type and l.resource_id = r.id
  left join contextual c
    on c.resource_type = r.resource_type and c.resource_id = r.id
  group by r.resource_type, r.visibility
  order by r.resource_type, r.visibility;
end;
$function$;

comment on function public.admin_exposure_audit_summary() is
  'Super-admin-only aggregate exposure inventory for files and notes.';

drop function if exists public.admin_exposure_audit_rows(
  text, text, text, boolean, integer, integer
);

create or replace function public.admin_exposure_audit_rows(
  p_resource_type text default null,
  p_exposure text default 'public',
  p_search text default null,
  p_include_deleted boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  resource_type text,
  resource_id uuid,
  display_name text,
  location text,
  content_preview text,
  mime_type text,
  owner_id uuid,
  owner_email text,
  organization_id uuid,
  organization_name text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  is_system_artifact boolean,
  is_derived boolean,
  direct_grant_count bigint,
  organization_grant_count bigint,
  public_grant_count bigint,
  active_share_link_count bigint,
  conveying_container_count bigint,
  conveying_container_types text[],
  broad_discovery boolean,
  discovery_status text,
  exposure_reasons text[],
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, files, workbench, iam, platform, auth
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_resource_type is not null and p_resource_type not in ('file', 'note') then
    raise exception 'Invalid resource type: %', p_resource_type
      using errcode = '22023';
  end if;

  if p_exposure not in (
    'public',
    'internal',
    'link',
    'shared',
    'contextual',
    'personal',
    'all_exposed'
  ) then
    raise exception 'Invalid exposure filter: %', p_exposure
      using errcode = '22023';
  end if;

  p_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with resources as (
    select
      'file'::text as resource_type,
      f.id as resource_id,
      f.file_name as display_name,
      f.file_path as location,
      null::text as content_preview,
      f.mime_type,
      f.created_by as owner_id,
      f.organization_id,
      f.visibility::text as visibility,
      f.created_at,
      f.updated_at,
      f.deleted_at,
      (
        f.metadata @> '{"system_artifact": true}'::jsonb
        or f.file_path like 'system-files/%'
        or f.file_path like 'generations/%'
      ) as is_system_artifact,
      f.parent_file_id is not null as is_derived
    from files.files f

    union all

    select
      'note'::text as resource_type,
      n.id as resource_id,
      n.label as display_name,
      n.folder_name as location,
      left(regexp_replace(coalesce(n.content, ''), '\s+', ' ', 'g'), 180)
        as content_preview,
      null::text as mime_type,
      n.created_by as owner_id,
      n.organization_id,
      n.visibility::text as visibility,
      n.created_at,
      n.updated_at,
      n.deleted_at,
      false as is_system_artifact,
      false as is_derived
    from workbench.notes n
  ),
  enriched as (
    select
      r.*,
      coalesce(g.direct_grant_count, 0)::bigint as direct_grant_count,
      coalesce(g.organization_grant_count, 0)::bigint as organization_grant_count,
      coalesce(g.public_grant_count, 0)::bigint as public_grant_count,
      coalesce(l.active_share_link_count, 0)::bigint as active_share_link_count,
      coalesce(c.conveying_container_count, 0)::bigint as conveying_container_count,
      coalesce(c.conveying_container_types, '{}'::text[])
        as conveying_container_types
    from resources r
    left join lateral (
      select
        count(*) filter (where p.granted_to_user_id is not null)::bigint
          as direct_grant_count,
        count(*) filter (where p.granted_to_organization_id is not null)::bigint
          as organization_grant_count,
        count(*) filter (where coalesce(p.is_public, false))::bigint
          as public_grant_count
      from iam.permissions p
      where p.resource_type = r.resource_type
        and p.resource_id = r.resource_id
        and coalesce(p.status, 'active') = 'active'
        and (p.expires_at is null or p.expires_at > now())
    ) g on true
    left join lateral (
      select count(*)::bigint as active_share_link_count
      from platform.share_links l
      where l.resource_type = r.resource_type
        and l.resource_id = r.resource_id
        and l.is_active
        and (l.expires_at is null or l.expires_at > now())
        and (l.max_uses is null or l.use_count < l.max_uses)
    ) l on true
    left join lateral (
      select
        count(*)::bigint as conveying_container_count,
        array_agg(distinct pr.container_type order by pr.container_type)
          as conveying_container_types
      from platform.reachability pr
      where pr.item_type = r.resource_type
        and pr.item_id = r.resource_id
    ) c on true
  ),
  filtered as (
    select e.*
    from enriched e
    where (p_resource_type is null or e.resource_type = p_resource_type)
      and (p_include_deleted or e.deleted_at is null)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or e.display_name ilike '%' || btrim(p_search) || '%'
        or coalesce(e.location, '') ilike '%' || btrim(p_search) || '%'
        or e.resource_id::text = btrim(p_search)
      )
      and case p_exposure
        when 'public' then
          e.visibility = 'public' or e.public_grant_count > 0
        when 'internal' then e.visibility = 'internal'
        when 'link' then
          e.visibility = 'link' or e.active_share_link_count > 0
        when 'shared' then
          e.direct_grant_count > 0 or e.organization_grant_count > 0
          or e.public_grant_count > 0
        when 'contextual' then e.conveying_container_count > 0
        when 'personal' then e.visibility = 'personal'
        when 'all_exposed' then
          e.visibility <> 'personal'
          or e.direct_grant_count > 0
          or e.organization_grant_count > 0
          or e.public_grant_count > 0
          or e.active_share_link_count > 0
          or e.conveying_container_count > 0
        else false
      end
  ),
  total as (
    select count(*)::bigint as total_count from filtered
  ),
  page as (
    select f.*
    from filtered f
    order by f.updated_at desc nulls last, f.resource_id
    limit p_limit offset p_offset
  )
  select
    p.resource_type,
    p.resource_id,
    p.display_name,
    p.location,
    p.content_preview,
    p.mime_type,
    p.owner_id,
    u.email::text as owner_email,
    p.organization_id,
    o.name as organization_name,
    p.visibility,
    p.created_at,
    p.updated_at,
    p.deleted_at,
    p.is_system_artifact,
    p.is_derived,
    p.direct_grant_count,
    p.organization_grant_count,
    p.public_grant_count,
    p.active_share_link_count,
    p.conveying_container_count,
    p.conveying_container_types,
    (
      p.visibility = 'public'
      or p.public_grant_count > 0
    ) as broad_discovery,
    case
      when p.resource_type = 'note'
        and (p.visibility = 'public' or p.public_grant_count > 0)
        then 'Agent/RAG searchable and anonymously readable'
      when p.resource_type = 'file' and p.visibility = 'public'
        then 'Anonymous by ID; excluded from personal file listings'
      when p.visibility = 'internal'
        and exists (
          select 1
          from iam.system_orgs so
          where so.organization_id = p.organization_id
            and so.global_readable
        )
        then 'Visible to every signed-in user'
      when p.visibility = 'internal'
        then 'Visible to organization members'
      when p.visibility = 'link' or p.active_share_link_count > 0
        then 'Visible to people with an active link'
      when p.direct_grant_count > 0 or p.organization_grant_count > 0
        then 'Visible through explicit grants'
      when p.conveying_container_count > 0
        then 'Visible through an attached container'
      else 'Owner only'
    end as discovery_status,
    array_remove(array[
      case when p.visibility = 'public' then 'Public visibility' end,
      case when p.visibility = 'internal' then 'Organization visibility' end,
      case when p.visibility = 'link' then 'Link visibility' end,
      case when p.public_grant_count > 0 then
        format('%s public grant(s)', p.public_grant_count)
      end,
      case when p.direct_grant_count > 0 then
        format('%s user grant(s)', p.direct_grant_count)
      end,
      case when p.organization_grant_count > 0 then
        format('%s organization grant(s)', p.organization_grant_count)
      end,
      case when p.active_share_link_count > 0 then
        format('%s active share link(s)', p.active_share_link_count)
      end,
      case when p.conveying_container_count > 0 then
        format(
          '%s conveying container(s): %s',
          p.conveying_container_count,
          array_to_string(p.conveying_container_types, ', ')
        )
      end
    ], null)::text[] as exposure_reasons,
    t.total_count
  from page p
  cross join total t
  left join auth.users u on u.id = p.owner_id
  left join iam.organizations o on o.id = p.organization_id
  order by p.updated_at desc nulls last, p.resource_id;
end;
$function$;

comment on function public.admin_exposure_audit_rows(
  text, text, text, boolean, integer, integer
) is
  'Super-admin-only paginated exposure reasons for files and notes.';

revoke all on function public.admin_exposure_audit_summary() from public, anon;
revoke all on function public.admin_exposure_audit_rows(
  text, text, text, boolean, integer, integer
) from public, anon;

grant execute on function public.admin_exposure_audit_summary()
  to authenticated;
grant execute on function public.admin_exposure_audit_rows(
  text, text, text, boolean, integer, integer
) to authenticated;
