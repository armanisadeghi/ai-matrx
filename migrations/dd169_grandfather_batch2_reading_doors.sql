-- dd169_grandfather_batch2_reading_doors.sql
--
-- DD-169 batch 2 (B-64) — the READING grandfathers stop being grandfathers.
--
-- WHAT WAS TRUE BEFORE THIS FILE. After batch 1 (B-63) closed the 177 writing
-- grandfathers, 167 SECURITY DEFINER, non-trigger, STABLE/IMMUTABLE (reading)
-- functions could still be EXECUTEd by `anon` — the role behind the published
-- anon key — with no `platform.client_callable_door` row. Every one was shielded
-- by a `platform.definer_client_grant_grandfather` row: the 2026-08-28 snapshot
-- that makes the §6d-4 event trigger stand down. A grandfather row is not a
-- decision; it is the absence of one. This file replaces the absence with a
-- decision per function and deletes the row, so the guard watches it from now on.
--
-- THE EXTRA AXIS FOR READERS (the brief). A reader over a classed table must ask
-- `iam.assert_class_read` or return only the caller's own rows. All 7 functions
-- that keep `anon` are of the second kind and nothing else: each resolves
-- `auth.uid()` itself and answers ONLY about the caller, so an anonymous call
-- returns false or zero rows. Each was called live over HTTPS with the published
-- anon key on 2026-09-13 and its answer is recorded in its door row's reason.
--
-- THE THREE DECISIONS (per-function evidence: the B-64 report).
--   DECLARE (7)  — a real ANONYMOUS caller exists: an RLS policy or a
--       security_invoker view that `anon` can reach evaluates the function AS
--       ANON. Revoking EXECUTE would not close a door; it would turn "zero rows"
--       into "permission denied for function" on 42 tables. They are caller-
--       identity predicates, so anon learns nothing it did not already know.
--   NARROW  (124) — only signed-in callers exist. `anon` and PUBLIC lose EXECUTE;
--       `authenticated` keeps it AND gets a door row, because once the grandfather
--       row is gone the §6d-4 re-sweep would otherwise take the signed-in grant
--       too (its exemption list is grandfather-or-door, never anon-only).
--   CLOSE   (36) — no caller in matrx-frontend, aidream, matrx-extend or
--       matrx-local, no RLS policy, no view, no client-callable SECURITY INVOKER
--       function. EXECUTE revoked from PUBLIC, `anon` AND `authenticated`.
--
-- AND THE REST OF THE TABLE. The brief also asks that the grandfather table stop
-- being a pile of unexamined stand-downs. Beyond the 167 this file deletes every
-- row that is provably inert or already superseded, each class measured first:
--   C_dupe_door       33 — the function ALREADY has a client_callable_door row.
--                          The door row is the decision; the grandfather row is a
--                          second, silent one. This is the D2 blind spot B-63
--                          reported: D2 counts only grandfather rows with NO door,
--                          so these were invisible. D2 now sees them (D2b).
--   D_trigger        137 — trigger / event-trigger functions. Read the guard body
--                          (platform.enforce_definer_client_grants_impl): it skips
--                          `prorettype in (trigger, event_trigger)` on BOTH paths,
--                          so their grandfather rows can never do anything.
--   E_not_secdef      12 — SECURITY INVOKER functions. Same body, same skip
--                          (`if not fn.prosecdef then continue`).
--   A_function_missing 2 — no function of that schema/name/argtypes exists at all.
--   F_no_client_grant 453 — the function exists and holds NO client EXECUTE today,
--                          so deleting the row changes nothing now and means that
--                          if anyone GRANTs later the guard takes it back loudly
--                          instead of standing down in silence.
-- WHAT REMAINS: 608 rows for SECURITY DEFINER functions that `anon` cannot
-- execute but `authenticated` can, plus 25 `pgsodium` rows. The 608 are not this
-- batch's population — they are signed-in-only and carry no anonymous exposure —
-- so instead of rubber-stamping 608 doors nobody read, the §6d-4 guard
-- (`pnpm check:impl-doors`, D2) now requires every surviving row to NAME ITS
-- REASON AND OWNER in a declared allowlist and refuses any row that is not in it.
--
-- NOT TOUCHED: the 25 `pgsodium` rows (extension-owned; this role cannot REVOKE
-- on them and the guard exempts the schema by name).
--
-- ORDER MATTERS. Door rows go in FIRST: every REVOKE below is itself a grant-class
-- DDL command, and `platform.enforce_definer_client_grants` answers one of those
-- with a DB-wide re-sweep that revokes every client EXECUTE on a SECURITY DEFINER
-- holding neither a grandfather nor a door row. Measured immediately before
-- writing this file with the sweep's own predicate: 0 functions are in that state,
-- so the sweep has nothing else to take. Grandfather DELETEs go LAST, after every
-- grant statement, so no row loses its shield while a sweep can still fire.

-- ─── 1. Door rows: the 7 ANONYMOUS doors that stay open ──────────────────────
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'has_access', 'p_type text, p_id uuid, p_required permission_level', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate: the body is `iam.has_access_for((select auth.uid()), ...)`, so it answers only about the caller and returns FALSE to a caller with no session — it can never return a row belonging to anyone. It stays open to anon because 2 RLS policies anon can actually reach (workbench.udt_document_snapshots, workbench.udt_workbook_snapshots) call it; revoking EXECUTE would turn an anonymous statement on those tables into a raw `permission denied for function` instead of the zero rows the policy intends. Proven live over HTTPS with the published anon key 2026-09-13: 200 false.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'has_org_access', 'p_org uuid', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate: `iam.has_org_access_for((select auth.uid()), p_org)` — answers only about the caller, FALSE with no session, never a row of anyone else. It stays open to anon because an anon-readable security_invoker view calls it, and a view runs its expressions as the caller. Proven live over HTTPS with the published anon key 2026-09-13 against a real organization id: 200 false.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'my_orgs', '', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity reader: `select organization_id from iam.organization_member where user_id = (select auth.uid())` — it returns the CALLER''S OWN memberships and nothing else, so with no session it returns zero rows. It stays open to anon because 4 RLS policies anon can reach (docproc.page_extraction_results, docproc.page_extraction_runs, iam.permissions, tool.binding) call it; revoking EXECUTE would make an anonymous statement on those tables fail with a permission error instead of returning zero rows. Proven live over HTTPS with the published anon key 2026-09-13: 200 [].') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'has_permission', 'p_resource_type text, p_resource_id uuid, p_required_permission permission_level', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate: `public.has_permission_for((select auth.uid()), ...)` — answers only about the caller, FALSE with no session. It stays open to anon because an RLS policy anon can reach (workbench.udt_dataset_row_versions) and an anon-readable security_invoker view both call it. Proven live over HTTPS with the published anon key 2026-09-13 against a real resource id: 200 false.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_admin', '', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate: `exists (select 1 from admin.admins a where a.user_id = (select auth.uid()))` — it reads one row about the CALLER and returns a boolean; with no session it returns FALSE and discloses nothing. It stays open to anon because the RLS policy `catalog_entries_read` on public.catalog_entries is declared TO anon and calls it. Proven live over HTTPS with the published anon key 2026-09-13: 200 false.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_platform_admin', '', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate over public.current_user_is_admin keyed on (select auth.uid()) — a boolean about the CALLER, FALSE with no session, never anyone else''s row. It stays open to anon because 66 RLS policies across 42 tables that anon can reach call it; revoking EXECUTE would replace `zero rows` with `permission denied for function` on every one of them. Proven live over HTTPS with the published anon key 2026-09-13: 200 false.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_super_admin', '', 'DD-169 / B-64', 'ANONYMOUS door (anon keeps EXECUTE). Caller-identity predicate: `public.is_super_admin_for((select auth.uid()))` — a boolean about the CALLER, FALSE with no session. It stays open to anon because the RLS policy `admin_markdown_samples_super_admin_all` reaches anon and calls it. Proven live over HTTPS with the published anon key 2026-09-13: 200 false.') on conflict do nothing;

