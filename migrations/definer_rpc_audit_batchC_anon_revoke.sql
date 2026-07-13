-- definer_rpc_audit_batchC_anon_revoke.sql
--
-- AUTHORED 2026-07-12, NOT YET APPLIED — apply via Supabase MCP/aidream applier
-- after Arman approval, then record in _schema_migrations.
--
-- D31 audit, batch C. The 20 findings of the Data Integrity check
-- `definer-grant-anon-identity` (lib/integrity/checks.ts) reproduced live
-- 2026-07-12: SECURITY DEFINER fns in PostgREST-exposed schemas, EXECUTE-
-- reachable by `anon` (explicit grant OR default/PUBLIC acl), taking a
-- caller-supplied identity param, with no auth.uid()/auth.role()/
-- is_super_admin/service_role check in the body.
--
-- Classification method (all evidence gathered read-only 2026-07-12):
--   (a) pg_policies scanned across ALL schemas for each fn name (qual +
--       with_check), with the target tables' anon SELECT privilege checked;
--   (b) repo-wide rg for FE callers + caller-context review (anon/public
--       surface vs authenticated), plus aidream grep for backend callers;
--   (c) pg_proc scan for other functions referencing each fn (DEFINER
--       callers run as owner and are unaffected by an anon revoke).
--
-- Verdicts: 19 REVOKE below; 1 ALLOWLIST (public.can_read_processed_document
-- — RLS predicate of the roles={public} policy `derive_runs_owner_or_curator_all`
-- on docproc.derive_runs, where anon HAS table SELECT; revoking anon EXECUTE
-- would turn anon reads of that table into hard "permission denied for
-- function" errors instead of policy-filtered empties. Allowlisted in
-- DEFINER_GRANT_ALLOWLIST with the reason; the real fix is an auth.uid()-
-- derived policy wrapper — tracked under D31.) No DEFER verdicts: no finding
-- has any anon/public/guest-surface caller.
--
-- Role retention: every fn below keeps authenticated + service_role EXECUTE.
-- The two iam fns have a NULL (default) ACL — for those, a bare REVOKE FROM
-- PUBLIC would instantiate an owner-only ACL and cut authenticated too, so
-- they get explicit GRANTs in the same statement block.
--
-- Idempotent.

-- ── iam schema: default-ACL RLS/infra helpers ────────────────────────────────

-- iam.is_org_member(p_user, p_org) — boolean membership predicate (reads
-- iam.organization_member). proacl was NULL → executable by EVERYONE incl.
-- anon = membership oracle for any (user, org) pair.
-- (a) Used by 4 RLS policies (public.content_blocks, graveyard.shortcut_
--     categories_legacy, ui.ui_surface_agent_pref, ui.ui_surface_config) —
--     ALL roles={authenticated}, so anon reads never evaluate it; the GRANT
--     below keeps authenticated policy evaluation working.
-- (b) No FE RPC caller (only a docs string on app/(core)/files/admin/page.tsx).
-- (c) Called by files.webhook_org_guard / files.webhook_dispatch — both
--     SECURITY DEFINER (owner context, unaffected).
revoke execute on function iam.is_org_member(p_user uuid, p_org uuid) from anon, public;
grant execute on function iam.is_org_member(p_user uuid, p_org uuid) to authenticated, service_role;

-- iam.personal_org_id(p_user_id) — returns any user's personal-org uuid.
-- proacl was NULL → anon-callable org-id oracle.
-- (a) 0 RLS policy references.
-- (b) FE never calls it directly — every FE path uses the no-arg
--     current_personal_org_id() wrapper (lib/organizations/personalOrg.ts),
--     which is SECURITY DEFINER and calls this one as owner.
-- (c) Callers public.current_personal_org_id + public.get_ssr_shell_data are
--     both DEFINER (owner context, unaffected).
revoke execute on function iam.personal_org_id(p_user_id uuid) from anon, public;
grant execute on function iam.personal_org_id(p_user_id uuid) to authenticated, service_role;

