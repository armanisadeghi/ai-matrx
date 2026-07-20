-- Crawler artifacts are context-owned by a web site, never personally owned
-- by the historical value in files.files.created_by. The generic IAM judge
-- grants a file owner unconditionally, so file authorization needs this thin
-- canonical wrapper: crawl-artifact associations use site access exclusively;
-- every other file retains the standard IAM policy.

create or replace function files.has_access_for(
  p_user_id uuid,
  p_file_id uuid,
  p_required permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, platform, iam
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
    ) then exists (
      select 1
      from platform.associations a
      where a.source_type = 'file'
        and a.source_id = p_file_id
        and a.target_type = 'web_site'
        and a.role = 'crawl_artifact'
        and iam.has_access_for(
          p_user_id,
          'web_site',
          a.target_id,
          p_required
        )
    )
    else iam.has_access_for(p_user_id, 'file', p_file_id, p_required)
  end;
$$;

revoke all on function files.has_access_for(uuid, uuid, permission_level) from public;
grant execute on function files.has_access_for(uuid, uuid, permission_level)
  to authenticated, service_role;

alter policy std_select on files.files
using (files.has_access_for((select auth.uid()), id, 'viewer'));