-- ─── 2. Door rows: the 124 SIGNED-IN doors that keep `authenticated` ─────────
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'entitlement_snapshot', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'org_capability_status', 'p_org uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'org_plan_list', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'plan_status', 'p_org uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'usage_admin_summary', 'p_from timestamp with time zone, p_to timestamp with time zone', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('esign', '_can_act', 'p_signer_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader named in the four repos but never as an RPC a client calls, and on no path an anonymous caller can take. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('esign', '_project', 'p_resource text, p_row jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader named in the four repos but never as an RPC a client calls, and on no path an anonymous caller can take. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('files', 'is_listable_for', 'p_user_id uuid, p_file_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader named in the four repos but never as an RPC a client calls, and on no path an anonymous caller can take. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'access_level', 'p_type text, p_id uuid, p_org uuid, p_owner uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'accessible_entity_ids', 'p_type text, p_required permission_level, p_depth integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos; used as a predicate in 1511 RLS policies that only a signed-in role can reach; called from 9 SECURITY INVOKER functions that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'accessible_entity_ids', 'p_type text, p_required permission_level, p_depth integer, p_include_public boolean', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos; used as a predicate in 1511 RLS policies that only a signed-in role can reach; called from 9 SECURITY INVOKER functions that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'has_org_admin', 'p_org uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 9 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'has_org_owner', 'p_org uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 1 RLS policy that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'runnable_agent_fields', 'p_agent_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 SECURITY INVOKER functions that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'runnable_version_fields', 'p_version_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos; called from 2 SECURITY INVOKER functions that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('iam', 'scraper_visible', 'p_schema text, p_table text, p_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 1 RLS policy that only a signed-in role can reach; called from 1 SECURITY INVOKER function that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'get_change_policy_divergence', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'purpose_for_unit', 'p_unit_type text, p_unit_id uuid, p_position integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', '__ddl_guard_unacked', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', '__hr_punch_write_path_conformance', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_denied_context', 'p_type text, p_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_gate_resolve_slug', 'p_type text, p_slug text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_request_list', 'p_box text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_find_user_by_email', 'p_email text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list_audit', 'p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list_for_assignment', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list_run_ai_calls', 'p_execution_kind text, p_execution_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list_run_history', 'p_limit integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_list_share_policies', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_taxonomy_list', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_defined_data', 'p_agent_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_execution_full', 'p_agent_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_execution_minimal', 'p_agent_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 7 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_list', 'p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_shortcuts_for_context', 'p_project_id uuid, p_task_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_shortcuts_initial', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_get_user_shortcuts', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_list_non_global_shortcuts_for_admin', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_search', 'p_query text, p_deep boolean, p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'assoc_list', 'p_type text, p_id uuid, p_direction text, p_role text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'can_read_processed_document', 'p_doc uuid, p_user uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 7 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'check_rate_limit', 'p_app_id uuid, p_user_id uuid, p_fingerprint text, p_ip_address inet', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_chasebox_counts', 'p_scope text, p_org_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_chasebox_items', 'p_queue text, p_scope text, p_org_id uuid, p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_check_send_eligibility', 'p_medium_id uuid, p_list_id uuid, p_identity_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_inbox_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_inbox_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_list_scope_counts', 'p_view text, p_kind text, p_search text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_list_scope_counts', 'p_view text, p_kind text, p_search text, p_record_class text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'current_personal_org_id', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos; called from 1 SECURITY INVOKER function that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'cvx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_archived text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'cvx_list_scope_counts', 'p_search text, p_deep boolean, p_archived text, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_class_state', 'p_class uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'fn_kg_cost_unit_economics', 'p_days integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_note_version', 'p_id text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_note_versions', 'p_note_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_notes_shared_with_me', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_org_module_settings', 'p_org_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_resource_access', 'p_resource_type text, p_resource_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_task_associations', 'p_task_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 8 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_tasks_for_entity', 'p_entity_type text, p_entity_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_full_context', 'p_user_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 11 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_list_with_items', 'p_list_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_nav_tree', 'p_user_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_table_complete', 'p_table_id uuid, p_sort_field text, p_sort_direction text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 9 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'industry_curator_list', 'p_industry uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'inv_for_me', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'inv_get_by_token', 'p_token text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 7 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_member_of_organization', 'p_org_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos; used as a predicate in 12 RLS policies that only a signed-in role can reach; called from 1 SECURITY INVOKER function that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_org_admin', 'p_org_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 10 signed-in call sites in the four repos; used as a predicate in 3 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_org_member', 'p_org_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos; used as a predicate in 3 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'is_resource_owner', 'p_resource_type text, p_resource_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos; used as a predicate in 3 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'ivw_list_facets', 'p_scope text, p_org_id uuid, p_search text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'ivw_list_scope_counts', 'p_search text, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_catalog', 'p_organization_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_list_grants', 'p_entity_type text, p_entity_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'list_context_value_refs', 'p_ref_type text, p_ref_key text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'list_trash', 'p_user_id uuid, p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 12 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'mkt_initiative_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'mkt_initiative_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'mnd_list_facets', 'p_search text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'my_industry_curatorships', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'orchestra_list', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'rag_user_can_see_note', 'p_note_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 4 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'readable_extraction_job_ids', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 2 RLS policies that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'readable_processed_doc_for_file', 'p_file uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'shape_doctor_gather', 'p_dataset text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'thread_contents', 'thread_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'trash_counts', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'trash_list', 'p_kinds text[], p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'trx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'trx_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'user_can_read_via_library_grant', 'p_user uuid, p_type text, p_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos; called from 1 SECURITY INVOKER function that only `authenticated` may execute. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'war_room_recent_activity', 'p_war_room_id uuid, p_limit integer, p_since timestamp with time zone', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'war_room_threads', 'room_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'wfx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_archived text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'wfx_list_scope_counts', 'p_search text, p_deep boolean, p_archived text, p_filters jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'fn_list_library_trash', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'kg_chunk_sources_cld_readable', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 1 RLS policy that only a signed-in role can reach. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'kg_chunk_sources_library_granted', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 1 RLS policy that only a signed-in role can reach. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'kg_chunk_sources_note_visible', '', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader used as a predicate in 1 RLS policy that only a signed-in role can reach. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', '_pack_assert_author', 'p_pack_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader named in the four repos but never as an RPC a client calls, and on no path an anonymous caller can take. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', '_pack_assert_creator', 'p_industry_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'geo_place_search', 'p_query text, p_kinds text[], p_limit integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_batch_question', 'p_site_id uuid, p_dimension text, p_size integer, p_exclude uuid[], p_days integer, p_word_overlap real', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_brand_identity', 'p_site_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader named in the four repos but never as an RPC a client calls, and on no path an anonymous caller can take. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_breakdown_keyword_ids', 'p_site_id uuid, p_start date, p_end date, p_filters jsonb, p_search text, p_limit integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_dimension_coverage', 'p_site_id uuid, p_start date, p_end date', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_geo_area_preview', 'p_site_id uuid, p_start date, p_end date, p_tokens jsonb, p_geo_band text, p_area_id uuid, p_sample integer, p_place_ids uuid[]', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_human_rulings', 'p_site_id uuid, p_dimension_slug text, p_start date, p_end date, p_limit integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_ingestion_health', 'p_site_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_keyword_class_review', 'p_site_id uuid, p_start date, p_end date, p_classes text[], p_sources text[], p_search text, p_sort text, p_sort_dir text, p_limit integer, p_offset integer, p_pattern text, p_match text, p_confirmed boolean, p_brand_alias text, p_filters jsonb, p_search_mode text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_keyword_locations', 'p_site_id uuid, p_keyword_ids uuid[], p_include_unplaced boolean', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_keyword_value_for_multi', 'p_pairs jsonb', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_perf_cannibalization', 'p_site_id uuid, p_start date, p_end date, p_min_impressions integer, p_min_share numeric, p_limit integer, p_offset integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 4 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_saved_views', 'p_site_id uuid, p_surface text', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_topic_placement_diff', 'p_site_id uuid, p_limit integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_value_combo_list', 'p_site_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_value_combo_preview', 'p_site_id uuid, p_start date, p_end date, p_value_ids uuid[], p_effect text, p_amount numeric, p_combo_id uuid, p_sample integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 3 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'keyword_classification_status', 'p_site_id uuid, p_min_impressions integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'keyword_place_status', 'p_site_id uuid, p_min_impressions integer', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 1 signed-in call site in the four repos. Its body resolves the caller (auth.uid() / an iam access predicate), so with no session it can only answer about nobody. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_site_adoptions', 'p_site_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 2 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_site_status', 'p_site_id uuid, p_pack_id uuid', 'DD-169 / B-64', 'SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 5 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.') on conflict do nothing;

-- ─── 3. The 9 signed-in doors that reached `authenticated` only through PUBLIC ──
-- Section 4 revokes PUBLIC. Without this an intended signed-in caller would lose
-- the function too, which is a silent break, not a security win.
grant execute on function esign._can_act(uuid) to authenticated;
grant execute on function esign._project(text,jsonb) to authenticated;
grant execute on function iam.access_level(text,uuid,uuid,uuid) to authenticated;
grant execute on function iam.has_org_admin(uuid) to authenticated;
grant execute on function iam.runnable_agent_fields(uuid) to authenticated;
grant execute on function iam.runnable_version_fields(uuid) to authenticated;
grant execute on function iam.scraper_visible(text,text,uuid) to authenticated;
grant execute on function seo.gsc_keyword_class_review(uuid,date,date,text[],text[],text,text,text,integer,integer,text,text,boolean,text,jsonb,text) to authenticated;
grant execute on function seo.gsc_keyword_locations(uuid,uuid[],boolean) to authenticated;

-- ─── 4. REVOKE: `anon` and PUBLIC lose the 124 reading doors ─────────────────
revoke execute on function billing.entitlement_snapshot() from public, anon;
revoke execute on function billing.org_capability_status(uuid) from public, anon;
revoke execute on function billing.org_plan_list() from public, anon;
revoke execute on function billing.plan_status(uuid) from public, anon;
revoke execute on function billing.usage_admin_summary(timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function esign._can_act(uuid) from public, anon;
revoke execute on function esign._project(text,jsonb) from public, anon;
revoke execute on function files.is_listable_for(uuid,uuid) from public, anon;
revoke execute on function iam.access_level(text,uuid,uuid,uuid) from public, anon;
revoke execute on function iam.accessible_entity_ids(text,permission_level,integer) from public, anon;
revoke execute on function iam.accessible_entity_ids(text,permission_level,integer,boolean) from public, anon;
revoke execute on function iam.has_org_admin(uuid) from public, anon;
revoke execute on function iam.has_org_owner(uuid) from public, anon;
revoke execute on function iam.runnable_agent_fields(uuid) from public, anon;
revoke execute on function iam.runnable_version_fields(uuid) from public, anon;
revoke execute on function iam.scraper_visible(text,text,uuid) from public, anon;
revoke execute on function platform.get_change_policy_divergence() from public, anon;
revoke execute on function platform.purpose_for_unit(text,uuid,integer) from public, anon;
revoke execute on function __ddl_guard_unacked() from public, anon;
revoke execute on function __hr_punch_write_path_conformance() from public, anon;
revoke execute on function access_denied_context(text,uuid) from public, anon;
revoke execute on function access_gate_resolve_slug(text,text) from public, anon;
revoke execute on function access_request_list(text) from public, anon;
revoke execute on function admin_find_user_by_email(text) from public, anon;
revoke execute on function admin_list() from public, anon;
revoke execute on function admin_list_audit(integer,integer) from public, anon;
revoke execute on function admin_list_for_assignment() from public, anon;
revoke execute on function admin_list_run_ai_calls(text,uuid) from public, anon;
revoke execute on function admin_list_run_history(integer) from public, anon;
revoke execute on function admin_list_share_policies() from public, anon;
revoke execute on function admin_taxonomy_list() from public, anon;
revoke execute on function agx_get_defined_data(uuid) from public, anon;
revoke execute on function agx_get_execution_full(uuid) from public, anon;
revoke execute on function agx_get_execution_minimal(uuid) from public, anon;
revoke execute on function agx_get_list(integer,integer) from public, anon;
revoke execute on function agx_get_shortcuts_for_context(uuid,uuid) from public, anon;
revoke execute on function agx_get_shortcuts_initial() from public, anon;
revoke execute on function agx_get_user_shortcuts() from public, anon;
revoke execute on function agx_list_non_global_shortcuts_for_admin() from public, anon;
revoke execute on function agx_search(text,boolean,integer,integer) from public, anon;
revoke execute on function assoc_list(text,uuid,text,text) from public, anon;
revoke execute on function can_read_processed_document(uuid,uuid) from public, anon;
revoke execute on function check_rate_limit(uuid,uuid,text,inet) from public, anon;
revoke execute on function crm_chasebox_counts(text,uuid) from public, anon;
revoke execute on function crm_chasebox_items(text,text,uuid,integer,integer) from public, anon;
revoke execute on function crm_check_send_eligibility(uuid,uuid,uuid) from public, anon;
revoke execute on function crm_inbox_list_facets(text,uuid,text,boolean) from public, anon;
revoke execute on function crm_inbox_list_scope_counts(text,boolean,jsonb) from public, anon;
revoke execute on function crm_list_scope_counts(text,text,text) from public, anon;
revoke execute on function crm_list_scope_counts(text,text,text,text) from public, anon;
revoke execute on function current_personal_org_id() from public, anon;
revoke execute on function cvx_list_facets(text,uuid,text,boolean,text) from public, anon;
revoke execute on function cvx_list_scope_counts(text,boolean,text,jsonb) from public, anon;
revoke execute on function edu_class_state(uuid) from public, anon;
revoke execute on function fn_kg_cost_unit_economics(integer) from public, anon;
revoke execute on function get_note_version(text) from public, anon;
revoke execute on function get_note_versions(uuid) from public, anon;
revoke execute on function get_notes_shared_with_me() from public, anon;
revoke execute on function get_org_module_settings(uuid) from public, anon;
revoke execute on function get_resource_access(text,uuid) from public, anon;
revoke execute on function get_task_associations(uuid) from public, anon;
revoke execute on function get_tasks_for_entity(text,uuid) from public, anon;
revoke execute on function get_user_full_context(uuid) from public, anon;
revoke execute on function get_user_list_with_items(uuid) from public, anon;
revoke execute on function get_user_nav_tree(uuid) from public, anon;
revoke execute on function get_user_table_complete(uuid,text,text) from public, anon;
revoke execute on function industry_curator_list(uuid) from public, anon;
revoke execute on function inv_for_me() from public, anon;
revoke execute on function inv_get_by_token(text) from public, anon;
revoke execute on function is_member_of_organization(uuid) from public, anon;
revoke execute on function is_org_admin(uuid) from public, anon;
revoke execute on function is_org_member(uuid) from public, anon;
revoke execute on function is_resource_owner(text,uuid) from public, anon;
revoke execute on function ivw_list_facets(text,uuid,text) from public, anon;
revoke execute on function ivw_list_scope_counts(text,jsonb) from public, anon;
revoke execute on function library_catalog(uuid) from public, anon;
revoke execute on function library_list_grants(text,uuid) from public, anon;
revoke execute on function list_context_value_refs(text,text) from public, anon;
revoke execute on function list_trash(uuid,integer,integer) from public, anon;
revoke execute on function mkt_initiative_list_facets(text,uuid,text,boolean,jsonb) from public, anon;
revoke execute on function mkt_initiative_list_scope_counts(text,boolean,jsonb) from public, anon;
revoke execute on function mnd_list_facets(text) from public, anon;
revoke execute on function my_industry_curatorships() from public, anon;
revoke execute on function orchestra_list() from public, anon;
revoke execute on function rag_user_can_see_note(uuid) from public, anon;
revoke execute on function readable_extraction_job_ids() from public, anon;
revoke execute on function readable_processed_doc_for_file(uuid) from public, anon;
revoke execute on function shape_doctor_gather(text) from public, anon;
revoke execute on function thread_contents(uuid) from public, anon;
revoke execute on function trash_counts() from public, anon;
revoke execute on function trash_list(text[],integer,integer) from public, anon;
revoke execute on function trx_list_facets(text,uuid,text,boolean) from public, anon;
revoke execute on function trx_list_scope_counts(text,boolean,jsonb) from public, anon;
revoke execute on function user_can_read_via_library_grant(uuid,text,uuid) from public, anon;
revoke execute on function war_room_recent_activity(uuid,integer,timestamp with time zone) from public, anon;
revoke execute on function war_room_threads(uuid) from public, anon;
revoke execute on function wfx_list_facets(text,uuid,text,boolean,text) from public, anon;
revoke execute on function wfx_list_scope_counts(text,boolean,text,jsonb) from public, anon;
revoke execute on function rag.fn_list_library_trash() from public, anon;
revoke execute on function rag.kg_chunk_sources_cld_readable() from public, anon;
revoke execute on function rag.kg_chunk_sources_library_granted() from public, anon;
revoke execute on function rag.kg_chunk_sources_note_visible() from public, anon;
revoke execute on function seo._pack_assert_author(uuid) from public, anon;
revoke execute on function seo._pack_assert_creator(uuid) from public, anon;
revoke execute on function seo.geo_place_search(text,text[],integer) from public, anon;
revoke execute on function seo.gsc_batch_question(uuid,text,integer,uuid[],integer,real) from public, anon;
revoke execute on function seo.gsc_brand_identity(uuid) from public, anon;
revoke execute on function seo.gsc_breakdown_keyword_ids(uuid,date,date,jsonb,text,integer) from public, anon;
revoke execute on function seo.gsc_dimension_coverage(uuid,date,date) from public, anon;
revoke execute on function seo.gsc_geo_area_preview(uuid,date,date,jsonb,text,uuid,integer,uuid[]) from public, anon;
revoke execute on function seo.gsc_human_rulings(uuid,text,date,date,integer) from public, anon;
revoke execute on function seo.gsc_ingestion_health(uuid) from public, anon;
revoke execute on function seo.gsc_keyword_class_review(uuid,date,date,text[],text[],text,text,text,integer,integer,text,text,boolean,text,jsonb,text) from public, anon;
revoke execute on function seo.gsc_keyword_locations(uuid,uuid[],boolean) from public, anon;
revoke execute on function seo.gsc_keyword_value_for_multi(jsonb) from public, anon;
revoke execute on function seo.gsc_perf_cannibalization(uuid,date,date,integer,numeric,integer,integer) from public, anon;
revoke execute on function seo.gsc_saved_views(uuid,text) from public, anon;
revoke execute on function seo.gsc_topic_placement_diff(uuid,integer) from public, anon;
revoke execute on function seo.gsc_value_combo_list(uuid) from public, anon;
revoke execute on function seo.gsc_value_combo_preview(uuid,date,date,uuid[],text,numeric,uuid,integer) from public, anon;
revoke execute on function seo.keyword_classification_status(uuid,integer) from public, anon;
revoke execute on function seo.keyword_place_status(uuid,integer) from public, anon;
revoke execute on function seo.starter_pack_site_adoptions(uuid) from public, anon;
revoke execute on function seo.starter_pack_site_status(uuid,uuid) from public, anon;

-- ─── 5. CLOSE: the 36 readers no client role calls at all ────────────────────
revoke execute on function billing.usage_admin_by_user(text,timestamp with time zone,timestamp with time zone,integer) from public, anon, authenticated;
revoke execute on function billing.usage_my_summary(timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
revoke execute on function esign._certificate_payload(uuid) from public, anon, authenticated;
revoke execute on function esign._may_manage(uuid,text) from public, anon, authenticated;
revoke execute on function esign._may_manage_campaign(uuid,text) from public, anon, authenticated;
revoke execute on function iam._container_authz(text,uuid,uuid) from public, anon, authenticated;
revoke execute on function iam.access_request_recipients(text,uuid) from public, anon, authenticated;
revoke execute on function iam.can_access_conversation(uuid) from public, anon, authenticated;
revoke execute on function iam.can_access_run(uuid) from public, anon, authenticated;
revoke execute on function iam.can_decide_access_request(uuid,text,uuid) from public, anon, authenticated;
revoke execute on function platform._lifecycle_partition_guard(text) from public, anon, authenticated;
revoke execute on function platform._outsider_parent_matches(text,uuid,uuid) from public, anon, authenticated;
revoke execute on function platform.rulebook_library_catalog(uuid) from public, anon, authenticated;
revoke execute on function _count_super_admins() from public, anon, authenticated;
revoke execute on function _edu_can_read_via_assignment(text,uuid) from public, anon, authenticated;
revoke execute on function _edu_can_read_via_assignment(uuid,text,uuid) from public, anon, authenticated;
revoke execute on function _edu_class(uuid) from public, anon, authenticated;
revoke execute on function _edu_is_owner(context.scopes) from public, anon, authenticated;
revoke execute on function _edu_is_scope_member(uuid) from public, anon, authenticated;
revoke execute on function can_read_extraction_job(uuid) from public, anon, authenticated;
revoke execute on function can_read_processed_document_any(uuid,uuid) from public, anon, authenticated;
revoke execute on function curatable_processed_document_ids() from public, anon, authenticated;
revoke execute on function get_admin_status() from public, anon, authenticated;
revoke execute on function get_project_members_with_users(uuid) from public, anon, authenticated;
revoke execute on function get_prompt_app_execution_payload(uuid) from public, anon, authenticated;
revoke execute on function get_prompt_app_public_data(text,uuid) from public, anon, authenticated;
revoke execute on function get_user_scopes(uuid) from public, anon, authenticated;
revoke execute on function kg_caller_can_target_scope(uuid) from public, anon, authenticated;
revoke execute on function mnd_list_scope_counts(text) from public, anon, authenticated;
revoke execute on function readable_processed_document_ids() from public, anon, authenticated;
revoke execute on function user_container_ids(text,text[]) from public, anon, authenticated;
revoke execute on function user_owns_file(uuid) from public, anon, authenticated;
revoke execute on function user_owns_folder(uuid) from public, anon, authenticated;
revoke execute on function seo.gsc_offering_stats(uuid,date,date) from public, anon, authenticated;
revoke execute on function web.offering_templates_for_site(uuid,text) from public, anon, authenticated;
revoke execute on function web.site_offerings(uuid) from public, anon, authenticated;

-- ─── 6. The grandfather rows go ──────────────────────────────────────────────
-- 167 (this batch's population) + 637 provably inert or already-superseded rows.
delete from platform.definer_client_grant_grandfather g
 where (g.schema_name, g.function_name, g.identity_args) in (
  ('agent', 'create_review_thread', ''),
  ('agent', 'enforce_surface_binding_scope_integrity', ''),
  ('agent', 'guard_global_surface_binding', ''),
  ('agent', 'sanitize_definition_tool_references', ''),
  ('audit', 'refresh_static', ''),
  ('billing', 'entitlement_snapshot', ''),
  ('billing', 'org_capability_status', 'p_org uuid'),
  ('billing', 'org_plan_list', ''),
  ('billing', 'plan_status', 'p_org uuid'),
  ('billing', 'seed_prelaunch_complimentary', ''),
  ('billing', 'usage_admin_by_user', 'p_capability text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer'),
  ('billing', 'usage_admin_summary', 'p_from timestamp with time zone, p_to timestamp with time zone'),
  ('billing', 'usage_my_summary', 'p_from timestamp with time zone, p_to timestamp with time zone'),
  ('browser', '_action_event_append_only', ''),
  ('chat', 'admin_user_usage_rollup', 'p_from timestamp with time zone, p_to timestamp with time zone'),
  ('chat', 'cx_overview_kpis', 'p_start timestamp with time zone, p_end timestamp with time zone, p_user_id uuid'),
  ('chat', 'cx_usage_analytics', 'p_start timestamp with time zone, p_end timestamp with time zone'),
  ('communication', '_set_notification_outcome', 'p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone'),
  ('communication', 'admit_pending_sms_command_turn', 'p_inbound_message_id uuid'),
  ('communication', 'claim_pending_sms_agent_turns', 'p_worker_id text, p_limit integer, p_lease_seconds integer'),
  ('communication', 'claim_pending_sms_command_turns', 'p_worker_id text, p_limit integer, p_lease_seconds integer'),
  ('communication', 'claim_pending_sms_outbound_attempts', 'p_worker_id text, p_limit integer, p_lease_seconds integer'),
  ('communication', 'claim_recoverable_sms_command_turns', 'p_worker_id text, p_limit integer, p_lease_seconds integer'),
  ('communication', 'claim_voice_call_consent_event', 'p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_event_key text, p_program_key text, p_disclosure_version text, p_disclosure_text_hash text, p_disclosed_at timestamp with time zone, p_response_kind text, p_response_value text, p_consented_at timestamp with time zone, p_source text'),
  ('communication', 'claim_voice_call_lifecycle_event', 'p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_event_key text, p_sequence integer, p_status text, p_occurred_at timestamp with time zone'),
  ('communication', 'claim_voice_playback_activity', 'p_interaction_id uuid, p_organization_id uuid, p_program_key text, p_session_id uuid, p_provider_session_id text, p_source_event_key_sha256 text, p_provider_payload_verified boolean, p_playback jsonb'),
  ('communication', 'claim_voice_recording_custody_work', 'p_worker_id text, p_limit integer, p_lease_seconds integer, p_max_attempts integer'),
  ('communication', 'claim_voice_recording_lifecycle_event', 'p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_recording_id text, p_provider_event_key text, p_status text, p_recording_started_at timestamp with time zone, p_duration_seconds integer, p_channels smallint, p_source text, p_track text, p_provider_media_url text'),
  ('communication', 'confirm_sms_tool_authorization', 'p_call_id text, p_user_id uuid, p_recent_auth_at timestamp with time zone'),
  ('communication', 'consume_sms_tool_authorization', 'p_user_id uuid, p_organization_id uuid, p_conversation_id uuid, p_action_digest text'),
  ('communication', 'enqueue_notification_sms', 'p_notification_id uuid, p_program_key text'),
  ('communication', 'enqueue_sms_assistant_test', 'p_user_id uuid, p_destination_identity_id uuid, p_body text, p_idempotency_key text'),
  ('communication', 'fail_voice_recording_custody_work', 'p_source_event_id bigint, p_claim_token uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_after_seconds integer, p_operator_detail text, p_canonical_file_id uuid, p_cleanup_required boolean, p_max_attempts integer'),
  ('communication', 'finalize_sms_agent_turn', 'p_inbound_message_id uuid, p_worker_id text, p_status text, p_request_id uuid, p_reply text, p_error_code text, p_operator_detail text, p_execution_known_not_started boolean, p_retry_after_seconds integer, p_replies text[]'),
  ('communication', 'finalize_sms_agent_turn_jsonb', 'p_inbound_message_id uuid, p_worker_id text, p_status text, p_request_id uuid, p_reply text, p_error_code text, p_operator_detail text, p_execution_known_not_started boolean, p_retry_after_seconds integer, p_replies jsonb'),
  ('communication', 'finalize_sms_outbound_attempt', 'p_outbound_message_id uuid, p_worker_id text, p_provider_creation_outcome text, p_status text, p_provider_message_id text, p_error_code text, p_error_message text, p_retry_after_seconds integer'),
  ('communication', 'finalize_voice_recording_file', 'p_provider text, p_provider_account_id text, p_provider_call_id text, p_provider_recording_id text, p_source_event_key text, p_file_id uuid'),
  ('communication', 'has_exact_sms_task_done_offer', 'p_inbound_message_id uuid'),
  ('communication', 'issue_voice_agent_session_reference', 'p_reference_sha256 text, p_session_id uuid, p_expires_at timestamp with time zone, p_interaction_id uuid, p_chat_conversation_id uuid, p_consent_event_id bigint, p_mandate_id uuid, p_mandate_key text, p_definition_agent_id uuid, p_agent_version_id uuid, p_mandate_provenance text, p_mandate_config_overrides jsonb, p_transport text'),
  ('communication', 'record_provider_delivery', 'p_provider_message_id text, p_delivered_at timestamp with time zone, p_channel text'),
  ('communication', 'record_verified_sms_phone', 'p_user_id uuid, p_phone_number text, p_verified_at timestamp with time zone, p_source text'),
  ('communication', 'register_voice_call_interaction', 'p_party_id uuid, p_contact_point_id uuid, p_organization_id uuid, p_recording_owner_id uuid, p_direction text, p_provider text, p_provider_account_id text, p_provider_call_id text, p_program_key text, p_from_address text, p_to_address text, p_occurred_at timestamp with time zone'),
  ('communication', 'resolve_channel_address', 'p_channel text, p_organization_id uuid, p_recipient_kind text, p_recipient_user_id uuid, p_recipient_party_id uuid, p_actor_token_id uuid, p_literal_address text'),
  ('communication', 'resolve_voice_owner_call_context', 'p_program_key text, p_destination_id uuid, p_provider text, p_provider_account_id text, p_caller_phone text, p_called_phone text'),
  ('communication', 'sms_notification_gate', 'p_notification_id uuid, p_now timestamp with time zone'),
  ('communication', 'voice_call_consent_persistence_readiness', 'p_program_key text'),
  ('communication', 'voice_recording_persistence_readiness', ''),
  ('content_ir', 'guard_kind_is_active_write', ''),
  ('content_ir', 'guard_kind_shape_uniqueness', ''),
  ('content_ir', 'kind_definition_revalidate_examples', ''),
  ('content_ir', 'kind_definition_revalidate_instances', ''),
  ('content_ir', 'kind_example_recompute_validation', ''),
  ('content_ir', 'kind_instance_recompute_validation', ''),
  ('content_ir', 'resolve_kind_version', 'p_organization_id uuid, p_kind text, p_version integer'),
  ('context', 'enforce_context_item_reference_source', ''),
  ('context', 'provision_scope_datasets_trigger', ''),
  ('crm', '_affiliation_edge', ''),
  ('crm', '_candidate_on_merge', ''),
  ('crm', '_contact_point_shape', ''),
  ('crm', '_deal_stage_shape', ''),
  ('crm', '_deal_stage_track', ''),
  ('crm', '_inherit_parent_org', ''),
  ('crm', '_party_name_key', ''),
  ('crm', '_provision_signed_up_user_party', ''),
  ('crm', '_sync_hr_phone_to_contact_graph', ''),
  ('crm', 'ensure_user_party', 'p_user_id uuid, p_source text'),
  ('crm', 'evaluate_outreach_list_quality', 'p_list_id uuid'),
  ('crm', 'honor_consent_decision', 'p_decision text, p_via text, p_reason text, p_identity_id uuid, p_in_reply_to_provider_message_id text, p_reply_provider_message_id text, p_detected_phrase text, p_received_at timestamp with time zone, p_detail jsonb, p_medium_id uuid, p_organization_id uuid, p_channel text, p_value_key text, p_value_raw text'),
  ('crm', 'sweep_sending_health', 'p_window interval'),
  ('docproc', 'canonical_repoint_on_lifecycle', ''),
  ('docproc', 'cascade_file_softdelete_to_documents', ''),
  ('docproc', 'sync_page_image_file_association', ''),
  ('docproc', 'sync_processed_doc_file_association', ''),
  ('education', 'bump_study_streak', ''),
  ('education', 'edu_purge_expired_study_data', 'p_retention_days integer, p_max_users integer'),
  ('education', 'guard_game_attempt_authority', ''),
  ('esign', '_can_act', 'p_signer_id uuid'),
  ('esign', '_certificate_payload', 'p_envelope_id uuid'),
  ('esign', '_may_manage', 'p_envelope_id uuid, p_level text'),
  ('esign', '_may_manage_campaign', 'p_campaign_id uuid, p_level text'),
  ('esign', '_project', 'p_resource text, p_row jsonb'),
  ('files', 'crawl_site_conveys', 'p_user_id uuid, p_file_id uuid'),
  ('files', 'crawl_variant_tagging_drift', ''),
  ('files', 'files_client_policy_metadata_guard', ''),
  ('files', 'files_org_move_guard', ''),
  ('files', 'is_crawl_artifact', 'p_file_id uuid'),
  ('files', 'is_listable_for', 'p_user_id uuid, p_file_id uuid'),
  ('files', 'reject_web_artifact_file_mutation', ''),
  ('files', 'webhook_org_guard', ''),
  ('growth', '_assign_loop_event_seq', ''),
  ('hr', '_approval_subject', 'p_target_table text, p_target_id uuid'),
  ('hr', '_break_glass_active', 'p_user uuid, p_token text, p_id uuid'),
  ('hr', '_can_edit_punch', 'p_user uuid, p_employment_id uuid, p_at date'),
  ('hr', '_clock_knob', 'p_key text, p_default jsonb, p_organization_id uuid'),
  ('hr', '_day_time_facts', 'p_employment_id uuid, p_local_work_date date, p_pay_period_id uuid'),
  ('hr', '_derive_on_authority', ''),
  ('hr', '_derive_on_employee_login', ''),
  ('hr', '_derive_on_employment', ''),
  ('hr', '_derive_on_interview', ''),
  ('hr', '_derive_on_position', ''),
  ('hr', '_derive_on_requisition', ''),
  ('hr', '_derive_on_role_assignment', ''),
  ('hr', '_desired_grants_for_employment', 'p_employment_id uuid, p_at date'),
  ('hr', '_desired_grants_for_requisition', 'p_requisition_id uuid, p_at date'),
  ('hr', '_door_get', 'p_token text, p_id uuid, p_purpose text, p_justification text, p_break_glass boolean, p_expect_tier text'),
  ('hr', '_door_list', 'p_token text, p_filter jsonb, p_limit integer, p_cursor text, p_purpose text, p_expect_tier text'),
  ('hr', '_door_verdict', 'p_user uuid, p_token text, p_id uuid, p_break_glass boolean'),
  ('hr', '_earning_code_id', 'p_organization_id uuid, p_code text'),
  ('hr', '_employee_display_name', 'p_employee_id uuid, p_uid uuid'),
  ('hr', '_employment_expiry', 'p_employment_id uuid'),
  ('hr', '_employments_of_identity', 'p_user uuid'),
  ('hr', '_enroll_pay_period_rows', 'p_pay_period_id uuid, p_employment_id uuid'),
  ('hr', '_exception_in_pay_period', 'p_employment_id uuid, p_date date, p_pay_period_id uuid'),
  ('hr', '_governance_refusal', 'p_org uuid, p_target_token text, p_reason_code text, p_reason text, p_subject_employment uuid, p_target_ids uuid[]'),
  ('hr', '_guard_hr_write', ''),
  ('hr', '_hr_knob', 'p_feature text, p_key text, p_organization_id uuid, p_default jsonb'),
  ('hr', '_incident_excluded_actors_refresh', ''),
  ('hr', '_incident_party_redrive_veto', ''),
  ('hr', '_jurisdiction_rule_status_authority_gate', ''),
  ('hr', '_kiosk_admin_gate', 'p_organization_id uuid'),
  ('hr', '_kiosk_device_config', 'p_device_id uuid'),
  ('hr', '_kiosk_device_row', 'p_id uuid'),
  ('hr', '_knob', 'p_feature text, p_key text'),
  ('hr', '_l1_apply_compensation', 'p_payload jsonb, p_org uuid, p_instance uuid'),
  ('hr', '_l1_apply_position', 'p_payload jsonb, p_org uuid, p_instance uuid'),
  ('hr', '_l1_capabilities', 'p_user uuid, p_org uuid, p_at date'),
  ('hr', '_l1_is_manager_of', 'p_user uuid, p_subject_employment uuid, p_at date'),
  ('hr', '_l1_module_enabled', 'p_org uuid'),
  ('hr', '_l1_next_employee_number', 'p_org uuid, p_attempt integer'),
  ('hr', '_l1_notify_consent_requested', 'p_request_id uuid'),
  ('hr', '_l1_org_role', 'p_user uuid, p_org uuid'),
  ('hr', '_l1_persona', 'p_user uuid, p_org uuid, p_at date'),
  ('hr', '_l1_self_employment', 'p_user uuid, p_org uuid, p_at date'),
  ('hr', '_l1_settings_gate', 'p_org uuid, p_token text, p_action text'),
  ('hr', '_l1_viewer', 'p_user uuid, p_employee_id uuid, p_at date'),
  ('hr', '_l1_write_audit', 'p_org uuid, p_token text, p_action text, p_ids uuid[], p_subject_employment uuid, p_purpose text, p_tier text, p_self boolean'),
  ('hr', '_l1_write_gate', 'p_org uuid, p_capability text, p_subject_employment uuid, p_token text, p_action text, p_purpose text'),
  ('hr', '_leave_admin_rung', 'p_organization_id uuid'),
  ('hr', '_leave_case_rung', 'p_case_id uuid'),
  ('hr', '_leave_has_reports', 'p_employment_id uuid'),
  ('hr', '_leave_jurisdiction_key_or_federal', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', '_leave_lead_days', 'p_key text, p_organization_id uuid'),
  ('hr', '_leave_manages', 'p_manager_employment_id uuid, p_employment_id uuid'),
  ('hr', '_leave_policy_at', 'p_leave_policy_id uuid'),
  ('hr', '_leave_policy_probe', 'p_case text'),
  ('hr', '_leave_reason_is_mandated', 'p_reason_category_id uuid, p_mandated jsonb'),
  ('hr', '_leave_viewer', 'p_employment_id uuid'),
  ('hr', '_leave_worker_class_ok', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', '_limits_satisfied', 'p_limits jsonb, p_target_table text, p_target_id uuid'),
  ('hr', '_notify_channels', 'p_event_key text, p_organization_id uuid'),
  ('hr', '_ot_preapproval_decided', ''),
  ('hr', '_period_for_day', 'p_employment_id uuid, p_local_work_date date'),
  ('hr', '_period_pending', 'p_employment_id uuid, p_workweek_id uuid'),
  ('hr', '_ppe_rollup_refresh', 'p_pay_period_id uuid, p_employment_id uuid, p_engine_key text, p_engine_version text, p_batch uuid'),
  ('hr', '_project_row', 'p_token text, p_schema text, p_table text, p_id uuid'),
  ('hr', '_punch_auto_close_orphan', 'p_employment_id uuid'),
  ('hr', '_punch_capability', 'p_user uuid, p_capability text, p_subject_employment uuid, p_at date, p_organization_id uuid'),
  ('hr', '_punch_chain_conflict', 'p_employment_id uuid, p_date date, p_void_ids uuid[], p_add jsonb'),
  ('hr', '_punch_elapsed', 'p_employment_id uuid, p_now timestamp with time zone'),
  ('hr', '_punch_ip_visible', 'p_user uuid, p_employment_id uuid, p_at date, p_mine uuid[]'),
  ('hr', '_punch_knob', 'p_key text, p_default jsonb, p_organization_id uuid'),
  ('hr', '_punch_notify_edited', 'p_organization_id uuid, p_employment_id uuid, p_voided_punch_id uuid, p_replacement_punch_id uuid, p_reason text, p_actor_user uuid, p_change jsonb'),
  ('hr', '_punch_open_chain', 'p_employment_id uuid'),
  ('hr', '_punch_open_chain_as_of', 'p_employment_id uuid, p_at timestamp with time zone'),
  ('hr', '_punch_orphan_threshold_hours', 'p_organization_id uuid, p_juris jsonb'),
  ('hr', '_punch_period_lock', 'p_employment_id uuid, p_date date'),
  ('hr', '_punch_raise_exception', 'p_organization_id uuid, p_employment_id uuid, p_punch_id uuid, p_kind text, p_severity text, p_juris jsonb, p_calc jsonb, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone'),
  ('hr', '_punch_resolve_juris', 'p_employment_id uuid, p_occurred_at timestamp with time zone'),
  ('hr', '_punch_state_as_of', 'p_employment_id uuid, p_at timestamp with time zone'),
  ('hr', '_punch_state_of', 'p_employment_id uuid'),
  ('hr', '_punch_unfinalize_week', 'p_employment_id uuid, p_local_work_date date'),
  ('hr', '_recompute_enqueue', 'p_employment_id uuid, p_local_work_date date, p_organization_id uuid, p_reason text'),
  ('hr', '_reconcile_grants', 'p_scope_kind text, p_scope_id uuid, p_at date'),
  ('hr', '_record_access_audit', 'p_organization_id uuid, p_action text, p_target_token text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[], p_row_count integer, p_subject_employment_id uuid, p_record_class_key text, p_sensitivity_tier text, p_field_key text, p_is_self_access boolean, p_request_context jsonb, p_justification text, p_is_break_glass boolean, p_denial_reason text, p_access_role_key text, p_request_ref text, p_actor_type text, p_actor_employment_id uuid, p_actor_user_id uuid'),
  ('hr', '_refresh_current_position', ''),
  ('hr', '_rules_evidence', 'p_ids uuid[]'),
  ('hr', '_run_fixture_probe', 'p_probe text, p_input jsonb'),
  ('hr', '_seed_founding_authorities', 'p_organization_id uuid, p_holder_employment_id uuid, p_basis text'),
  ('hr', '_subject_display_name', 'p_employment_id uuid, p_uid uuid'),
  ('hr', '_subject_jurisdiction_key', 'p_subject_type text, p_subject_id uuid'),
  ('hr', '_subject_jurisdiction_key', 'p_subject_type text, p_subject_id uuid, p_as_of date'),
  ('hr', '_sync_legal_hold_count', ''),
  ('hr', '_time_actor_employment', 'p_user uuid, p_organization_id uuid'),
  ('hr', '_time_exception_json', 'p_id uuid'),
  ('hr', '_time_grid_reach', 'p_user uuid, p_pay_period_id uuid, p_at date'),
  ('hr', '_time_has_timecard_approve', 'p_user uuid, p_organization_id uuid, p_at date'),
  ('hr', '_time_interval_json', 'p_id uuid'),
  ('hr', '_time_not_employed_refusal', 'p_uid uuid, p_tail text'),
  ('hr', '_time_ot_preapproval_json', 'p_id uuid'),
  ('hr', '_time_punch_enabled_worker_classes', ''),
  ('hr', '_time_subject_clause', 'p_uid uuid, p_employment_id uuid, p_at date, p_fallback text'),
  ('hr', '_timecard_reject_reopen', ''),
  ('hr', '_wf_absent', 'p_employment_id uuid, p_at date'),
  ('hr', '_wf_apply', 'p_instance uuid'),
  ('hr', '_wf_auto_decide', 'p_step uuid, p_ctx jsonb'),
  ('hr', '_wf_call_digest', 'p_flow_key text, p_org uuid, p_target_token text, p_target_id uuid'),
  ('hr', '_wf_call_hook', 'p_fn regprocedure, p_arg uuid'),
  ('hr', '_wf_change_digest', 'p_token text, p_row_id uuid, p_patch jsonb'),
  ('hr', '_wf_change_entitlement', 'p_instance uuid'),
  ('hr', '_wf_close_instance', 'p_instance uuid, p_state text, p_reason text'),
  ('hr', '_wf_close_step', 'p_step uuid, p_state text, p_reason text'),
  ('hr', '_wf_display', 'p_step uuid, p_contentless boolean'),
  ('hr', '_wf_door_smoke', ''),
  ('hr', '_wf_event', 'p_instance uuid, p_step uuid, p_kind text, p_from text, p_to text, p_actor_type text, p_actor_user uuid, p_actor_emp uuid, p_detail jsonb'),
  ('hr', '_wf_failure', 'p_instance uuid, p_step uuid, p_class text, p_detail jsonb'),
  ('hr', '_wf_grant_step', 'p_step uuid'),
  ('hr', '_wf_holder_employments', 'p_holder_kind text, p_holder_id text, p_org uuid, p_at date'),
  ('hr', '_wf_instance_visible', 'p_instance uuid, p_user uuid'),
  ('hr', '_wf_join', 'p_instance uuid'),
  ('hr', '_wf_login_of', 'p_employment_id uuid'),
  ('hr', '_wf_may_see_change', 'p_user uuid, p_entitlement jsonb'),
  ('hr', '_wf_not_attested', 'p_step uuid, p_actor uuid, p_note text'),
  ('hr', '_wf_notice_outcome', 'p_step uuid, p_outcome text, p_user uuid'),
  ('hr', '_wf_notify', 'p_instance uuid, p_step uuid, p_event_key text, p_notice_kind text, p_user uuid, p_employment uuid, p_extra jsonb'),
  ('hr', '_wf_notify_delegation', 'p_delegation uuid, p_delegator uuid, p_delegate uuid, p_org uuid'),
  ('hr', '_wf_pay_change_digest', 'p_payload jsonb, p_assignment uuid'),
  ('hr', '_wf_prior_deciders', 'p_instance uuid'),
  ('hr', '_wf_project_step', 'p_step uuid'),
  ('hr', '_wf_revoke_step', 'p_step uuid'),
  ('hr', '_wf_route', 'p_instance uuid'),
  ('hr', '_wf_row_summary', 'p_flow_key text, p_target_token text, p_target_id uuid'),
  ('hr', '_wf_subject_may_self_act', 'p_employment uuid, p_action_type text, p_target_table text, p_target_id uuid, p_at date'),
  ('hr', '_wf_target_changed', 'p_instance uuid, p_new_digest text'),
  ('hr', '_wf_target_table', 'p_token text'),
  ('hr', '_wf_two_actor_action', 'p_action_type text'),
  ('hr', '_wf_unproject_step', 'p_step uuid, p_outcome text'),
  ('hr', 'access_audit_page', 'p_from timestamp with time zone, p_to timestamp with time zone, p_subject_token text, p_include_self boolean, p_limit integer, p_cursor timestamp with time zone'),
  ('hr', 'access_explain', 'p_user uuid, p_token text, p_id uuid'),
  ('hr', 'address_change_wf_apply', 'p_instance_id uuid'),
  ('hr', 'arm_write', ''),
  ('hr', 'attendance_exception_list', 'p_filters jsonb, p_page jsonb'),
  ('hr', 'attendance_exception_resolve', 'p_exception_id uuid, p_resolution_state text, p_note text, p_premium_earning_code_id uuid'),
  ('hr', 'can_approve', 'p_user uuid, p_action_type text, p_target_table text, p_target_id uuid, p_at date'),
  ('hr', 'clock_state', 'p_employment_id uuid'),
  ('hr', 'corrective_ack_wf_apply', 'p_instance_id uuid'),
  ('hr', 'dead_capability_doors', ''),
  ('hr', 'definer_functions_client_reachable', ''),
  ('hr', 'derive_grants_bulk', 'p_employment_ids uuid[], p_at date'),
  ('hr', 'derive_grants_due', 'p_window interval'),
  ('hr', 'derive_grants_for_actor', 'p_user_id uuid, p_at date'),
  ('hr', 'derive_grants_for_employment', 'p_employment_id uuid, p_at date'),
  ('hr', 'derive_grants_for_requisition', 'p_requisition_id uuid, p_at date'),
  ('hr', 'dispose_records', 'p_class_key text, p_as_of date, p_dry_run boolean'),
  ('hr', 'doors_with_ambiguous_signatures', ''),
  ('hr', 'earning_code_seed_org', 'p_organization_id uuid'),
  ('hr', 'eeo_aggregate', 'p_dimension text, p_population jsonb, p_as_of date'),
  ('hr', 'employee_by_party', 'p_organization_id uuid, p_party_id uuid'),
  ('hr', 'employments_of', 'p_user uuid, p_at date'),
  ('hr', 'export_advisory_money_blocks', 'p_organization_id uuid, p_pay_period_id uuid'),
  ('hr', 'export_claim', 'p_organization_id uuid, p_pay_period_id uuid, p_export_format text, p_idempotency_key text, p_includes_pii boolean, p_supersedes_export_id uuid'),
  ('hr', 'export_finish', 'p_organization_id uuid, p_export_id uuid, p_lines jsonb, p_artifact_file_id uuid, p_artifact_sha256 text, p_total_hours text, p_total_amount text, p_adjustment_ids uuid[], p_disputes_carried jsonb'),
  ('hr', 'export_get', 'p_organization_id uuid, p_export_id uuid'),
  ('hr', 'export_line_source', 'p_organization_id uuid, p_pay_period_id uuid, p_export_format text, p_include_adjustments boolean'),
  ('hr', 'export_period_facts', 'p_organization_id uuid, p_pay_period_id uuid'),
  ('hr', 'export_transition', 'p_organization_id uuid, p_export_id uuid, p_action text, p_acknowledgement_ref text, p_acknowledged_at timestamp with time zone, p_failure_reason text'),
  ('hr', 'function_contracts_broken', ''),
  ('hr', 'grant_drift', ''),
  ('hr', 'heal_grant_drift', ''),
  ('hr', 'incident_excluded', 'p_user uuid, p_incident uuid'),
  ('hr', 'jurisdiction_chain', 'p_key text'),
  ('hr', 'jurisdiction_rule_set_status', 'p_rule_id uuid, p_new_status text, p_reason text'),
  ('hr', 'jurisdiction_rules_admin_data', ''),
  ('hr', 'kiosk_device_list', 'p_organization_id uuid'),
  ('hr', 'kiosk_device_set_capture', 'p_device_id uuid, p_require_photo boolean, p_require_geo boolean'),
  ('hr', 'kiosk_device_set_trust', 'p_device_id uuid, p_trust_state text, p_reason text'),
  ('hr', 'kiosk_pairing_code_create', 'p_organization_id uuid, p_device_name text, p_location_id uuid, p_device_id uuid'),
  ('hr', 'law_portal_data', 'p_organization_id uuid'),
  ('hr', 'leave_adjust', 'p_employment_id uuid, p_leave_policy_id uuid, p_direction text, p_hours numeric, p_reason_category text, p_note text, p_confirm_below_floor boolean'),
  ('hr', 'leave_balances', 'p_organization_id uuid, p_scope text, p_filters jsonb'),
  ('hr', 'leave_balances_export', 'p_organization_id uuid, p_scope text, p_filters jsonb'),
  ('hr', 'leave_calendar', 'p_organization_id uuid, p_from date, p_to date, p_filters jsonb'),
  ('hr', 'leave_calendar_ics', 'p_organization_id uuid, p_from date, p_to date, p_filters jsonb'),
  ('hr', 'leave_case_entitlement', 'p_case_id uuid, p_as_of date'),
  ('hr', 'leave_case_get', 'p_case_id uuid'),
  ('hr', 'leave_case_list', 'p_organization_id uuid'),
  ('hr', 'leave_case_open', 'p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date, p_entitlement_hours numeric, p_entitlement_measure text, p_expected_return_on date, p_runs_concurrent_with_pto boolean, p_concurrent_policy_ids uuid[], p_leave_request_id uuid'),
  ('hr', 'leave_day_hours', 'p_employment_id uuid, p_date date'),
  ('hr', 'leave_door_grant_audit', ''),
  ('hr', 'leave_enroll', 'p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date'),
  ('hr', 'leave_enroll', 'p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date, p_override_reason text'),
  ('hr', 'leave_enrollment_refresh', 'p_employment_id uuid, p_leave_policy_id uuid'),
  ('hr', 'leave_enrollments_out_of_scope', 'p_organization_id uuid'),
  ('hr', 'leave_figures', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', 'leave_hours_format_debt', ''),
  ('hr', 'leave_ledger_export', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', 'leave_ledger_post', 'p_employment_id uuid, p_leave_policy_id uuid, p_entry_kind text, p_hours_delta numeric, p_occurred_on date, p_note text, p_leave_request_id uuid, p_reverses_entry_id uuid, p_source_workweek_id uuid, p_source_work_interval_id uuid, p_amount numeric, p_rate numeric, p_engine_key text, p_engine_version text, p_rule_version_ids uuid[], p_calc jsonb, p_actor_type text, p_actor_employment_id uuid, p_actor_user_id uuid, p_period_key text, p_snapshot_inputs jsonb, p_clamps jsonb'),
  ('hr', 'leave_ledger_view', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', 'leave_operating_jurisdictions', 'p_organization_id uuid'),
  ('hr', 'leave_policy_deactivate', 'p_leave_policy_id uuid, p_disposition text, p_migrate_to_policy_id uuid, p_note text'),
  ('hr', 'leave_policy_floors', 'p_organization_id uuid, p_payload jsonb'),
  ('hr', 'leave_policy_list', 'p_organization_id uuid'),
  ('hr', 'leave_policy_save', 'p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean'),
  ('hr', 'leave_policy_validate', 'p_organization_id uuid, p_payload jsonb'),
  ('hr', 'leave_project_balance', 'p_employment_id uuid, p_leave_policy_id uuid, p_as_of date'),
  ('hr', 'leave_reinstate_on_rehire', 'p_new_employment_id uuid'),
  ('hr', 'leave_request_cancel', 'p_request_id uuid, p_reason text, p_hours numeric'),
  ('hr', 'leave_request_preview', 'p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date, p_day_parts jsonb'),
  ('hr', 'leave_request_submit', 'p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date, p_day_parts jsonb, p_reason_category_id uuid, p_reason_note text, p_leave_case_id uuid, p_idempotency_key text'),
  ('hr', 'leave_requests_without_an_approver', ''),
  ('hr', 'leave_span_hours', 'p_employment_id uuid, p_starts_on date, p_ends_on date, p_day_parts jsonb'),
  ('hr', 'leave_wf_apply', 'p_instance uuid'),
  ('hr', 'leave_wf_conflict', 'p_instance uuid'),
  ('hr', 'leave_wf_digest', 'p_target_token text, p_target_id uuid'),
  ('hr', 'leave_wf_validate', 'p_instance uuid'),
  ('hr', 'manager_chain', 'p_employment_id uuid, p_at date'),
  ('hr', 'member_employee_links', 'p_organization_id uuid, p_user_ids uuid[]'),
  ('hr', 'my_compensation', 'p_employment_id uuid, p_as_of date'),
  ('hr', 'my_time_off', 'p_employment_id uuid'),
  ('hr', 'name_rule_violations', ''),
  ('hr', 'notify_outsider_doors_client_reachable', ''),
  ('hr', 'org_jurisdiction_rule_deactivate', 'p_organization_id uuid, p_rule_id uuid'),
  ('hr', 'org_jurisdiction_rule_save', 'p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean'),
  ('hr', 'org_jurisdiction_rule_set_applies', 'p_organization_id uuid, p_rule_class text, p_jurisdiction_key text, p_applies boolean, p_reason text'),
  ('hr', 'ot_preapproval_wf_apply', 'p_instance_id uuid'),
  ('hr', 'ot_preapproval_wf_conflict', 'p_instance_id uuid'),
  ('hr', 'ot_preapproval_wf_digest', 'p_target_token text, p_target_id uuid'),
  ('hr', 'ot_preapproval_wf_validate', 'p_instance_id uuid'),
  ('hr', 'overtime_preapproval_create', 'p_employment_id uuid, p_covers_from timestamp with time zone, p_covers_to timestamp with time zone, p_requested_hours numeric, p_request_kind text, p_reason_category_id uuid, p_reason_note text, p_shift_ids uuid[]'),
  ('hr', 'overtime_preapproval_get', 'p_preapproval_id uuid'),
  ('hr', 'overtime_preapproval_list', 'p_filters jsonb, p_page jsonb'),
  ('hr', 'pay_change_wf_apply', 'p_instance_id uuid'),
  ('hr', 'pay_change_wf_validate', 'p_instance_id uuid'),
  ('hr', 'pay_changes_without_an_approver', ''),
  ('hr', 'pay_period_generate', 'p_pay_group_id uuid, p_through_date date'),
  ('hr', 'pay_period_get', 'p_pay_period_id uuid'),
  ('hr', 'pay_period_list', 'p_filters jsonb, p_page jsonb'),
  ('hr', 'pay_period_transition', 'p_pay_period_id uuid, p_to_state text, p_reason text'),
  ('hr', 'period_approval_staleness', 'p_pay_period_id uuid'),
  ('hr', 'population_contains', 'p_scope_kind text, p_scope_id uuid, p_employment_id uuid, p_at date, p_holder_employment_id uuid, p_scope_employment_ids uuid[], p_organization_id uuid'),
  ('hr', 'position_change_wf_apply', 'p_instance_id uuid'),
  ('hr', 'position_change_wf_validate', 'p_instance_id uuid'),
  ('hr', 'position_subtree', 'p_holder_employment_id uuid, p_at date'),
  ('hr', 'profile_edit_wf_apply', 'p_instance_id uuid'),
  ('hr', 'provider_binding_resolve', 'p_organization_id uuid, p_seam text, p_provider_key text'),
  ('hr', 'provider_bindings_list', 'p_organization_id uuid, p_seam text'),
  ('hr', 'provider_event_record', 'p_organization_id uuid, p_binding_id uuid, p_seam text, p_provider_key text, p_direction text, p_path text, p_subject_token text, p_subject_id uuid, p_provider_event_id text, p_external_ref text, p_external_status text, p_mapped_state text, p_result_summary text, p_payload_summary jsonb, p_artifact_file_id uuid, p_signature_verified boolean, p_occurred_at timestamp with time zone'),
  ('hr', 'provider_sync_targets', 'p_organization_id uuid, p_seam text, p_binding_id uuid, p_subject_ids uuid[]'),
  ('hr', 'provider_webhook_candidates', 'p_seam text, p_provider_key text'),
  ('hr', 'punch_correct', 'p_punch_ids uuid[], p_new_values jsonb, p_reason text, p_category uuid'),
  ('hr', 'punch_orphan_sweep', 'p_organization_id uuid, p_dry_run boolean'),
  ('hr', 'punch_record', 'p_employment_id uuid, p_kind text, p_occurred_at timestamp with time zone, p_source text, p_idempotency_key text, p_kiosk_session_id uuid, p_geo jsonb, p_photo_file_id uuid, p_attestation jsonb'),
  ('hr', 'punch_register', 'p_filters jsonb, p_page jsonb'),
  ('hr', 'punch_void', 'p_punch_id uuid, p_reason text'),
  ('hr', 'punch_write_path_conformance', ''),
  ('hr', 'raise_compliance_exception', 'p_organization_id uuid, p_jurisdiction_key text, p_rule_id uuid, p_rule_version integer, p_class text, p_code text, p_message text, p_org_config_ref jsonb'),
  ('hr', 'read_confidential', 'p_token text, p_id uuid, p_purpose text, p_break_glass boolean, p_justification text'),
  ('hr', 'recompute_apply', 'p_employment_id uuid, p_workweek jsonb, p_intervals jsonb, p_engine jsonb, p_idempotency_key text'),
  ('hr', 'recompute_enqueue_debt', ''),
  ('hr', 'recompute_queue_claim', 'p_limit integer, p_lease_seconds integer'),
  ('hr', 'recompute_queue_complete', 'p_id uuid, p_ok boolean, p_error text'),
  ('hr', 'refresh_current_positions_due', 'p_window interval'),
  ('hr', 'resolve_rules', 'p_subject_type text, p_subject_id uuid, p_as_of date, p_classes text[], p_facts jsonb, p_organization_id uuid, p_jurisdiction_key text'),
  ('hr', 'resolve_rules_display', 'p_organization_id uuid, p_jurisdiction_key text, p_as_of date, p_classes text[]'),
  ('hr', 'retention_due_on', 'p_token text, p_id uuid'),
  ('hr', 'rollup_overtime_undisclosed', ''),
  ('hr', 'rpc_calculation_snapshot_get', 'p_snapshot_id uuid'),
  ('hr', 'rule_vocabulary_drift', ''),
  ('hr', 'run_rule_fixtures', 'p_codes text[]'),
  ('hr', 'stable_doors_that_write', ''),
  ('hr', 'stamp_retention_triggers', 'p_employment_id uuid'),
  ('hr', 'time_adjustment_create', 'p_employment_id uuid, p_original_pay_period_id uuid, p_work_date date, p_earning_code_id uuid, p_hours_delta numeric, p_amount_delta numeric, p_reason_category_id uuid, p_reason_note text'),
  ('hr', 'time_adjustment_list', 'p_filters jsonb, p_page jsonb'),
  ('hr', 'time_adjustment_wf_apply', 'p_instance_id uuid'),
  ('hr', 'time_adjustment_wf_validate', 'p_instance_id uuid'),
  ('hr', 'time_rounding_config_check', 'p_organization_id uuid, p_rounding_minutes integer, p_rounding_mode text, p_jurisdiction_keys text[], p_as_of date'),
  ('hr', 'timecard_attestation_sweep', 'p_pay_period_id uuid, p_dry_run boolean'),
  ('hr', 'timecard_wf_apply', 'p_instance_id uuid'),
  ('hr', 'timecard_wf_conflict', 'p_instance_id uuid'),
  ('hr', 'timecard_wf_digest', 'p_target_token text, p_target_id uuid'),
  ('hr', 'timecard_wf_validate', 'p_instance_id uuid'),
  ('hr', 'timecards_without_an_approver', ''),
  ('hr', 'timesheet_get', 'p_employment_id uuid, p_pay_period_id uuid'),
  ('hr', 'timesheet_period_grid', 'p_pay_period_id uuid, p_filters jsonb, p_page jsonb'),
  ('hr', 'transfer_restricted_note', 'p_id uuid, p_new_owner uuid'),
  ('hr', 'validate_org_config', 'p_organization_id uuid, p_class text, p_parameters jsonb, p_jurisdiction_keys text[], p_as_of date'),
  ('hr', 'verify_employment_pin', 'p_employment_id uuid, p_pin text'),
  ('hr', 'wf_activate_step', 'p_step uuid, p_exclude uuid[]'),
  ('hr', 'wf_apply_unimplemented', 'p_instance_id uuid'),
  ('hr', 'wf_bulk_decide', 'p_step_ids uuid[], p_decision text, p_reason text'),
  ('hr', 'wf_cancel', 'p_instance_id uuid, p_reason text'),
  ('hr', 'wf_decide', 'p_step_id uuid, p_decision text, p_reason text, p_payload jsonb'),
  ('hr', 'wf_delegate', 'p_to_holder_kind text, p_to_holder_id uuid, p_action_type text, p_scope_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_reason text'),
  ('hr', 'wf_digest_whole_row', 'p_target_token text, p_target_id uuid'),
  ('hr', 'wf_escalate', 'p_step_id uuid, p_reason text'),
  ('hr', 'wf_for_target', 'p_target_token text, p_target_id uuid'),
  ('hr', 'wf_inbox', 'p_scope text, p_employment_id uuid, p_filters jsonb'),
  ('hr', 'wf_instance', 'p_instance_id uuid'),
  ('hr', 'wf_pending', 'p_employment_id uuid, p_filters jsonb'),
  ('hr', 'wf_publish_definition', 'p_definition_id uuid'),
  ('hr', 'wf_reassign_step', 'p_step_id uuid, p_to_employment_id uuid, p_reason text'),
  ('hr', 'wf_record_result', 'p_step_id uuid, p_result jsonb, p_verified boolean'),
  ('hr', 'wf_request', 'p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid, p_payload jsonb, p_subject_employment_id uuid, p_as_draft boolean, p_idempotency_key text'),
  ('hr', 'wf_resolve_approvers', 'p_step_id uuid, p_exclude_employment_ids uuid[]'),
  ('hr', 'wf_resolve_failure', 'p_failure_id uuid, p_action text, p_note text'),
  ('hr', 'wf_resubmit', 'p_instance_id uuid, p_payload jsonb'),
  ('hr', 'wf_result_unimplemented', 'p_step_id uuid'),
  ('hr', 'wf_submit', 'p_instance_id uuid'),
  ('hr', 'wf_tick', ''),
  ('hr', 'wf_withdraw', 'p_instance_id uuid, p_reason text'),
  ('iam', '_container_authz', 'p_container_type text, p_container_id uuid, p_actor uuid'),
  ('iam', 'access_level', 'p_type text, p_id uuid, p_org uuid, p_owner uuid'),
  ('iam', 'access_request_recipients', 'p_type text, p_id uuid'),
  ('iam', 'accessible_entity_ids', 'p_type text, p_required permission_level, p_depth integer'),
  ('iam', 'accessible_entity_ids', 'p_type text, p_required permission_level, p_depth integer, p_include_public boolean'),
  ('iam', 'can_access_conversation', 'p_conv uuid'),
  ('iam', 'can_access_run', 'p_run uuid'),
  ('iam', 'can_decide_access_request', 'p_user_id uuid, p_type text, p_id uuid'),
  ('iam', 'has_access', 'p_type text, p_id uuid, p_required permission_level'),
  ('iam', 'has_org_access', 'p_org uuid'),
  ('iam', 'has_org_admin', 'p_org uuid'),
  ('iam', 'has_org_owner', 'p_org uuid'),
  ('iam', 'my_orgs', ''),
  ('iam', 'runnable_agent_fields', 'p_agent_id uuid'),
  ('iam', 'runnable_version_fields', 'p_version_id uuid'),
  ('iam', 'scraper_visible', 'p_schema text, p_table text, p_id uuid'),
  ('ops', '_stamp_capture_org', ''),
  ('pgbouncer', 'get_auth', 'p_usename text'),
  ('plan', '_node_cascade', ''),
  ('plan', '_node_shape', ''),
  ('plan', '_require_branded_site', ''),
  ('plan', '_site_edge', ''),
  ('plan', '_stamp_from_node', ''),
  ('plan', '_status_flow_guard', ''),
  ('platform', '_custom_entity_definition_guard', ''),
  ('platform', '_custom_field_definition_guard', ''),
  ('platform', '_custom_field_target_validate', ''),
  ('platform', '_custom_record_grant_guard', ''),
  ('platform', '_custom_record_guard', ''),
  ('platform', '_gc_entity_associations', ''),
  ('platform', '_gc_scope_associations', ''),
  ('platform', '_lifecycle_partition_guard', 'p_partition text'),
  ('platform', '_mirror_m2m_to_assoc', ''),
  ('platform', '_outsider_parent_matches', 'p_resource text, p_id uuid, p_parent uuid'),
  ('platform', '_stamp_actor', ''),
  ('platform', '_version_capture', ''),
  ('platform', 'assist_admission_decision', 'p_source_key text, p_user_id uuid'),
  ('platform', 'build_lifecycle_reference_map', ''),
  ('platform', 'ddl_guard_ack', 'p_reason text, p_by text, p_ids bigint[], p_rule text, p_object_ref text, p_before timestamp with time zone'),
  ('platform', 'emit_run_lifecycle', ''),
  ('platform', 'enforce_known_association', ''),
  ('platform', 'enforce_retention_policy_settling', ''),
  ('platform', 'entity_grants_purge_data_store', ''),
  ('platform', 'entity_grants_purge_rulebook', ''),
  ('platform', 'entity_grants_purge_seo_starter_pack', ''),
  ('platform', 'entity_type_has_shareable_ancestor', 'p_type text'),
  ('platform', 'flag_entity_types_on_drop', ''),
  ('platform', 'get_change_policy_divergence', ''),
  ('platform', 'heal_reachability_drift', ''),
  ('platform', 'lifecycle_archive_candidates', 'p_entity_token text, p_owner_id uuid, p_max_rows integer'),
  ('platform', 'lifecycle_archive_commit', 'p_run_id uuid, p_entity_token text, p_owner_id uuid, p_ids uuid[], p_bucket text, p_object_key text, p_row_count integer, p_bytes bigint, p_checksum text, p_tier text'),
  ('platform', 'lifecycle_assert_delete_cost_modelled', 'p_entity_token text'),
  ('platform', 'lifecycle_close_run', 'p_run_id uuid, p_entities_acted integer, p_status text'),
  ('platform', 'lifecycle_execute', 'p_run_id uuid, p_entity_token text, p_owner_id uuid, p_max_rows integer, p_dry_run boolean'),
  ('platform', 'lifecycle_map_is_fresh', ''),
  ('platform', 'lifecycle_open_run', 'p_dry_run boolean'),
  ('platform', 'lifecycle_partition_count', 'p_partition text'),
  ('platform', 'lifecycle_partition_page', 'p_partition text, p_limit integer, p_after_id bigint'),
  ('platform', 'lifecycle_schema_fingerprint', ''),
  ('platform', 'lifecycle_sweep_plan', 'p_entity_token text, p_max_entities integer, p_max_owners_per_entity integer'),
  ('platform', 'lifecycle_tier_ledger_check', 'p_table text, p_partition text'),
  ('platform', 'lifecycle_tier_ledger_record', 'p_table text, p_partition text, p_iceberg text, p_rows_pg bigint, p_rows_ice bigint, p_verified boolean'),
  ('platform', 'lifecycle_vault_read', 'p_name text'),
  ('platform', 'log_activity', 'p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb, p_actor uuid'),
  ('platform', 'mint_outsider_token', 'p_consumer_key text, p_subject_type text, p_subject_id uuid, p_scope jsonb, p_organization_id uuid, p_recipient jsonb, p_overrides jsonb'),
  ('platform', 'propagate_plan_page_research_lineage', ''),
  ('platform', 'purpose_for_unit', 'p_unit_type text, p_unit_id uuid, p_position integer'),
  ('platform', 'reachability_definition_parity', ''),
  ('platform', 'reachability_drift', ''),
  ('platform', 'reanchor_outsider_token', 'p_token_id uuid'),
  ('platform', 'rebuild_reachability', ''),
  ('platform', 'refresh_reachability', 'p_container_type text, p_container_id uuid'),
  ('platform', 'resolve_retention_policy', 'p_entity_token text, p_organization_id uuid, p_user_id uuid'),
  ('platform', 'retention_predicate_matches', 'p_predicate jsonb, p_user_id uuid'),
  ('platform', 'revive_tombstoned_association', ''),
  ('platform', 'revoke_outsider_token', 'p_token_id uuid, p_reason text'),
  ('platform', 'rulebook_library_catalog', 'p_organization_id uuid'),
  ('platform', 'stamp_run_org', ''),
  ('platform', 'sweep_orphaned_associations', 'p_dry_run boolean'),
  ('platform', 'sync_entity_types_on_ddl', ''),
  ('platform', 'trg_reachability_on_association', ''),
  ('platform', 'trg_reachability_on_rules', ''),
  ('platform', 'validate_edge_payload', ''),
  ('private', 'enforce_assist_admission', ''),
  ('private', 'sweep_marketing_finding_assists', ''),
  ('public', '__ddl_guard_unacked', ''),
  ('public', '__hr_punch_write_path_conformance', ''),
  ('public', '_admin_audit_trigger', ''),
  ('public', '_count_super_admins', ''),
  ('public', '_edu_can_read_via_assignment', 'p_type text, p_id uuid'),
  ('public', '_edu_can_read_via_assignment', 'p_user_id uuid, p_type text, p_id uuid'),
  ('public', '_edu_class', 'p_class uuid'),
  ('public', '_edu_generate_join_code', ''),
  ('public', '_edu_is_active_member', 'p_scope uuid, p_user uuid'),
  ('public', '_edu_is_owner', 'p_scope context.scopes'),
  ('public', '_edu_is_scope_member', 'p_scope uuid'),
  ('public', '_edu_resource_progress', 'p_token text, p_resource uuid, p_user uuid'),
  ('public', '_library_audit', 'p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid, p_industry_id uuid, p_org uuid, p_detail jsonb'),
  ('public', '_library_entity_owner', 'p_entity_type text, p_entity_id uuid'),
  ('public', '_library_publish_gate', 'p_entity_type text, p_entity_id uuid, p_audience text'),
  ('public', '_notify_suggestion_sweep_context_item', ''),
  ('public', '_notify_suggestion_sweep_scope', ''),
  ('public', '_notify_suggestion_sweep_scope_type', ''),
  ('public', '_provision_new_user_personal_org', ''),
  ('public', '_provision_new_user_profile', ''),
  ('public', '_stamp_org_default', ''),
  ('public', 'access_denied_context', 'p_type text, p_id uuid'),
  ('public', 'access_drift_report', ''),
  ('public', 'access_gate_resolve_slug', 'p_type text, p_slug text'),
  ('public', 'access_matrix_tree', 'p_store uuid'),
  ('public', 'access_request_list', 'p_box text'),
  ('public', 'admin_find_user_by_email', 'p_email text'),
  ('public', 'admin_get_columns', 'p_table_name text'),
  ('public', 'admin_list', ''),
  ('public', 'admin_list_audit', 'p_limit integer, p_offset integer'),
  ('public', 'admin_list_for_assignment', ''),
  ('public', 'admin_list_run_ai_calls', 'p_execution_kind text, p_execution_id uuid'),
  ('public', 'admin_list_run_history', 'p_limit integer'),
  ('public', 'admin_list_share_policies', ''),
  ('public', 'admin_taxonomy_list', ''),
  ('public', 'agent_resource_add', 'p_agent_id uuid, p_source_type text, p_source_id uuid, p_label text, p_metadata jsonb'),
  ('public', 'agent_resource_remove', 'p_agent_id uuid, p_source_type text, p_source_id uuid'),
  ('public', 'agx_get_defined_data', 'p_agent_id uuid'),
  ('public', 'agx_get_execution_full', 'p_agent_id uuid'),
  ('public', 'agx_get_execution_minimal', 'p_agent_id uuid'),
  ('public', 'agx_get_list', 'p_limit integer, p_offset integer'),
  ('public', 'agx_get_shortcuts_for_context', 'p_project_id uuid, p_task_id uuid'),
  ('public', 'agx_get_shortcuts_initial', ''),
  ('public', 'agx_get_user_shortcuts', ''),
  ('public', 'agx_list_non_global_shortcuts_for_admin', ''),
  ('public', 'agx_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_favorites_first boolean, p_archived text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'agx_search', 'p_query text, p_deep boolean, p_limit integer, p_offset integer'),
  ('public', 'agx_usage_scan_core', 'p_agent_id uuid, p_viewer uuid, p_scope text'),
  ('public', 'apply_template_definition', 'p_org_id uuid, p_definition jsonb'),
  ('public', 'apply_usage_delta', 'p_user_id uuid, p_bytes_delta bigint, p_files_delta integer, p_record_upload boolean, p_upload_bytes bigint'),
  ('public', 'assoc_add', 'p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid, p_label text, p_metadata jsonb, p_role text, p_position integer, p_payload_kind text, p_payload jsonb'),
  ('public', 'assoc_for_entity', 'p_type text, p_id uuid'),
  ('public', 'assoc_for_sources', 'p_source_type text, p_source_ids uuid[], p_target_type text'),
  ('public', 'assoc_for_targets', 'p_target_type text, p_target_ids uuid[]'),
  ('public', 'assoc_list', 'p_type text, p_id uuid, p_direction text, p_role text'),
  ('public', 'assoc_members_visible', 'p_target_type text, p_target_ids uuid[]'),
  ('public', 'assoc_remove', 'p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text'),
  ('public', 'assoc_remove_for_entity', 'p_type text, p_id uuid'),
  ('public', 'assoc_set_targets', 'p_source_type text, p_source_id uuid, p_target_type text, p_target_ids uuid[], p_org_id uuid, p_role text'),
  ('public', 'can_read_extraction_job', 'p_job uuid'),
  ('public', 'can_read_processed_document', 'p_doc uuid, p_user uuid'),
  ('public', 'can_read_processed_document_any', 'p_doc uuid, p_user uuid'),
  ('public', 'canonical_ratchet_refresh', ''),
  ('public', 'canonical_ratchet_snapshot', 'p_cutoff timestamp with time zone, p_min_score integer'),
  ('public', 'cascade_table_security_settings', ''),
  ('public', 'cat_create', 'p_dimension text, p_name text, p_org_id uuid, p_parent_id uuid, p_color text, p_icon text, p_slug text'),
  ('public', 'cat_delete', 'p_category_id uuid'),
  ('public', 'cat_list', 'p_dimension text'),
  ('public', 'cat_reparent', 'p_category_id uuid, p_parent_id uuid'),
  ('public', 'cat_update', 'p_category_id uuid, p_name text, p_slug text, p_color text, p_icon text, p_position integer'),
  ('public', 'check_prompt_app_drift', 'p_user_id uuid'),
  ('public', 'check_rate_limit', 'p_app_id uuid, p_user_id uuid, p_fingerprint text, p_ip_address inet'),
  ('public', 'check_upload_quota', 'p_user_id uuid, p_size_bytes bigint, p_is_guest boolean'),
  ('public', 'claim_feedback_item', 'p_id uuid, p_admin_notes text, p_ai_assessment text, p_autonomy_score integer'),
  ('public', 'cleanup_deleted_sandboxes', 'retention_days integer'),
  ('public', 'cmt_list', 'p_entity_type text, p_entity_id uuid'),
  ('public', 'conversation_file_add', 'p_conversation_id uuid, p_file_id uuid, p_label text, p_metadata jsonb, p_replace_metadata boolean'),
  ('public', 'conversation_file_remove', 'p_conversation_id uuid, p_file_id uuid'),
  ('public', 'conversation_files', 'p_conversation_id uuid'),
  ('public', 'create_personal_organization', ''),
  ('public', 'create_share_link', 'p_resource_type text, p_resource_id uuid, p_permission_level text, p_expires_at timestamp with time zone, p_max_uses integer, p_label text'),
  ('public', 'creator_resolve_featured_resource', 'p_token text, p_id uuid'),
  ('public', 'crm_chasebox_counts', 'p_scope text, p_org_id uuid'),
  ('public', 'crm_chasebox_items', 'p_queue text, p_scope text, p_org_id uuid, p_limit integer, p_offset integer'),
  ('public', 'crm_check_send_eligibility', 'p_medium_id uuid, p_list_id uuid, p_identity_id uuid'),
  ('public', 'crm_inbox_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean'),
  ('public', 'crm_inbox_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb'),
  ('public', 'crm_inbox_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'crm_list_scope_counts', 'p_view text, p_kind text, p_search text'),
  ('public', 'crm_list_scope_counts', 'p_view text, p_kind text, p_search text, p_record_class text'),
  ('public', 'ctx_projects_add_creator_membership', ''),
  ('public', 'curatable_processed_document_ids', ''),
  ('public', 'current_personal_org_id', ''),
  ('public', 'cvx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_archived text'),
  ('public', 'cvx_list_scope_counts', 'p_search text, p_deep boolean, p_archived text, p_filters jsonb'),
  ('public', 'cvx_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_favorites_first boolean, p_archived text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'cx_message_edit', 'p_message_id uuid, p_new_content jsonb'),
  ('public', 'detect_self_containment_row_cycles', ''),
  ('public', 'dm_default_org', ''),
  ('public', 'dm_participant_sync_grant', ''),
  ('public', 'duplicate_row', 'p_table_name text, p_source_id uuid, p_excluded_columns text[]'),
  ('public', 'dynamic_search', 'p_table_name text, p_search_field text, p_search_value text, p_page_number integer, p_page_size integer'),
  ('public', 'edu_class_confer_purchase', 'p_class uuid, p_user uuid'),
  ('public', 'edu_class_revoke_purchase', 'p_class uuid, p_user uuid'),
  ('public', 'edu_class_state', 'p_class uuid'),
  ('public', 'edu_coppa_gate_for', 'p_user_id uuid'),
  ('public', 'edu_library_list_scoped', 'p_scope text, p_search text, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'edu_library_scope_rows', 'p_scope text'),
  ('public', 'education_league_rollover', 'p_week_start date'),
  ('public', 'education_streak_rollover', 'p_rollover_date date'),
  ('public', 'enforce_aga_rate_limit', ''),
  ('public', 'ensure_folder_chain', 'p_owner_id uuid, p_folder_path text'),
  ('public', 'fetch_all_fk_ifk', 'p_table_name text, p_primary_key_values jsonb'),
  ('public', 'fetch_all_fk_ifk_direct', 'p_table_name text, p_primary_key_values jsonb'),
  ('public', 'fn_cx_user_usage_summary_apply', ''),
  ('public', 'fn_kg_cost_unit_economics', 'p_days integer'),
  ('public', 'get_admin_status', ''),
  ('public', 'get_agent_work_queue', ''),
  ('public', 'get_conversation_for_display', 'p_conversation_id uuid'),
  ('public', 'get_conversation_messages_for_display', 'p_conversation_id uuid'),
  ('public', 'get_conversation_messages_for_model', 'p_conversation_id uuid'),
  ('public', 'get_entity_scopes', 'p_entity_type text, p_entity_id uuid'),
  ('public', 'get_feedback_by_status', 'p_status text'),
  ('public', 'get_feedback_summary', ''),
  ('public', 'get_note_version', 'p_id text'),
  ('public', 'get_note_versions', 'p_note_id uuid'),
  ('public', 'get_notes_shared_with_me', ''),
  ('public', 'get_org_module_settings', 'p_org_id uuid'),
  ('public', 'get_pending_feedback', ''),
  ('public', 'get_project_members_with_users', 'p_project_id uuid'),
  ('public', 'get_prompt_app_execution_payload', 'p_app_id uuid'),
  ('public', 'get_prompt_app_public_data', 'p_slug text, p_app_id uuid'),
  ('public', 'get_published_app_with_prompt', 'p_slug text, p_app_id uuid'),
  ('public', 'get_resource_access', 'p_resource_type text, p_resource_id uuid'),
  ('public', 'get_ssr_agent_shell_data', 'p_user_id uuid'),
  ('public', 'get_task_associations', 'p_task_id uuid'),
  ('public', 'get_tasks_for_entity', 'p_entity_type text, p_entity_id uuid'),
  ('public', 'get_triage_batch', 'p_batch_size integer'),
  ('public', 'get_untriaged_feedback', ''),
  ('public', 'get_user_email_preferences', 'p_user_id uuid'),
  ('public', 'get_user_file_tree', 'p_user_id uuid, p_limit integer, p_offset integer, p_include_folders boolean, p_include_deleted boolean, p_order_by text'),
  ('public', 'get_user_form_context', 'p_user_id uuid'),
  ('public', 'get_user_full_context', 'p_user_id uuid'),
  ('public', 'get_user_list_with_items', 'p_list_id uuid'),
  ('public', 'get_user_nav_tree', 'p_user_id uuid'),
  ('public', 'get_user_organizations', 'user_id uuid'),
  ('public', 'get_user_own_feedback', 'p_user_id uuid'),
  ('public', 'get_user_scopes', 'p_user_id uuid'),
  ('public', 'get_user_table_complete', 'p_table_id uuid, p_sort_field text, p_sort_direction text'),
  ('public', 'get_version_diff', 'p_entity_type text, p_entity_id uuid, p_version_a integer, p_version_b integer'),
  ('public', 'get_version_history', 'p_entity_type text, p_entity_id uuid, p_limit integer, p_offset integer'),
  ('public', 'get_version_snapshot', 'p_entity_type text, p_entity_id uuid, p_version integer'),
  ('public', 'guardian_assert_access', 'p_student_id uuid'),
  ('public', 'guardian_confirm_verification', 'p_link_id uuid, p_method text, p_ref text'),
  ('public', 'guardian_find_user_by_email', 'p_email text'),
  ('public', 'handle_new_dm_user', ''),
  ('public', 'has_permission', 'p_resource_type text, p_resource_id uuid, p_required_permission permission_level'),
  ('public', 'hr_corrective_action_issue', 'p_payload jsonb'),
  ('public', 'hr_corrective_action_outcome', 'p_id uuid, p_outcome text, p_payload jsonb'),
  ('public', 'hr_incident_create', 'p_payload jsonb'),
  ('public', 'hr_incident_status', 'p_incident_id uuid'),
  ('public', 'hr_leave_accrual_apply', 'p_employment_id uuid, p_leave_policy_id uuid, p_entry_kind text, p_hours_delta numeric, p_occurred_on date, p_period_key text, p_note text, p_engine_key text, p_engine_version text, p_rule_version_ids uuid[], p_calc jsonb, p_snapshot_inputs jsonb, p_clamps jsonb, p_source_workweek_id uuid, p_amount numeric, p_rate numeric, p_actor_type text, p_actor_employment_id uuid, p_actor_user_id uuid, p_prospective boolean, p_subject_id uuid, p_jurisdiction_key text, p_exception jsonb'),
  ('public', 'hr_leave_reinstate_on_rehire', 'p_new_employment_id uuid'),
  ('public', 'hr_relations_list', 'p_organization_id uuid, p_filter jsonb, p_limit integer'),
  ('public', 'industry_curator_list', 'p_industry uuid'),
  ('public', 'inherit_table_security_on_insert', ''),
  ('public', 'inv_for_me', ''),
  ('public', 'inv_get_by_token', 'p_token text'),
  ('public', 'is_admin', ''),
  ('public', 'is_dm_participant', 'p_conversation_id uuid, p_user_id uuid'),
  ('public', 'is_industry_curator', 'p_user uuid, p_industry uuid'),
  ('public', 'is_member_of_organization', 'p_org_id uuid'),
  ('public', 'is_org_admin', 'p_org_id uuid'),
  ('public', 'is_org_member', 'p_org_id uuid'),
  ('public', 'is_platform_admin', ''),
  ('public', 'is_resource_owner', 'p_resource_type text, p_resource_id uuid'),
  ('public', 'is_super_admin', ''),
  ('public', 'is_super_admin_for', 'p_user_id uuid'),
  ('public', 'is_super_admin_user', 'p_user uuid'),
  ('public', 'ivw_list_facets', 'p_scope text, p_org_id uuid, p_search text'),
  ('public', 'ivw_list_scope_counts', 'p_search text, p_filters jsonb'),
  ('public', 'ivw_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'kg_caller_can_target_scope', 'p_scope_id uuid'),
  ('public', 'library_catalog', 'p_organization_id uuid'),
  ('public', 'library_list_grants', 'p_entity_type text, p_entity_id uuid'),
  ('public', 'list_context_value_refs', 'p_ref_type text, p_ref_key text'),
  ('public', 'list_entities_by_scopes', 'p_scope_ids uuid[], p_entity_type text, p_match_all boolean'),
  ('public', 'list_share_links', 'p_resource_type text, p_resource_id uuid'),
  ('public', 'list_trash', 'p_user_id uuid, p_limit integer, p_offset integer'),
  ('public', 'mark_user_message_emailed', 'p_message_id uuid'),
  ('public', 'mkt_initiative_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_filters jsonb'),
  ('public', 'mkt_initiative_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb'),
  ('public', 'mkt_initiative_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'mnd_list_facets', 'p_search text'),
  ('public', 'mnd_list_scope_counts', 'p_search text'),
  ('public', 'mnd_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'my_industry_curatorships', ''),
  ('public', 'notify_aidream_on_sign_in', ''),
  ('public', 'orchestra_list', ''),
  ('public', 'org_null_ratchet_snapshot', ''),
  ('public', 'pdf_link_file_pages_for_new_page', ''),
  ('public', 'pdf_resolve_file_page_link', ''),
  ('public', 'pdf_set_canonical_bridge', ''),
  ('public', 'promote_version', 'p_entity_type text, p_entity_id uuid, p_version integer'),
  ('public', 'prune_high_volume_logs', ''),
  ('public', 'purge_old_versions', 'p_entity_type text, p_entity_id uuid, p_keep_count integer'),
  ('public', 'rag_user_can_see_note', 'p_note_id uuid'),
  ('public', 'readable_extraction_job_ids', ''),
  ('public', 'readable_processed_doc_for_file', 'p_file uuid'),
  ('public', 'readable_processed_document_ids', ''),
  ('public', 'reference_search_candidates', 'p_token text, p_search text, p_limit integer, p_ids uuid[]'),
  ('public', 'rename_storage_folder', 'bucket_name text, old_folder_path text, new_folder_path text, auth_user_id uuid'),
  ('public', 'research_youtube_quota_status', 'p_daily_cap integer'),
  ('public', 'resolve_feedback_item', 'p_id uuid, p_resolution_notes text, p_resolved_by uuid'),
  ('public', 'resolve_full_context', 'p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[]'),
  ('public', 'resolve_with_testing', 'p_id uuid, p_resolution_notes text, p_testing_instructions text, p_testing_url text'),
  ('public', 'restore_version', 'p_entity_type text, p_entity_id uuid, p_version integer'),
  ('public', 'seo_rank_target_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'set_admin_decision', 'p_id uuid, p_decision text, p_direction text, p_work_priority integer'),
  ('public', 'shape_doctor_gather', 'p_dataset text'),
  ('public', 'shx_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'snapshot_aga_version', ''),
  ('public', 'snapshot_aga_version_on_insert', ''),
  ('public', 'split_feedback_item', 'p_parent_id uuid, p_descriptions text[]'),
  ('public', 'studio_recording_segment_set_user_id', ''),
  ('public', 'thread_contents', 'thread_id uuid'),
  ('public', 'tool_resolve_for_request', 'p_user_id uuid, p_client_executor text, p_surface_name text, p_active_server_executors text[]'),
  ('public', 'transfer_guest_data_to_user', 'p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text'),
  ('public', 'trash_counts', ''),
  ('public', 'trash_list', 'p_kinds text[], p_limit integer, p_offset integer'),
  ('public', 'trg_agx_agent_create_v1_snapshot', ''),
  ('public', 'trg_agx_agent_snapshot_version', ''),
  ('public', 'trg_agx_stamp_contract', ''),
  ('public', 'trg_cx_conversation_resolve_agent_version', ''),
  ('public', 'trg_cx_user_request_resolve_agent_version', ''),
  ('public', 'trg_prompt_apps_insert_version', ''),
  ('public', 'trg_tool_def_create_v1', ''),
  ('public', 'trg_tool_def_snapshot_version', ''),
  ('public', 'trg_tool_ui_create_v1', ''),
  ('public', 'trg_tool_ui_snapshot_version', ''),
  ('public', 'triage_feedback_item', 'p_id uuid, p_ai_solution_proposal text, p_ai_suggested_priority text, p_ai_complexity text, p_ai_estimated_files text[], p_autonomy_score integer, p_ai_assessment text, p_category_id uuid'),
  ('public', 'trx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean'),
  ('public', 'trx_list_scope_counts', 'p_search text, p_deep boolean, p_filters jsonb'),
  ('public', 'trx_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('public', 'udt_log_row_version', ''),
  ('public', 'ues_get_bulk', 'p_entity_type text, p_entity_ids uuid[]'),
  ('public', 'ues_list', 'p_kind text'),
  ('public', 'user_can_read_via_library_grant', 'p_user uuid, p_type text, p_id uuid'),
  ('public', 'user_container_ids', 'p_container_type text, p_role_filter text[]'),
  ('public', 'user_owns_file', 'p_file_id uuid'),
  ('public', 'user_owns_folder', 'p_folder_id uuid'),
  ('public', 'war_room_recent_activity', 'p_war_room_id uuid, p_limit integer, p_since timestamp with time zone'),
  ('public', 'war_room_threads', 'room_id uuid'),
  ('public', 'wfx_list_facets', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_archived text'),
  ('public', 'wfx_list_scope_counts', 'p_search text, p_deep boolean, p_archived text, p_filters jsonb'),
  ('public', 'wfx_list_scoped', 'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_favorites_first boolean, p_archived text, p_filters jsonb, p_limit integer, p_offset integer'),
  ('rag', 'data_store_grants_del', ''),
  ('rag', 'data_store_grants_ins', ''),
  ('rag', 'data_store_grants_upd', ''),
  ('rag', 'fn_list_library_trash', ''),
  ('rag', 'kg_chunk_sources_cld_readable', ''),
  ('rag', 'kg_chunk_sources_library_granted', ''),
  ('rag', 'kg_chunk_sources_note_visible', ''),
  ('rag', 'soft_delete_members_on_file_delete', ''),
  ('rag', 'sync_data_store_member_association', ''),
  ('research', 'youtube_quota_spend', 'p_units integer, p_daily_cap integer'),
  ('scheduler', 'broadcast_run_change', ''),
  ('scheduler', 'broadcast_task_change', ''),
  ('scheduler', 'sch_tasks_enabled_by_id', 'p_task_ids jsonb'),
  ('scheduler', 'sch_tasks_enabled_by_id', 'p_task_ids uuid[]'),
  ('seo', '_pack_assert_author', 'p_pack_id uuid'),
  ('seo', '_pack_assert_creator', 'p_industry_id uuid'),
  ('seo', 'engine_schedules_claim', 'p_now timestamp with time zone'),
  ('seo', 'engine_schedules_due', 'p_now timestamp with time zone'),
  ('seo', 'fn_engine_schedule_target_guard', ''),
  ('seo', 'fn_reject_keyword_edge', 'p_edge_id uuid, p_reason text'),
  ('seo', 'geo_place_search', 'p_query text, p_kinds text[], p_limit integer'),
  ('seo', 'gsc_batch_question', 'p_site_id uuid, p_dimension text, p_size integer, p_exclude uuid[], p_days integer, p_word_overlap real'),
  ('seo', 'gsc_brand_identity', 'p_site_id uuid'),
  ('seo', 'gsc_breakdown_keyword_ids', 'p_site_id uuid, p_start date, p_end date, p_filters jsonb, p_search text, p_limit integer'),
  ('seo', 'gsc_dimension_coverage', 'p_site_id uuid, p_start date, p_end date'),
  ('seo', 'gsc_geo_area_preview', 'p_site_id uuid, p_start date, p_end date, p_tokens jsonb, p_geo_band text, p_area_id uuid, p_sample integer, p_place_ids uuid[]'),
  ('seo', 'gsc_human_rulings', 'p_site_id uuid, p_dimension_slug text, p_start date, p_end date, p_limit integer'),
  ('seo', 'gsc_ingestion_health', 'p_site_id uuid'),
  ('seo', 'gsc_keyword_class_review', 'p_site_id uuid, p_start date, p_end date, p_classes text[], p_sources text[], p_search text, p_sort text, p_sort_dir text, p_limit integer, p_offset integer, p_pattern text, p_match text, p_confirmed boolean, p_brand_alias text, p_filters jsonb, p_search_mode text'),
  ('seo', 'gsc_keyword_locations', 'p_site_id uuid, p_keyword_ids uuid[], p_include_unplaced boolean'),
  ('seo', 'gsc_keyword_topics_for', 'p_site_id uuid, p_keyword_ids uuid[]'),
  ('seo', 'gsc_keyword_value_for_multi', 'p_pairs jsonb'),
  ('seo', 'gsc_offering_stats', 'p_site_id uuid, p_start date, p_end date'),
  ('seo', 'gsc_perf_cannibalization', 'p_site_id uuid, p_start date, p_end date, p_min_impressions integer, p_min_share numeric, p_limit integer, p_offset integer'),
  ('seo', 'gsc_saved_views', 'p_site_id uuid, p_surface text'),
  ('seo', 'gsc_topic_placement_diff', 'p_site_id uuid, p_limit integer'),
  ('seo', 'gsc_value_combo_list', 'p_site_id uuid'),
  ('seo', 'gsc_value_combo_preview', 'p_site_id uuid, p_start date, p_end date, p_value_ids uuid[], p_effect text, p_amount numeric, p_combo_id uuid, p_sample integer'),
  ('seo', 'keyword_classification_status', 'p_site_id uuid, p_min_impressions integer'),
  ('seo', 'keyword_place_status', 'p_site_id uuid, p_min_impressions integer'),
  ('seo', 'keyword_placement_resolve', 'p_site_id uuid, p_keyword_ids uuid[]'),
  ('seo', 'starter_pack_site_adoptions', 'p_site_id uuid'),
  ('seo', 'starter_pack_site_status', 'p_site_id uuid, p_pack_id uuid'),
  ('seo', 'validate_site_offering_fact_scope', ''),
  ('tool', 'prevent_referenced_definition_removal', ''),
  ('users', '_guard_age_band_change', ''),
  ('users', '_stamp_secret_audit_org', ''),
  ('users', 'heal_user_preferences_drift', ''),
  ('users', 'user_preferences_drift_report', ''),
  ('vault', 'create_secret', 'new_secret text, new_name text, new_description text, new_key_id uuid'),
  ('vault', 'update_secret', 'secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid'),
  ('web', 'assert_crawl_artifact_file', 'p_file_id uuid, p_organization_id uuid, p_site_id uuid, p_session_id uuid, p_mime_prefix text'),
  ('web', 'enforce_live_site_parent', ''),
  ('web', 'enforce_site_component_organization', ''),
  ('web', 'offering_templates_for_site', 'p_site_id uuid, p_search text'),
  ('web', 'site_cascade_soft_delete_descendants', ''),
  ('web', 'site_offerings', 'p_site_id uuid'),
  ('web', 'validate_brand_offering_scope', ''),
  ('web', 'validate_cross_pointers', ''),
  ('web', 'validate_offering_template_scope', ''),
  ('web', 'validate_site_offering_scope', ''),
  ('workflow', '_cascade_definition_soft_delete', ''),
  ('workflow', 'emit_trigger_events', ''),
  ('workspace', '_sync_task_assignee_grant', '')
 );
-- ─── 7. Postcondition: this file proves its own claim before it commits ─────
do $$
declare v_anon int; v_doors int; v_closed int; v_dupe int; v_left int; v_open int; v_bad int;
begin
  -- (a) no STABLE anon-executable definer outside pgsodium is undeclared
  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
     and n.nspname not in ('pg_catalog','information_schema','pgsodium')
     and p.provolatile <> 'v'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  if v_anon <> 0 then
    raise exception 'dd169 batch 2: % reading definers are still anon-executable with no door row — the sweep did not land', v_anon;
  end if;

  -- (b) every decision this file claims to have written is actually there
  select count(*) into v_doors from platform.client_callable_door where declared_by = 'DD-169 / B-64';
  if v_doors <> 131 then
    raise exception 'dd169 batch 2: expected 131 new door rows (7 anonymous + 124 signed-in), found %', v_doors;
  end if;

  -- (c) the 36 closed readers answer no client role at all
  select count(*) into v_closed from (values
      ('billing.usage_admin_by_user(text,timestamp with time zone,timestamp with time zone,integer)'),
      ('billing.usage_my_summary(timestamp with time zone,timestamp with time zone)'),
      ('esign._certificate_payload(uuid)'),
      ('esign._may_manage(uuid,text)'),
      ('esign._may_manage_campaign(uuid,text)'),
      ('iam._container_authz(text,uuid,uuid)'),
      ('iam.access_request_recipients(text,uuid)'),
      ('iam.can_access_conversation(uuid)'),
      ('iam.can_access_run(uuid)'),
      ('iam.can_decide_access_request(uuid,text,uuid)'),
      ('platform._lifecycle_partition_guard(text)'),
      ('platform._outsider_parent_matches(text,uuid,uuid)'),
      ('platform.rulebook_library_catalog(uuid)'),
      ('_count_super_admins()'),
      ('_edu_can_read_via_assignment(text,uuid)'),
      ('_edu_can_read_via_assignment(uuid,text,uuid)'),
      ('_edu_class(uuid)'),
      ('_edu_is_owner(context.scopes)'),
      ('_edu_is_scope_member(uuid)'),
      ('can_read_extraction_job(uuid)'),
      ('can_read_processed_document_any(uuid,uuid)'),
      ('curatable_processed_document_ids()'),
      ('get_admin_status()'),
      ('get_project_members_with_users(uuid)'),
      ('get_prompt_app_execution_payload(uuid)'),
      ('get_prompt_app_public_data(text,uuid)'),
      ('get_user_scopes(uuid)'),
      ('kg_caller_can_target_scope(uuid)'),
      ('mnd_list_scope_counts(text)'),
      ('readable_processed_document_ids()'),
      ('user_container_ids(text,text[])'),
      ('user_owns_file(uuid)'),
      ('user_owns_folder(uuid)'),
      ('seo.gsc_offering_stats(uuid,date,date)'),
      ('web.offering_templates_for_site(uuid,text)'),
      ('web.site_offerings(uuid)')
    ) as c(sig)
   where has_function_privilege('authenticated', c.sig::regprocedure, 'EXECUTE')
      or has_function_privilege('anon', c.sig::regprocedure, 'EXECUTE');
  if v_closed <> 0 then raise exception 'dd169 batch 2: % closed readers still answer a client role', v_closed; end if;

  -- (d) the 7 anonymous doors are still reachable by anon — a "fix" that broke
  --     42 tables' anonymous reads would be a worse defect than the one closed
  select count(*) into v_open from (values
      ('iam.has_access(text,uuid,permission_level)'),
      ('iam.has_org_access(uuid)'),
      ('iam.my_orgs()'),
      ('has_permission(text,uuid,permission_level)'),
      ('is_admin()'),
      ('is_platform_admin()'),
      ('is_super_admin()')
    ) as c(sig)
   where not has_function_privilege('anon', c.sig::regprocedure, 'EXECUTE');
  if v_open <> 0 then raise exception 'dd169 batch 2: % declared anonymous doors lost anon EXECUTE', v_open; end if;

  -- (e) the D2 blind spot is empty: no grandfather row duplicates a declared door
  select count(*) into v_dupe from platform.definer_client_grant_grandfather g
   where exists (select 1 from platform.client_callable_door d
                  where d.schema_name = g.schema_name and d.function_name = g.function_name
                    and d.identity_args = g.identity_args);
  if v_dupe <> 0 then raise exception 'dd169 batch 2: % grandfather rows still duplicate a declared door', v_dupe; end if;

  -- (f) every surviving grandfather row is pgsodium or a signed-in-only definer
  select count(*) into v_bad from platform.definer_client_grant_grandfather g
   left join pg_namespace n on n.nspname = g.schema_name
   left join pg_proc p on p.pronamespace = n.oid and p.proname = g.function_name
                      and p.proargtypes::text = g.argtypes
   where g.schema_name <> 'pgsodium'
     and (p.oid is null
          or not p.prosecdef
          or p.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or not (has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  or has_function_privilege('public', p.oid, 'EXECUTE')));
  if v_bad <> 0 then
    raise exception 'dd169 batch 2: % surviving grandfather rows are neither pgsodium nor a signed-in-only SECURITY DEFINER — the delete missed a class', v_bad;
  end if;

  select count(*) into v_left from platform.definer_client_grant_grandfather;
  raise notice 'dd169 batch 2: 7 anonymous doors, 124 signed-in doors, 36 closed readers; grandfather table % rows (608 signed-in-only awaiting batch 3 + 25 pgsodium); 0 undeclared anon-executable reading definers outside pgsodium', v_left;
end $$;
