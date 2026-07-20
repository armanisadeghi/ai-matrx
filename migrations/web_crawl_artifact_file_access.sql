-- Private crawler files inherit read access from the directly-referencing web
-- site. This preserves private-site boundaries without duplicating permission
-- rows or using a many-to-many association for a one-to-many relationship.

create or replace function files.can_read_web_artifact(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, files, web, iam, auth
as $$
  select exists (
    select 1
    from web.snapshot s
    where (s.body_file_id = p_file_id or s.markdown_file_id = p_file_id)
      and iam.has_access('web_site', s.site_id, 'viewer')
  ) or exists (
    select 1
    from web.screenshot s
    where s.file_id = p_file_id
      and s.deleted_at is null
      and iam.has_access('web_site', s.site_id, 'viewer')
  );
$$;

revoke all on function files.can_read_web_artifact(uuid) from public;
grant execute on function files.can_read_web_artifact(uuid) to authenticated, service_role;

alter policy std_select on files.files
using (
  created_by = (select auth.uid())
  or iam.has_access('file', id, 'viewer')
  or files.can_read_web_artifact(id)
);

create or replace function files.reject_web_artifact_file_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, files, web
as $$
begin
  if exists (
    select 1 from web.snapshot s
    where s.body_file_id = old.id or s.markdown_file_id = old.id
  ) or exists (
    select 1 from web.screenshot s
    where s.file_id = old.id
  ) then
    raise exception 'referenced web artifact file % is immutable', old.id
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists files_reject_web_artifact_file_mutation on files.files;
create trigger files_reject_web_artifact_file_mutation
before update on files.files
for each row
execute function files.reject_web_artifact_file_mutation();
