-- chair-step: DOORS-ONLY-5 inverse, machinery batch 2 — restores `platform_admin_all` (FOR
-- ALL, permissive) on 8 machinery tables and drops the `platform_admin_select` twin. That
-- puts the client write SURFACE back: a permissive write policy naming `authenticated` on tables
-- that own the inputs the access resolver consumes. It does NOT make them writable on its own —
-- the write grant is already gone and this does not re-grant it — but it is the declaration the
-- doors-only ruling closed. Only run it to undo a closure that broke a real path, and say which.

set local lock_timeout = '2s';


create policy "platform_admin_all" on platform."_base_entity"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."_base_entity";

create policy "platform_admin_all" on platform."activity_log"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."activity_log";

create policy "platform_admin_all" on platform."assist_producer_policy_history"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."assist_producer_policy_history";

create policy "platform_admin_all" on platform."association_types"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."association_types";

create policy "platform_admin_all" on platform."associations"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."associations";

create policy "platform_admin_all" on platform."ddl_guard_log"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."ddl_guard_log";

create policy "platform_admin_all" on platform."deprecated_relations"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."deprecated_relations";

create policy "platform_admin_all" on platform."edge_payload_kind"
  as permissive for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
drop policy if exists "platform_admin_select" on platform."edge_payload_kind";
