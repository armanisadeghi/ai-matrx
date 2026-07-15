-- edu_class_anon_null_bypass_fix.sql
--
-- CRITICAL adversarial-review fix (Convergence-C class/creator surface).
--
-- TWO compounding bugs let a fully UNAUTHENTICATED (anon) caller bypass every
-- owner/member check gated by `_edu_is_owner()`:
--
--   1. `_edu_is_owner(p_scope)` returns `p_scope.created_by = auth.uid() OR
--      iam.has_org_admin(...)`. For anon, `auth.uid()` is SQL NULL, so the
--      equality evaluates to NULL (not false) — `has_org_admin` correctly
--      returns false, but `NULL OR false = NULL`. Every call site does
--      `IF NOT _edu_is_owner(...) THEN RAISE ...` — and in PL/pgSQL,
--      `IF NOT NULL THEN` is NULL, which is treated as FALSE: the branch is
--      SKIPPED, so the "only the owner can..." guard silently no-ops and the
--      function proceeds as an authorized owner.
--   2. Postgres grants EXECUTE to PUBLIC on newly created functions by default.
--      `edu_class_membership_access_model.sql` and
--      `edu_class_assignments_analytics.sql` both explicitly GRANT ... TO
--      authenticated but never REVOKE the default PUBLIC grant (the exact class
--      of bug already fixed once for guardian_* in
--      edu_guardian_link_revoke_anon_execute.sql) — so `anon` could call them.
--
-- Combined: an anonymous, unauthenticated caller could call
-- edu_class_set_access / edu_class_grant / edu_class_approve / edu_class_remove /
-- edu_class_unassign on ANY class (proved live: flipped a closed class to
-- 'open', and comped a free paid-class grant to an arbitrary user, both as
-- anon) — and edu_class_state / edu_class_roster / edu_class_progress_overview /
-- edu_class_assignments / edu_class_student_progress LEAKED closed/paid class
-- metadata, the full roster (incl. real emails), and per-student progress to
-- anon (proved live: read a closed class's full roster, including the owner's
-- email, as a genuinely unauthenticated caller).
--
-- FIX:
--   (a) Root cause: make `_edu_is_owner` NULL-safe (`coalesce(..., false)`) so
--       every call site's `IF NOT _edu_is_owner(...)` behaves correctly for an
--       unauthenticated caller — this alone closes every affected function.
--   (b) Defense in depth + matches original intent: REVOKE the stray PUBLIC/anon
--       EXECUTE grant from every edu_class_* RPC except `edu_class_state`
--       (deliberately anon-readable for open-class landing pages — now
--       NULL-safe so a closed/paid class still resolves to not-found for anon)
--       and from the creator_* write RPCs / the internal
--       creator_resolve_featured_resource helper (service_role only).
--
-- Idempotent: CREATE OR REPLACE / REVOKE IF granted (REVOKE is a no-op if the
-- grant doesn't exist).

-- ─── (a) Root-cause fix ────────────────────────────────────────────────────
create or replace function public._edu_is_owner(p_scope context.scopes)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_scope.created_by = (select auth.uid()), false)
      or coalesce(iam.has_org_admin(p_scope.organization_id), false);
$$;

-- ─── (b) Close the stray PUBLIC/anon EXECUTE grants ────────────────────────
-- edu_class_membership_access_model.sql family (edu_class_state stays anon-readable).
revoke execute on function public.edu_class_join(uuid)          from public, anon;
revoke execute on function public.edu_class_request(uuid)       from public, anon;
revoke execute on function public.edu_class_approve(uuid, uuid) from public, anon;
revoke execute on function public.edu_class_leave(uuid)         from public, anon;
revoke execute on function public.edu_class_remove(uuid, uuid)  from public, anon;
revoke execute on function public.edu_class_roster(uuid)        from public, anon;
revoke execute on function public.edu_class_grant(uuid, uuid)   from public, anon;
revoke execute on function public.edu_class_purchase(uuid)      from public, anon;
revoke execute on function public.edu_class_set_access(uuid, text) from public, anon;
revoke execute on function public.edu_my_classes()               from public, anon;

-- edu_class_assignments_analytics.sql family.
revoke execute on function public.edu_class_assign(uuid, text, uuid, date) from public, anon;
revoke execute on function public.edu_class_unassign(uuid, text, uuid)     from public, anon;
revoke execute on function public.edu_class_assignments(uuid)              from public, anon;
revoke execute on function public.edu_class_student_progress(uuid, uuid)   from public, anon;
revoke execute on function public.edu_class_progress_overview(uuid)        from public, anon;

-- Re-affirm the intended grants (self-contained; authenticated only).
grant execute on function public.edu_class_join(uuid)          to authenticated;
grant execute on function public.edu_class_request(uuid)       to authenticated;
grant execute on function public.edu_class_approve(uuid, uuid) to authenticated;
grant execute on function public.edu_class_leave(uuid)         to authenticated;
grant execute on function public.edu_class_remove(uuid, uuid)  to authenticated;
grant execute on function public.edu_class_roster(uuid)        to authenticated;
grant execute on function public.edu_class_grant(uuid, uuid)   to authenticated;
grant execute on function public.edu_class_purchase(uuid)      to authenticated;
grant execute on function public.edu_class_set_access(uuid, text) to authenticated;
grant execute on function public.edu_my_classes()               to authenticated;
grant execute on function public.edu_class_assign(uuid, text, uuid, date) to authenticated;
grant execute on function public.edu_class_unassign(uuid, text, uuid)     to authenticated;
grant execute on function public.edu_class_assignments(uuid)              to authenticated;
grant execute on function public.edu_class_student_progress(uuid, uuid)   to authenticated;
grant execute on function public.edu_class_progress_overview(uuid)        to authenticated;

-- creator_* write RPCs — same stray-PUBLIC-grant bug (education_creator_profiles.sql
-- explicitly granted `authenticated, service_role` but never revoked the PUBLIC
-- default, so anon could call these too). creator_public_page / creator_public_handles
-- stay anon-readable by design.
revoke execute on function public.creator_get_mine()                                            from public, anon;
revoke execute on function public.creator_handle_available(text)                                from public, anon;
revoke execute on function public.creator_claim_handle(text, text)                              from public, anon;
revoke execute on function public.creator_update_profile(text, text, text, text, jsonb, jsonb)  from public, anon;
revoke execute on function public.creator_set_public(boolean)                                   from public, anon;
-- Internal helper — was only ever meant for service_role; close the stray PUBLIC grant fully.
revoke execute on function public.creator_resolve_featured_resource(text, uuid) from public, anon, authenticated;

grant execute on function public.creator_get_mine()                                            to authenticated, service_role;
grant execute on function public.creator_handle_available(text)                                to authenticated, service_role;
grant execute on function public.creator_claim_handle(text, text)                              to authenticated, service_role;
grant execute on function public.creator_update_profile(text, text, text, text, jsonb, jsonb)  to authenticated, service_role;
grant execute on function public.creator_set_public(boolean)                                   to authenticated, service_role;
