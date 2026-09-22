-- chair-step: DOORS-ONLY-5 inverse, machinery batch 1 — restores `platform_admin_all` (FOR
-- ALL, permissive) on 8 machinery tables and drops the `platform_admin_select` twin. That
-- puts the client write SURFACE back: a permissive write policy naming `authenticated` on tables
-- that own the inputs the access resolver consumes. It does NOT make them writable on its own —
-- the write grant is already gone and this does not re-grant it — but it is the declaration the
-- doors-only ruling closed. Only run it to undo a closure that broke a real path, and say which.

set local lock_timeout = '2s';


create policy "platform_admin_all" on iam."access_requests"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."access_requests";

create policy "platform_admin_all" on iam."industry_curators"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."industry_curators";

create policy "platform_admin_all" on iam."invitations"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."invitations";

create policy "platform_admin_all" on iam."membership_grant"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."membership_grant";

create policy "platform_admin_all" on iam."memberships"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."memberships";

create policy "platform_admin_all" on iam."organizations"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."organizations";

create policy "platform_admin_all" on iam."permissions"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."permissions";

create policy "platform_admin_all" on iam."system_personal_org_failures"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on iam."system_personal_org_failures";
