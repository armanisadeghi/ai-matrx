-- The invariant trigger must see references even when the acting artifact
-- owner has lost site access. SECURITY DEFINER prevents RLS from hiding those
-- rows and turning immutability into a fail-open check.

create or replace function files.reject_web_artifact_file_mutation()
returns trigger
language plpgsql
security definer
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

revoke all on function files.reject_web_artifact_file_mutation() from public;
