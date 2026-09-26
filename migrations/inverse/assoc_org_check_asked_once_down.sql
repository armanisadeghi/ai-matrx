-- assoc_org_check_asked_once_down — restores assoc_select's per-row organization check and removes
-- the set-form helper and its door declaration.
alter policy assoc_select on platform.associations
  using ((select public.is_platform_admin()) or iam.has_org_access(organization_id));

delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'org_access_ids';
drop function if exists iam.org_access_ids();
