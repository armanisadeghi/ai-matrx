-- chair-step: DOORS-ONLY-5 inverse, machinery batch 3 — restores `platform_admin_all` (FOR
-- ALL, permissive) on 8 machinery tables and drops the `platform_admin_select` twin. That
-- puts the client write SURFACE back: a permissive write policy naming `authenticated` on tables
-- that own the inputs the access resolver consumes. It does NOT make them writable on its own —
-- the write grant is already gone and this does not re-grant it — but it is the declaration the
-- doors-only ruling closed. Only run it to undo a closure that broke a real path, and say which.

set local lock_timeout = '2s';


create policy "platform_admin_all" on platform."entity_grants"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."entity_grants";

create policy "platform_admin_all" on platform."entity_relationships"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."entity_relationships";

create policy "platform_admin_all" on platform."entity_types"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."entity_types";

create policy "platform_admin_all" on platform."lifecycle_archive"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_archive";

create policy "platform_admin_all" on platform."lifecycle_archive_row"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_archive_row";

create policy "platform_admin_all" on platform."lifecycle_audit"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_audit";

create policy "platform_admin_all" on platform."lifecycle_entity_plan"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_entity_plan";

create policy "platform_admin_all" on platform."lifecycle_map_build"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_map_build";
