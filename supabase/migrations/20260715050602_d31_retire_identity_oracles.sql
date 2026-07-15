-- These legacy boolean identity predicates have no runtime or RLS callers.
-- Keep them available to service workflows without exposing arbitrary-user
-- admin/curator probes to browser sessions.

revoke execute on function public.is_super_admin_user(uuid)
  from public, anon, authenticated;
grant execute on function public.is_super_admin_user(uuid) to service_role;

revoke execute on function public.is_industry_curator(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_industry_curator(uuid, uuid) to service_role;
