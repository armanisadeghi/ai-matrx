-- Crawler artifacts are ordinary canonical Files rows referenced directly by
-- web.snapshot / web.screenshot UUID foreign keys. A second relationship in
-- platform.associations is redundant and must not participate in access.

create or replace function files.has_access_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, files, web, iam, auth
as $$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
    when p_user_id is null then false
    when files.is_crawl_artifact(p_file_id)
    then p_required = 'viewer'::public.permission_level and exists (
      select 1
      from files.files f
      join web.site ws
        on ws.id = case
          when f.metadata ->> 'web_site_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (f.metadata ->> 'web_site_id')::uuid
          else null
        end
       and ws.organization_id = f.organization_id
       and ws.deleted_at is null
      where f.id = p_file_id
        and f.deleted_at is null
        and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
        and (
          exists (
            select 1
            from web.snapshot s
            where s.site_id = ws.id
              and s.organization_id = ws.organization_id
              and s.deleted_at is null
              and (s.body_file_id = f.id or s.markdown_file_id = f.id)
          )
          or exists (
            select 1
            from web.screenshot s
            where s.site_id = ws.id
              and s.organization_id = ws.organization_id
              and s.deleted_at is null
              and s.file_id = f.id
          )
        )
        and iam.has_access_for_base(
          p_user_id,
          'web_site',
          ws.id,
          'viewer'::public.permission_level
        )
    )
    else iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
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
      and iam.is_discoverable_base(p_user_id, 'file', p_file_id, p_required)
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
set search_path = pg_catalog, files, web
as $$
begin
  if p_file_id is null then return; end if;
  if not exists (
    select 1
    from files.files f
    join web.site ws
      on ws.id = p_site_id
     and ws.organization_id = p_organization_id
     and ws.deleted_at is null
    join web.crawl_session cs
      on cs.id = p_session_id
     and cs.site_id = ws.id
     and cs.organization_id = ws.organization_id
     and cs.deleted_at is null
    where f.id = p_file_id
      and f.organization_id = ws.organization_id
      and f.deleted_at is null
      and f.visibility::text = 'private'
      and f.mime_type like p_mime_prefix || '%'
      and f.metadata @> '{"system_artifact": true, "system_immutable": true, "artifact_domain": "web_crawl"}'::jsonb
      and f.metadata ->> 'web_site_id' = ws.id::text
      and f.metadata ->> 'crawl_session_id' = cs.id::text
  ) then
    raise exception 'invalid canonical crawl artifact file %', p_file_id
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  to service_role;

drop trigger if exists associations_enforce_managed_file_web_site
  on platform.associations;
drop function if exists platform.enforce_managed_file_web_site_association();

delete from platform.associations
where source_type = 'file' and target_type = 'web_site';

delete from platform.association_types
where source_type = 'file' and target_type = 'web_site';

drop function if exists files.has_web_site_edge(uuid);

revoke all on function files.has_access_for(uuid, uuid, public.permission_level)
  from public, anon;
grant execute on function files.has_access_for(uuid, uuid, public.permission_level)
  to authenticated, service_role;

revoke all on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  from public, anon, authenticated;
grant execute on function files.is_discoverable_for(uuid, uuid, public.permission_level)
  to service_role;
