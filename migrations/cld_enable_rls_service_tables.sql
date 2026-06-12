-- Cloud Files — enable RLS on account/usage/rate/guest/guard tables (P1-13)
--
-- WHY: Supabase advisor flagged these 6 public tables as RLS-disabled
-- (ERROR-level). They're written by the Python backend via the service-role
-- key (which BYPASSES RLS, so backend access is unaffected). Enabling RLS
-- closes direct anon/authenticated PostgREST access. The two tables the
-- authed Next.js compute-targets route reads (cld_user_account,
-- cld_account_tiers) get the minimal SELECT policy they need; the rest are
-- service-only and get RLS with no policy = deny-all to non-service roles.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-10.

-- User-keyed: owner reads own row.
ALTER TABLE public.cld_user_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cld_user_account_owner_select ON public.cld_user_account;
CREATE POLICY cld_user_account_owner_select ON public.cld_user_account
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE public.cld_user_storage_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cld_user_storage_usage_owner_select ON public.cld_user_storage_usage;
CREATE POLICY cld_user_storage_usage_owner_select ON public.cld_user_storage_usage
  FOR SELECT USING (user_id = auth.uid());

-- Reference data (tier definitions, non-sensitive): any authenticated user.
ALTER TABLE public.cld_account_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cld_account_tiers_authenticated_select ON public.cld_account_tiers;
CREATE POLICY cld_account_tiers_authenticated_select ON public.cld_account_tiers
  FOR SELECT TO authenticated USING (true);

-- Service-only (rate buckets, guest-migration audit, durability-guard config):
-- RLS on with NO policy → deny all to anon/authenticated. Python's service-role
-- key bypasses RLS, so backend reads/writes are unaffected.
ALTER TABLE public.cld_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cld_guest_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mtx_public_url_guard ENABLE ROW LEVEL SECURITY;
