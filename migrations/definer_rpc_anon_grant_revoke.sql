-- definer_rpc_anon_grant_revoke.sql
--
-- SECURITY (critical class, found 2026-07-07 by critical-path review):
-- a family of public SECURITY DEFINER RPCs take a caller-supplied p_user_id
-- (or email), filter ONLY on that param with NO auth.uid() check, and are
-- EXECUTE-granted to `anon` + PUBLIC. PostgREST exposes `public`, so ANY
-- unauthenticated browser could call them with another user's id. The worst,
-- get_mcp_credentials, returns DECRYPTED MCP OAuth access/refresh tokens.
--
-- LAYER 1 (this migration): kill the UNAUTHENTICATED (no-JWT `anon`) surface for
-- the whole class by revoking anon + PUBLIC execute. This cannot break legit
-- callers: guests use the `authenticated` role (anonymous *auth* users still
-- carry a JWT), and every real callsite is either the authenticated server/
-- browser client or the service_role admin client — verified per-RPC:
--   get_mcp_credentials            server admin-only (createAdminClient)  -> also drop `authenticated`
--   get_conversations_for_user     server authenticated (createClient)    -> keep authenticated (self-guard in layer 2)
--   get_dm_conversations_with_details  "                                  -> keep authenticated (self-guard in layer 2)
--   get_user_email_preferences     server admin (createAdminClient)       -> keep authenticated for now (self-guard in layer 2)
--   get_user_session_data          SSR authenticated self                 -> keep authenticated (self-guard in layer 2)
--   apply_usage_delta              backend/service_role                   -> keep authenticated (self-guard in layer 2)
--   cx_canvas_save_user_version    browser authenticated self             -> keep authenticated (self-guard in layer 2)
--   create_user_list              browser authenticated self             -> keep authenticated (self-guard in layer 2)
--   lookup_user_by_email           browser authenticated (invite lookup)  -> require login; keep authenticated, no self-guard
--
-- LAYER 2 (separate migration) adds the in-body
--   (auth.role()='service_role' OR p_user_id = auth.uid())
-- guard to close the authenticated-cross-user residual on the p_user_id RPCs.
--
-- Idempotent: REVOKE is safe to re-run.

revoke execute on function public.get_mcp_credentials(p_user_id uuid, p_server_id uuid) from anon, authenticated, public;
revoke execute on function public.get_conversations_for_user(p_user_id uuid) from anon, public;
revoke execute on function public.get_dm_conversations_with_details(p_user_id uuid) from anon, public;
revoke execute on function public.get_user_email_preferences(p_user_id uuid) from anon, public;
revoke execute on function public.get_user_session_data(p_user_id uuid) from anon, public;
revoke execute on function public.apply_usage_delta(p_user_id uuid, p_bytes_delta bigint, p_files_delta integer, p_record_upload boolean, p_upload_bytes bigint) from anon, public;
revoke execute on function public.cx_canvas_save_user_version(p_user_id uuid, p_canvas_id uuid, p_title text, p_content jsonb) from anon, public;
revoke execute on function public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean, p_public_read boolean, p_items jsonb) from anon, public;
revoke execute on function public.lookup_user_by_email(lookup_email text) from anon, public;
