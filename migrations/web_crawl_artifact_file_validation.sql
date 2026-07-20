-- Defense in depth for service-role writes: an artifact FK must point to an
-- active, private, immutable canonical file with matching tenant/site/session
-- metadata and the expected media type.

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
  if p_file_id is null then
    return;
  end if;

  if not exists (
    select 1
    from files.files f
    where f.id = p_file_id
      and f.organization_id = p_organization_id
      and f.deleted_at is null
      and f.visibility::text = 'private'
      and f.mime_type like p_mime_prefix || '%'
      and coalesce((f.metadata ->> 'system_artifact')::boolean, false)
      and coalesce((f.metadata ->> 'system_immutable')::boolean, false)
      and f.metadata ->> 'web_site_id' = p_site_id::text
      and f.metadata ->> 'crawl_session_id' = p_session_id::text
  ) then
    raise exception 'invalid canonical crawl artifact file %', p_file_id
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  from public;
grant execute on function web.assert_crawl_artifact_file(uuid, uuid, uuid, uuid, text)
  to service_role;

create or replace function web.validate_snapshot_artifact_files()
returns trigger
language plpgsql
set search_path = pg_catalog, web
as $$
begin
  perform web.assert_crawl_artifact_file(
    new.body_file_id,
    new.organization_id,
    new.site_id,
    new.session_id,
    'text/html'
  );
  perform web.assert_crawl_artifact_file(
    new.markdown_file_id,
    new.organization_id,
    new.site_id,
    new.session_id,
    'text/markdown'
  );
  return new;
end;
$$;

drop trigger if exists snapshot_validate_artifact_files on web.snapshot;
create trigger snapshot_validate_artifact_files
before insert or update of body_file_id, markdown_file_id on web.snapshot
for each row execute function web.validate_snapshot_artifact_files();

create or replace function web.validate_screenshot_artifact_file()
returns trigger
language plpgsql
set search_path = pg_catalog, web
as $$
declare
  v_session_id uuid;
begin
  select s.session_id into v_session_id
  from web.snapshot s
  where s.id = new.snapshot_id;

  if v_session_id is null then
    raise exception 'screenshot snapshot % has no crawl session', new.snapshot_id
      using errcode = '23514';
  end if;

  perform web.assert_crawl_artifact_file(
    new.file_id,
    new.organization_id,
    new.site_id,
    v_session_id,
    'image/png'
  );
  return new;
end;
$$;

drop trigger if exists screenshot_validate_artifact_file on web.screenshot;
create trigger screenshot_validate_artifact_file
before insert or update of file_id on web.screenshot
for each row execute function web.validate_screenshot_artifact_file();
