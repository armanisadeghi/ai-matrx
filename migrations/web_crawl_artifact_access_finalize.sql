-- Canonical contextual authorization: web rows retain direct file FKs, while
-- a file -> web_site containment edge lets the standard file signer follow
-- site grants/revocation without making private artifacts discoverable.

insert into platform.association_types (
  source_type,
  target_type,
  label,
  container_side,
  conveys_max,
  is_active,
  notes
)
values (
  'file',
  'web_site',
  'crawl_artifact',
  'target',
  'viewer',
  true,
  'Private crawler artifacts inherit viewer access from their web site.'
)
on conflict (source_type, target_type) do update
set label = excluded.label,
    container_side = excluded.container_side,
    conveys_max = excluded.conveys_max,
    is_active = true,
    notes = excluded.notes;

-- Return files.files to its canonical policy. Reachability now handles both
-- direct browser reads and service-role URL-signing authorization.
alter policy std_select on files.files
using (
  created_by = (select auth.uid())
  or iam.has_access('file', id, 'viewer')
);

drop function if exists files.can_read_web_artifact(uuid);

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
      and exists (
        select 1
        from platform.associations a
        where a.source_type = 'file'
          and a.source_id = f.id
          and a.target_type = 'web_site'
          and a.target_id = p_site_id
          and a.organization_id = p_organization_id
          and a.role = 'crawl_artifact'
      )
  ) then
    raise exception 'invalid canonical crawl artifact file %', p_file_id
      using errcode = '23514';
  end if;
end;
$$;

drop trigger if exists snapshot_validate_artifact_files on web.snapshot;
create trigger snapshot_validate_artifact_files
before insert or update on web.snapshot
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
  where s.id = new.snapshot_id
    and s.organization_id = new.organization_id
    and s.site_id = new.site_id
    and s.page_id = new.page_id;

  if v_session_id is null then
    raise exception 'screenshot context does not match snapshot %', new.snapshot_id
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
before insert or update on web.screenshot
for each row execute function web.validate_screenshot_artifact_file();