-- ── public schema: WRITES anon must never reach ──────────────────────────────

-- rename_storage_folder(bucket, old_path, new_path, auth_user_id) — the worst
-- of the batch: UPDATEs storage.objects paths with NO authorization at all
-- (the auth_user_id param is never even read in the body). Anon could mass-
-- rename any folder in any storage bucket.
-- (a) 0 policy refs. (b) 0 FE callers, 0 aidream callers. (c) 0 fn refs.
revoke execute on function public.rename_storage_folder(bucket_name text, old_folder_path text, new_folder_path text, auth_user_id uuid) from anon, public;

-- transfer_organization_ownership(org_id, current_owner_id, new_owner_id) —
-- WRITE (iam.memberships role swap) gated ONLY on the caller-supplied
-- current_owner_id → anon passing the real owner's uuid transfers org
-- ownership to any member. D2 already notes this RPC "exists but is never
-- called". (a) 0 policy refs. (b) 0 FE/aidream callers. (c) 0 fn refs.
revoke execute on function public.transfer_organization_ownership(org_id uuid, current_owner_id uuid, new_owner_id uuid) from anon, public;

-- invite_to_organization(org_id, email, role, invited_by_user_id) — WRITE
-- (mints iam.invitations tokens) gated only on caller-supplied
-- invited_by_user_id via auth_is_org_admin(invited_by_user_id, org_id) →
-- anon passing a real admin's uuid can mint valid invite tokens (org-
-- infiltration vector). (a) 0 policy refs. (b) 0 FE/aidream callers.
-- (c) 0 fn refs.
revoke execute on function public.invite_to_organization(org_id uuid, email_address text, member_role org_role, invited_by_user_id uuid) from anon, public;

-- remove_sharing(permission_id, user_id default auth.uid()) — WRITE (DELETEs
-- permissions rows). The default is auth.uid() but the param is overridable:
-- anon passing the resource owner's uuid destroys sharing entries.
-- (a) 0 policy refs. (b) 0 FE/aidream callers. (c) 0 fn refs.
revoke execute on function public.remove_sharing(permission_id uuid, user_id uuid) from anon, public;

