-- Web-site permission-management regression test.
-- Run with: psql $DATABASE_URL -v ON_ERROR_STOP=1 -f this_file.sql
-- Safe to re-run: the grant written by this test is rolled back.

begin;

do $preflight$
begin
  if not exists (
    select 1
    from platform.shareable_resource_registry
    where resource_type = 'web_site'
      and schema_name = 'web'
      and table_name = 'site'
      and is_active
  ) then
    raise exception 'web_site is not registered as a shareable access root';
  end if;
end;
$preflight$;

create temporary table web_site_permission_fixture on commit drop as
select id as site_id, created_by as owner_id
from web.site
where deleted_at is null
  and created_by is not null
limit 1;

grant select on web_site_permission_fixture to authenticated;

do $fixture$
begin
  if not exists (select 1 from web_site_permission_fixture) then
    raise exception 'web_site permission test requires one owned web.site row';
  end if;
end;
$fixture$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select owner_id from web_site_permission_fixture),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $regression$
declare
  v_site_id uuid := (select site_id from web_site_permission_fixture);
  v_owner_id uuid := (select owner_id from web_site_permission_fixture);
  v_grant jsonb;
  v_list jsonb;
begin
  if not iam.has_access('web_site', v_site_id, 'admin') then
    raise exception 'site owner must have admin access';
  end if;

  v_grant := iam.fn_grant_resource_permission(
    'web_site', v_site_id, v_owner_id, 'user', 'viewer', now() + interval '5 minutes'
  );
  if v_grant ->> 'permission_level' <> 'viewer' then
    raise exception 'viewer was not preserved: %', v_grant;
  end if;

  v_list := iam.fn_list_resource_permissions('web_site', v_site_id);
  if not v_list @> jsonb_build_array(
    jsonb_build_object(
      'resource_type', 'web_site',
      'grantee_id', v_owner_id,
      'grantee_type', 'user',
      'permission_level', 'viewer'
    )
  ) then
    raise exception 'canonical viewer grant missing from list: %', v_list;
  end if;

  if not iam.fn_revoke_resource_permission('web_site', v_site_id, v_owner_id, 'user') then
    raise exception 'expected the temporary web_site grant to be revoked';
  end if;

  begin
    perform iam.fn_grant_resource_permission(
      'web_site', v_site_id, v_owner_id, 'user', 'superuser', null
    );
    raise exception 'unknown permission level unexpectedly accepted';
  exception
    when raise_exception then
      if sqlerrm not like 'unsupported permission level %' then
        raise;
      end if;
  end;
end;
$regression$;

rollback;
