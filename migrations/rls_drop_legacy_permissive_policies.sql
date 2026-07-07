-- Security fix (2026-07-07): drop legacy / mislabeled permissive (USING true) RLS
-- policies that leaked cross-user / cross-org data on live prod. Found by a
-- live-DB RLS audit (follow-up to AID-SCRAPER-RLS). Each table keeps its correct
-- scoped policies, so legitimate access is unchanged. Applied live + verified:
-- no qual=true anon/authenticated/public SELECT|ALL policy remains on these tables.
-- Idempotent.
--
-- Root cause (recurring): policies written with a "service"/"admin" NAME but the
-- ROLE set to public/authenticated with USING(true), and pre-canonical blanket
-- policies left in place after the scoped policies were added.
--
-- NOT fixed here (flagged for Arman — consumer/break risk I could not verify, or
-- storage-layer): public.ops_issue_event / ops_issue_class (public USING(true) ALL
-- → anon read+write; fix = restrict to service_role / is_super_admin once the
-- reader/writer path is known), storage.objects / storage.buckets (leftover
-- "for all users" policies — remediate via the Storage policy path),
-- public.guest_executions (anon read all — scope to the guest session or drop,
-- but may back the guest self-limit check), public.system_announcements (any
-- authenticated user can forge — restrict manage to admin), education.math_* (
-- likely-intended shared library — confirm intent). See RLS_AUDIT.md.

-- public.content_blocks — two un-dropped legacy blanket policies let ANY
-- authenticated user read/update/DELETE every content block cross-user & cross-org.
-- Scoped set (content_blocks_read/_insert/_update/_delete/_read_anon/_service_role)
-- remains as the correct protection.
drop policy if exists "Allow authenticated users to read content blocks" on public.content_blocks;
drop policy if exists "Allow authenticated users to manage content blocks" on public.content_blocks;

-- admin.admins (PROTECTED resource) — a stray admins_self_check (USING true) leaked
-- the full admin roster (every admin's user_id + level) to any authenticated user.
-- Canonical admins_select_self_or_super (user_id = auth.uid() OR is_super_admin())
-- and admins_no_direct_writes remain; writes stay RPC-only.
drop policy if exists "admins_self_check" on admin.admins;

-- public.feedback_comments — two mislabeled "Admins can view/insert all comments"
-- policies were role=public USING(true)/CHECK(true): any anon read + any insert.
-- Scoped "Users can view/comment on own feedback" policies remain (fail-closed for
-- anon); admin triage uses the service-role (createAdminClient) path (bypasses RLS).
drop policy if exists "Admins can view all comments" on public.feedback_comments;
drop policy if exists "Admins can insert all comments" on public.feedback_comments;
