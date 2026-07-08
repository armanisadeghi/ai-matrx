-- definer_rpc_ssr_shell_anon_revoke.sql
--
-- SECURITY layer 3 (same class as definer_rpc_anon_grant_revoke.sql). The SSR
-- shell-hydration RPCs are public SECURITY DEFINER, take a caller-supplied
-- p_user_id with NO auth check, and were anon-granted — so anon could read ANY
-- user's is_admin flag, preferences, ORG MEMBERSHIPS, active org, and SMS unread
-- counts. Both are LANGUAGE sql (a plpgsql-style in-body guard needs a separate
-- supervised pass — see the D-entry residual), so here we close the critical
-- UNAUTHENTICATED vector at the grant layer:
--
--   get_ssr_shell_data        LIVE — called client-side from DeferredShellData
--                             AFTER auth resolves, with the user's OWN id
--                             (browser `authenticated`; guests use that role
--                             too). Revoke anon + public; keep authenticated.
--                             Authenticated-cross-user residual remains (needs
--                             the in-body guard / plpgsql conversion — escalated).
--   get_ssr_agent_shell_data  DEAD — only a past-tense comment references it
--                             (DeferredShellData preload was removed). No live
--                             caller: revoke anon + authenticated + public (fully
--                             closed; graveyard candidate).
--
-- Idempotent.

revoke execute on function public.get_ssr_shell_data(p_user_id uuid) from anon, public;
revoke execute on function public.get_ssr_agent_shell_data(p_user_id uuid) from anon, authenticated, public;
