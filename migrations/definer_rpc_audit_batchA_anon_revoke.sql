-- definer_rpc_audit_batchA_anon_revoke.sql
--
-- D31 audit, batch A. Second tranche of anon-reachable public SECURITY DEFINER
-- RPCs that trust a caller-supplied id. Per-function callsite verification (done
-- before applying) proved EVERY real caller is `authenticated` (browser client
-- or an auth-gated server route) or `service_role` (admin client) — NONE use the
-- anon role, and NONE are guest flows. So revoking anon+public closes the
-- unauthenticated-internet vector with ZERO access-loss for legitimate callers.
--
-- Per-function notes (caller → role):
--   get_user_lists_summary     features/user-lists/service.ts        authenticated (browser)
--   get_user_own_feedback      no FE caller (backend/service_role)   —
--   get_user_organizations     no FE caller (backend/service_role)   —
--   check_prompt_app_drift     features/versioning/…/versionService  authenticated (browser)
--   get_dm_user_info           features/messaging/*                  authenticated (browser)  [display primitive: looks up OTHER users → revoke-anon only, never a self-guard]
--   get_user_emails_by_ids     sharing/emailService + notify routes  authenticated (browser + auth-gated 401 server routes) [batch/display primitive]
--   get_dm_unread_count        features/messaging/MessagingInitializer authenticated (browser)  [also called internally by the already-guarded get_dm_conversations_with_details]
--   is_dm_participant          no FE caller; verified NOT used in any RLS policy → safe to revoke anon
--   feedback_get_admin_info    already gated by public.is_admin() (false-positive of the literal scan) — revoke anon for hygiene; it was never exploitable
--
-- Authenticated-cross-user residual (an authed user passing another id) remains
-- on the genuine own-data fns (get_user_lists_summary / get_user_own_feedback /
-- check_prompt_app_drift) and is tracked under D31; it needs a self-guard added
-- only after each caller is confirmed to pass its own id (check_prompt_app_drift
-- has a NULL-returns-all default, so it must NOT be blindly self-guarded). The
-- display/notify primitives (get_dm_user_info, get_user_emails_by_ids) are
-- cross-user BY DESIGN and correctly get revoke-anon only.
--
-- Idempotent.

revoke execute on function public.get_user_lists_summary(p_user_id uuid) from anon, public;
revoke execute on function public.get_user_own_feedback(p_user_id uuid) from anon, public;
revoke execute on function public.get_user_organizations(user_id uuid) from anon, public;
revoke execute on function public.check_prompt_app_drift(p_user_id uuid) from anon, public;
revoke execute on function public.get_dm_user_info(p_user_id uuid) from anon, public;
revoke execute on function public.get_user_emails_by_ids(user_ids uuid[]) from anon, public;
revoke execute on function public.get_dm_unread_count(p_conversation_id uuid, p_user_id uuid) from anon, public;
revoke execute on function public.is_dm_participant(p_conversation_id uuid, p_user_id uuid) from anon, public;
revoke execute on function public.feedback_get_admin_info(p_user_id uuid) from anon, public;
