-- definer_rpc_audit_batchB_anon_revoke.sql
--
-- D31 audit, batch B — the org / scope / context tranche of anon-reachable
-- public SECURITY DEFINER RPCs that trust a caller-supplied org/user id with no
-- gate helper and no auth.uid(). Callsite-verified: every real caller is
-- `authenticated` (browser) or `service_role` (admin/aidream); several have NO
-- FE caller (backend/service_role or dead). NONE use the anon role; NONE are
-- guest flows. Revoke anon+public → closes the unauthenticated vector with zero
-- access loss (authenticated + service_role retained).
--
-- Notably this closes anon reach to org-admin operations that should NEVER be
-- anon-callable — including the WRITE org_admin_reassign_member_resources and
-- the org-scoped write apply_template_by_key, plus org member/audit/overview
-- reads and the org/scope trees.
--
-- SCOPE authz caveat: list_scopes / list_scope_types / get_scope_tree /
-- search_scopes cross-ORG authorization is DELIBERATELY deferred to the D2
-- pre-launch security overhaul (project decision). This migration ONLY closes
-- the anon (no-JWT) floor on them — it does NOT implement the deferred
-- authenticated-cross-org model. Same for the authenticated-cross-org residual
-- on the org reads/writes and the cross-user residual on search_users_intelligent
-- (a user-search primitive, cross-user by design) — all tracked under D31/D2.
--
-- HELD OUT (need product/guest context, not touched here):
--   accept_organization_invitation  — guest/anon during signup (guest flow)
--   auth_is_org_admin/member/owner   — boolean predicates, possibly used in RLS
--   admin_promote / admin_find_user_by_email / mbr_list_for_user / assoc_set_targets
--     — already gated (is_super_admin / has_access); not exploitable
--
-- Idempotent.

-- org-admin family (no FE caller; must never be anon)
revoke execute on function public.org_admin_overview(p_org_id uuid) from anon, public;
revoke execute on function public.org_admin_list_members(p_org_id uuid) from anon, public;
revoke execute on function public.org_admin_get_member(p_org_id uuid, p_user_id uuid) from anon, public;
revoke execute on function public.org_admin_list_audit(p_org_id uuid, p_limit integer) from anon, public;
revoke execute on function public.org_admin_list_member_resources(p_org_id uuid, p_user_id uuid) from anon, public;
revoke execute on function public.org_admin_reassign_member_resources(p_org_id uuid, p_from_user uuid, p_to_user uuid, p_resource_types text[]) from anon, public;

-- org reads / writes
revoke execute on function public.get_org_structure(p_org_id uuid) from anon, public;
revoke execute on function public.get_organization_members_with_users(p_org_id uuid) from anon, public;
revoke execute on function public.apply_template_by_key(p_template_key text, p_org_id uuid) from anon, public;

-- scope reads (anon floor ONLY; cross-org authz stays D2-deferred)
revoke execute on function public.list_scopes(p_org_id uuid, p_type_id uuid, p_parent_scope_id uuid) from anon, public;
revoke execute on function public.list_scope_types(p_org_id uuid) from anon, public;
revoke execute on function public.get_scope_tree(p_org_id uuid, p_type_id uuid) from anon, public;
revoke execute on function public.search_scopes(p_org_id uuid, p_query text, p_type_id uuid) from anon, public;

-- context / tool resolution (service_role / backend callers)
revoke execute on function public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[]) from anon, public;
revoke execute on function public.tool_resolve_for_request(p_user_id uuid, p_client_executor text, p_surface_name text, p_active_server_executors text[]) from anon, public;

-- misc
revoke execute on function public.search_users_intelligent(search_term text, current_user_id uuid, max_results integer) from anon, public;
revoke execute on function public.ensure_folder_chain(p_owner_id uuid, p_folder_path text) from anon, public;
