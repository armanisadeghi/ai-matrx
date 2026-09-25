-- admin_access_lifecycle_tier_ledger_admin_read_2026_09_24
--
-- Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).
-- The law's check query returned 1 after the chair's restore: platform.lifecycle_tier_ledger has RLS
-- on and only `lifecycle_tier_ledger_read`, no platform-admin read arm. Found by check:staff-door's new
-- limb D on its first live run. Restored here with the same policy and do-not-remove comment every
-- other RLS table carries.

set local lock_timeout = '2s';

create policy platform_admin_read on platform.lifecycle_tier_ledger
  for select to authenticated using ((select public.is_platform_admin()));

comment on policy platform_admin_read on platform.lifecycle_tier_ledger is
  'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. This is how Arman and platform admins read every row through the admin system (aidream dashboard, admin.app.matrxserver.com, the Supabase-style table browser). Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).';