-- assoc_set_targets(...) — WRITE on platform.associations. In-body the delete
-- is gated by iam.has_org_access(organization_id) (auth.uid()-derived, so
-- anon deletes nothing) and inserts go through assoc_add — flagged because
-- the guard string isn't literally in prosrc. Revoke anon = defense in depth.
-- (a) 0 policy refs. (b) FE callers (features/scopes/service/*,
--     features/agents/agent-sets/service/agentSetsService.ts) are all
--     authenticated browser services. (c) 0 fn refs.
revoke execute on function public.assoc_set_targets(p_source_type text, p_source_id uuid, p_target_type text, p_target_ids uuid[], p_org_id uuid, p_role text) from anon, public;

-- create_scope_type(...) — WRITE on context.scope_types, in-body gated by
-- iam.has_org_access(p_org_id) (auth.uid()-derived → anon gets 42501).
-- Reached by anon only via the empty-grantee PUBLIC acl entry; authenticated
-- + service_role hold explicit grants that survive this revoke.
-- (a) 0 policy refs. (b) FE callers (features/scopes/service/scopesService.ts,
--     admin system-context surfaces) are authenticated/admin. (c) 0 fn refs.
revoke execute on function public.create_scope_type(p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid, p_icon text, p_description text, p_sort_order smallint, p_max_assignments smallint, p_default_variable_keys text[], p_color text, p_slug text) from anon, public;

-- check_file_rate_limit(p_actor_id, p_kind, p_limit) — WRITE (upserts
-- files.rate_limit_buckets). Anon could spam arbitrary actor_ids' buckets to
-- rate-limit-DoS real users. Sole caller is aidream common/account_tiers.py
-- via the cloud_sync SERVICE-ROLE client (serves guest uploads server-side —
-- never with the anon key), so service_role retention = zero access loss.
-- (a) 0 policy refs. (b) 0 FE callers. (c) 0 fn refs.
revoke execute on function public.check_file_rate_limit(p_actor_id uuid, p_kind text, p_limit integer) from anon, public;

-- ── public schema: reads that disclose data to anon ──────────────────────────

-- get_organization_members(org_id) — NO gate at all: returns every member's
-- email + full name (joins auth.users) for ANY org id → live PII disclosure
-- to the unauthenticated internet. (a) 0 policy refs. (b) FE callers
-- (features/organizations/service.ts, features/messaging/hooks/
-- useUserConnections.ts) are authenticated browser code. (c) 0 fn refs.
-- Authenticated-cross-org residual remains tracked under D31/D2.
revoke execute on function public.get_organization_members(org_id uuid) from anon, public;

-- mbr_list_for_user(p_user_id, p_container_type) — membership listing, per-row
-- gated by iam.has_org_access(m.organization_id) (auth.uid()-derived → anon
-- gets an empty set). Revoke = hygiene. (a) 0 policy refs. (b) FE caller
-- features/organizations/service/membershipsService.ts is authenticated.
-- (c) 0 fn refs.
revoke execute on function public.mbr_list_for_user(p_user_id uuid, p_container_type text) from anon, public;

-- ── public schema: boolean predicates (anon-facing oracles) ──────────────────
-- Each returns/raises on a caller-supplied identity → anon can probe org
-- membership/roles, curator status, or super-admin status of any uuid.
-- None appears in ANY pg_policies qual/with_check (verified all schemas), and
-- every in-DB caller is itself SECURITY DEFINER (owner context, unaffected).

-- auth_is_org_admin / auth_is_org_member / auth_is_org_owner — org-role
-- oracles. (b) 0 FE callers. (c) called only from invite_to_organization /
-- transfer_organization_ownership (DEFINER).
revoke execute on function public.auth_is_org_admin(user_id uuid, org_id uuid) from anon, public;
revoke execute on function public.auth_is_org_member(user_id uuid, org_id uuid) from anon, public;
revoke execute on function public.auth_is_org_owner(user_id uuid, org_id uuid) from anon, public;

-- is_super_admin_user(p_user) — super-admin oracle (reads admin.admins).
-- (c) called only from can_curate_library_document (DEFINER).
revoke execute on function public.is_super_admin_user(p_user uuid) from anon, public;

-- is_industry_curator(p_user, p_industry) — curator oracle (reads
-- iam.industry_curators). (b)(c) no callers anywhere.
revoke execute on function public.is_industry_curator(p_user uuid, p_industry uuid) from anon, public;

-- _library_assert_super_admin(p_actor) — internal assertion helper (RAISEs
-- unless p_actor is a super admin; returns void) = super-admin oracle via
-- exception. (c) called only from industry_curator_grant/revoke,
-- industry_upsert, rag.library_grant_publish/revoke — all DEFINER.
revoke execute on function public._library_assert_super_admin(p_actor uuid) from anon, public;

-- rag_source_has_library_grant(p_source_kind, p_source_id, p_org_id) —
-- library-grant predicate. (a) Referenced by 4 roles={public} RLS policies on
-- rag.embeddings_* / rag.kg_chunks, BUT anon has NO SELECT privilege on any
-- of those tables (verified has_table_privilege live), so the policies never
-- evaluate as anon and the revoke breaks nothing; authenticated keeps its
-- explicit EXECUTE for real policy evaluation. (b) 0 FE callers. (c) 0 fn refs.
revoke execute on function public.rag_source_has_library_grant(p_source_kind text, p_source_id text, p_org_id uuid) from anon, public;

-- user_can_read_data_store_via_grant(p_user, p_store) — grant-read predicate.
-- (a) 0 direct policy refs. (c) called only from iam.has_access_as /
-- iam.has_access_for, both SECURITY DEFINER (owner context, unaffected even
-- where iam.has_access gates anon-visible tables). (b) 0 FE callers.
revoke execute on function public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid) from anon, public;
