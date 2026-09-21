-- The inverse of migrations/campaign/orgarch_an_organization_is_archived_never_deleted.sql.
-- It puts iam.my_orgs() and the two SELECT policies back to the bytes they had before the lane
-- and leaves the three columns in place (dropping a column that may already hold an archive is
-- the one destructive act this file refuses to perform — an organization archived in the
-- meantime would silently become live again with nobody told).

create or replace function iam.my_orgs()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query
    select organization_id from iam.organization_member where user_id = (select auth.uid())
    union
    select s.organization_id from iam.system_orgs s
     where s.global_readable and public.is_super_admin_for((select auth.uid()));
end
$function$;

alter policy org_select_policy on iam.organizations
  using (
    (select public.is_platform_admin())
    or created_by = (select auth.uid())
    or id in (select iam.my_orgs())
  );

alter policy std_select on iam.org_admin_audit
  using (
    organization_id is not null
    and organization_id in (select iam.my_orgs())
  );

delete from platform.client_callable_door
 where schema_name = 'iam' and function_name = 'my_orgs_all';

drop function if exists iam.my_orgs_all();

