-- REVERT of two bad changes I made on 2026-07-21 (web_public_view_visibility.sql
-- and web_reads_open_writes_sane.sql). Together they made every agency's
-- brands, sites, pages, GSC stats and cost data readable by EVERY
-- authenticated user — a tenant-isolation breach.
--
-- What was wrong:
--   1. Backfilling web.site/web.brand to visibility='public'. In
--      iam.has_access_for_base, visibility='public' short-circuits to TRUE for
--      'viewer' — so "public" was never a display flag, it was a read grant to
--      every logged-in user on the platform.
--   2. Hand-writing std_select as USING (true) on all 25 web tables. The
--      canonical generator iam.apply_rls already produces the correct policy
--      for this schema: web.site / web.brand are entities; every child
--      (page, snapshot, gsc_page_stat, ...) is registered is_component=true
--      with a composition parent in platform.entity_relationships, so its
--      access is resolved through its site/brand — the child carries no
--      access rule of its own. Never hand-write these.
--   3. Adding public.is_super_admin() to web write policies. Admin level is
--      for admin surfaces; a super admin gets no extra marketing rows, exactly
--      as they get no extra chats, agents, or messages. apply_rls drops it.
--
-- Restoring visibility to 'internal' (the documented default for org work)
-- and regenerating every policy from the registry.

update web.site  set visibility = 'internal' where visibility = 'public';
update web.brand set visibility = 'internal' where visibility = 'public';

do $$
declare t record;
begin
  for t in
    select table_name, coalesce(rls_variant, 'entity') as variant, token
    from platform.entity_types
    where schema_name = 'web' and is_active is not false
    order by is_component, token
  loop
    perform iam.apply_rls('web', t.table_name, t.token, t.variant);
  end loop;
end$$;
