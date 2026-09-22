-- chair-step: DOORS-ONLY-5 inverse, machinery batch 4 — restores `platform_admin_all` (FOR
-- ALL, permissive) on 8 machinery tables and drops the `platform_admin_select` twin. That
-- puts the client write SURFACE back: a permissive write policy naming `authenticated` on tables
-- that own the inputs the access resolver consumes. It does NOT make them writable on its own —
-- the write grant is already gone and this does not re-grant it — but it is the declaration the
-- doors-only ruling closed. Only run it to undo a closure that broke a real path, and say which.

set local lock_timeout = '2s';


create policy "platform_admin_all" on platform."lifecycle_reference_map"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_reference_map";

create policy "platform_admin_all" on platform."lifecycle_run"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."lifecycle_run";

create policy "platform_admin_all" on platform."mtx_public_url_guard"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."mtx_public_url_guard";

create policy "platform_admin_all" on platform."reachability"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."reachability";

create policy "platform_admin_all" on platform."reference_categories"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."reference_categories";

create policy "platform_admin_all" on platform."reference_declaration"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."reference_declaration";

create policy "platform_admin_all" on platform."repo"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."repo";

create policy "platform_admin_all" on platform."schemas"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."schemas";
