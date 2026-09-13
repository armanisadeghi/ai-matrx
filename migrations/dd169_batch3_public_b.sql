-- DD-169 batch 3 (dd169_batch3_public_b) — public 2/4
--
-- The 608 `authenticated`-executable SECURITY DEFINER functions B-64 left on
-- platform.definer_client_grant_grandfather run as the owner, so RLS does not apply
-- inside them and a grandfather row is the ABSENCE of a decision. This file decides
-- 104 of them: 64 DECLARED as doors (each one's body resolves the caller, and
-- gate_predicate records the literal D6 asserts is still present), and
-- 40 CLOSED (no client call site in any of the four repos, no RLS policy and no
-- security_invoker path that a client role evaluates — so the client EXECUTE grant is
-- removed outright). Every grandfather row named here is deleted; the matching entries
-- leave scripts/impl-doors/grandfather-allowlist.json in the same commit (D2c/D2d).

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, declared_by, gate_predicate)
values
 ('public','edu_guardian_set_age_band','p_student_user_id uuid, p_band text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_import_deck','p_deck jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_import_review_history','p_items jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_library_facets','p_scope text, p_search text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.edu_library_list_scoped` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.edu_library_list_scoped'),
 ('public','edu_library_scope_counts','p_search text, p_filters jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.edu_library_list_scoped` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.edu_library_list_scoped'),
 ('public','edu_log_data_export','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_my_classes','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_restore_study_data','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_set_age_band','p_band text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','edu_uncertify_content','p_resource_type text, p_resource_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','edu_verify_content','p_resource_type text, p_resource_id uuid, p_verified boolean, p_note text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','education_engagement_snapshot','p_session_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','ensure_personal_organization','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 22 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','entity_access_summary','p_type text, p_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','entity_titles','p_type text, p_ids uuid[]','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `iam.has_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','iam.has_access'),
 ('public','fn_kg_cost_batch_detail','p_batch_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','fn_kg_cost_list_orgs','p_limit integer, p_offset integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','fn_kg_cost_org_detail','p_org_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','fn_kg_cost_pending_batches','p_limit integer, p_offset integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','fn_kg_cost_summary','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('public','game_finalize_result','p_session_id uuid, p_display_name text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','game_record_answer','p_session_id uuid, p_item_id uuid, p_selected_answer text, p_expected_result text, p_difficulty numeric, p_stability numeric, p_due_at timestamp with time zone, p_retrievability numeric, p_lapses integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_dm_unread_count','p_conversation_id uuid, p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_dm_user_info','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 7 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_feedback_comments','p_feedback_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.role'),
 ('public','get_mcp_catalog_for_user','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_org_file_list','p_user_id uuid, p_org_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_organization_members_with_users','p_org_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.role'),
 ('public','get_scope_context','p_scope_id uuid, p_item_ids uuid[], p_include_empty boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 7 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `context._assert_scope_readable` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','context._assert_scope_readable'),
 ('public','get_scope_tree','p_org_id uuid, p_type_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 7 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.role'),
 ('public','get_ssr_shell_data','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_usage_status','p_user_id uuid, p_is_guest boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 8 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_user_emails_by_ids','user_ids uuid[]','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 9 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.role'),
 ('public','get_user_limits','p_user_id uuid, p_is_guest boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_user_lists_summary','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_user_messages','p_feedback_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_user_session_data','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','get_user_tables','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 10 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','guardian_can_view','p_student_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_has_active_link` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_has_active_link'),
 ('public','guardian_grant','p_guardian_email text, p_relationship text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','guardian_list_links','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','guardian_request_student','p_student_email text, p_relationship text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','guardian_respond','p_guardian_user_id uuid, p_approve boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','guardian_student_attempts','p_student_id uuid, p_since timestamp with time zone','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_student_card_topics','p_student_id uuid, p_card_ids uuid[]','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_student_gain','p_student_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_student_mastery','p_student_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_student_sessions','p_student_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_student_streak','p_student_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.guardian_assert_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.guardian_assert_access'),
 ('public','guardian_unlink','p_guardian_user_id uuid, p_student_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hard_delete_file','p_file_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 10 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_access_audit_query','p_from timestamp with time zone, p_to timestamp with time zone, p_target_token text, p_include_self boolean, p_limit integer, p_organization_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_access_explain','p_user uuid, p_token text, p_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_activate_employer','p_payload jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 7 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_activation_seed','p_organization_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr._l1_settings_gate` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr._l1_settings_gate'),
 ('public','hr_attendance_exception_list','p_filters jsonb, p_page jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr.attendance_exception_list` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr.attendance_exception_list'),
 ('public','hr_attendance_exception_resolve','p_exception_id uuid, p_resolution_state text, p_note text, p_premium_earning_code_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr.attendance_exception_resolve` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr.attendance_exception_resolve'),
 ('public','hr_authority_grant','p_holder_kind text, p_holder_id text, p_action_type text, p_scope_kind text, p_scope_id uuid, p_scope_employment_ids uuid[], p_limits jsonb, p_rank integer, p_effective_from date, p_effective_to date, p_reason text, p_organization_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_break_glass','p_token text, p_id uuid, p_purpose text, p_justification text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_clock_state','p_employment_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 12 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr.clock_state` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr.clock_state'),
 ('public','hr_compensation_upsert','p_payload jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('public','hr_confidential_get','p_token text, p_id uuid, p_purpose text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 17 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr._door_get` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr._door_get'),
 ('public','hr_confidential_list','p_token text, p_filter jsonb, p_limit integer, p_cursor text, p_purpose text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `hr._door_list` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','hr._door_list');

-- CLOSED: no client caller anywhere. The grant goes, not just the stand-down.
revoke execute on function public."esign_campaign_close"(p_campaign_id uuid, p_reason text) from public, anon, authenticated;
revoke execute on function public."esign_campaign_enroll"(p_campaign_id uuid, p_members jsonb) from public, anon, authenticated;
revoke execute on function public."esign_campaign_export"(p_campaign_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_campaign_generate"(p_campaign_id uuid, p_frozen jsonb, p_batch_size integer) from public, anon, authenticated;
revoke execute on function public."esign_campaign_progress"(p_campaign_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_certificate_public_keys"() from public, anon, authenticated;
revoke execute on function public."esign_create_campaign"(p_organization_id uuid, p_title text, p_consumer_key text, p_document_source jsonb, p_envelope_type text, p_sensitivity text, p_audience_kind text, p_audience_ref jsonb, p_message text, p_expires_in_days integer) from public, anon, authenticated;
revoke execute on function public."esign_create_envelope"(p_organization_id uuid, p_consumer_key text, p_title text, p_documents jsonb, p_signers jsonb, p_envelope_type text, p_sensitivity text, p_signing_order text, p_message text, p_source jsonb, p_expires_in_days integer, p_callback_key text) from public, anon, authenticated;
revoke execute on function public."esign_envelope_state"(p_envelope_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_expire_sweep"(p_limit integer) from public, anon, authenticated;
revoke execute on function public."esign_mint_signer_token"(p_signer_id uuid, p_email text) from public, anon, authenticated;
revoke execute on function public."esign_my_signer_row"(p_envelope_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_provider_dispatch"(p_envelope_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_provider_ingest"(p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text, p_provider_event_id text, p_payload jsonb, p_observed jsonb) from public, anon, authenticated;
revoke execute on function public."esign_remind"(p_envelope_id uuid) from public, anon, authenticated;
revoke execute on function public."esign_resend_signer"(p_signer_id uuid, p_email text) from public, anon, authenticated;
revoke execute on function public."esign_rotate_signing_key"(p_reason text) from public, anon, authenticated;
revoke execute on function public."esign_send_envelope"(p_envelope_id uuid, p_frozen jsonb) from public, anon, authenticated;
revoke execute on function public."esign_sign"(p_signer_id uuid, p_observed jsonb, p_action_id text, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_adopt_signature"(p_signer_id uuid, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_consent"(p_signer_id uuid, p_disclosure_id uuid, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_decline"(p_signer_id uuid, p_reason text, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_download"(p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_load"(p_envelope_id uuid, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_sign_preview_ack"(p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text) from public, anon, authenticated;
revoke execute on function public."esign_verify_envelope"(p_envelope_id uuid, p_observed jsonb) from public, anon, authenticated;
revoke execute on function public."esign_void_envelope"(p_envelope_id uuid, p_reason text) from public, anon, authenticated;
revoke execute on function public."feedback_get_admin_info"(p_user_id uuid) from public, anon, authenticated;
revoke execute on function public."get_conversations_for_user"(p_user_id uuid) from public, anon, authenticated;
revoke execute on function public."get_org_structure"(p_org_id uuid) from public, anon, authenticated;
revoke execute on function public."get_organization_members"(org_id uuid) from public, anon, authenticated;
revoke execute on function public."get_value_history"(p_scope_id uuid, p_context_item_id uuid, p_limit integer) from public, anon, authenticated;
revoke execute on function public."guardian_has_active_link"(p_student_id uuid) from public, anon, authenticated;
revoke execute on function public."has_permission_for"(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level) from public, anon, authenticated;
revoke execute on function public."hr_authority_delegate"(p_delegation_id uuid) from public, anon, authenticated;
revoke execute on function public."hr_authority_delegation_end"(p_delegation_id uuid, p_reason text) from public, anon, authenticated;
revoke execute on function public."hr_authority_delegation_request"(p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text) from public, anon, authenticated;
revoke execute on function public."hr_authority_revoke"(p_authority_id uuid, p_reason text) from public, anon, authenticated;
revoke execute on function public."hr_calendar_upsert"(p_payload jsonb) from public, anon, authenticated;
revoke execute on function public."hr_code_upsert"(p_kind text, p_payload jsonb) from public, anon, authenticated;

delete from platform.definer_client_grant_grandfather g
 where (g.schema_name, g.function_name, g.identity_args) in (
   ('public','edu_guardian_set_age_band','p_student_user_id uuid, p_band text'),
   ('public','edu_import_deck','p_deck jsonb'),
   ('public','edu_import_review_history','p_items jsonb'),
   ('public','edu_library_facets','p_scope text, p_search text'),
   ('public','edu_library_scope_counts','p_search text, p_filters jsonb'),
   ('public','edu_log_data_export',''),
   ('public','edu_my_classes',''),
   ('public','edu_restore_study_data',''),
   ('public','edu_set_age_band','p_band text'),
   ('public','edu_uncertify_content','p_resource_type text, p_resource_id uuid'),
   ('public','edu_verify_content','p_resource_type text, p_resource_id uuid, p_verified boolean, p_note text'),
   ('public','education_engagement_snapshot','p_session_id uuid'),
   ('public','ensure_personal_organization','p_user_id uuid'),
   ('public','entity_access_summary','p_type text, p_id uuid'),
   ('public','entity_titles','p_type text, p_ids uuid[]'),
   ('public','esign_campaign_close','p_campaign_id uuid, p_reason text'),
   ('public','esign_campaign_enroll','p_campaign_id uuid, p_members jsonb'),
   ('public','esign_campaign_export','p_campaign_id uuid'),
   ('public','esign_campaign_generate','p_campaign_id uuid, p_frozen jsonb, p_batch_size integer'),
   ('public','esign_campaign_progress','p_campaign_id uuid'),
   ('public','esign_certificate_public_keys',''),
   ('public','esign_create_campaign','p_organization_id uuid, p_title text, p_consumer_key text, p_document_source jsonb, p_envelope_type text, p_sensitivity text, p_audience_kind text, p_audience_ref jsonb, p_message text, p_expires_in_days integer'),
   ('public','esign_create_envelope','p_organization_id uuid, p_consumer_key text, p_title text, p_documents jsonb, p_signers jsonb, p_envelope_type text, p_sensitivity text, p_signing_order text, p_message text, p_source jsonb, p_expires_in_days integer, p_callback_key text'),
   ('public','esign_envelope_state','p_envelope_id uuid'),
   ('public','esign_expire_sweep','p_limit integer'),
   ('public','esign_mint_signer_token','p_signer_id uuid, p_email text'),
   ('public','esign_my_signer_row','p_envelope_id uuid'),
   ('public','esign_provider_dispatch','p_envelope_id uuid'),
   ('public','esign_provider_ingest','p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text, p_provider_event_id text, p_payload jsonb, p_observed jsonb'),
   ('public','esign_remind','p_envelope_id uuid'),
   ('public','esign_resend_signer','p_signer_id uuid, p_email text'),
   ('public','esign_rotate_signing_key','p_reason text'),
   ('public','esign_send_envelope','p_envelope_id uuid, p_frozen jsonb'),
   ('public','esign_sign','p_signer_id uuid, p_observed jsonb, p_action_id text, p_ip inet, p_ua text'),
   ('public','esign_sign_adopt_signature','p_signer_id uuid, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text'),
   ('public','esign_sign_consent','p_signer_id uuid, p_disclosure_id uuid, p_ip inet, p_ua text'),
   ('public','esign_sign_decline','p_signer_id uuid, p_reason text, p_ip inet, p_ua text'),
   ('public','esign_sign_download','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
   ('public','esign_sign_load','p_envelope_id uuid, p_ip inet, p_ua text'),
   ('public','esign_sign_preview_ack','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
   ('public','esign_verify_envelope','p_envelope_id uuid, p_observed jsonb'),
   ('public','esign_void_envelope','p_envelope_id uuid, p_reason text'),
   ('public','feedback_get_admin_info','p_user_id uuid'),
   ('public','fn_kg_cost_batch_detail','p_batch_id uuid'),
   ('public','fn_kg_cost_list_orgs','p_limit integer, p_offset integer'),
   ('public','fn_kg_cost_org_detail','p_org_id uuid'),
   ('public','fn_kg_cost_pending_batches','p_limit integer, p_offset integer'),
   ('public','fn_kg_cost_summary',''),
   ('public','game_finalize_result','p_session_id uuid, p_display_name text'),
   ('public','game_record_answer','p_session_id uuid, p_item_id uuid, p_selected_answer text, p_expected_result text, p_difficulty numeric, p_stability numeric, p_due_at timestamp with time zone, p_retrievability numeric, p_lapses integer'),
   ('public','get_conversations_for_user','p_user_id uuid'),
   ('public','get_dm_unread_count','p_conversation_id uuid, p_user_id uuid'),
   ('public','get_dm_user_info','p_user_id uuid'),
   ('public','get_feedback_comments','p_feedback_id uuid'),
   ('public','get_mcp_catalog_for_user',''),
   ('public','get_org_file_list','p_user_id uuid, p_org_id uuid'),
   ('public','get_org_structure','p_org_id uuid'),
   ('public','get_organization_members','org_id uuid'),
   ('public','get_organization_members_with_users','p_org_id uuid'),
   ('public','get_scope_context','p_scope_id uuid, p_item_ids uuid[], p_include_empty boolean'),
   ('public','get_scope_tree','p_org_id uuid, p_type_id uuid'),
   ('public','get_ssr_shell_data','p_user_id uuid'),
   ('public','get_usage_status','p_user_id uuid, p_is_guest boolean'),
   ('public','get_user_emails_by_ids','user_ids uuid[]'),
   ('public','get_user_limits','p_user_id uuid, p_is_guest boolean'),
   ('public','get_user_lists_summary','p_user_id uuid'),
   ('public','get_user_messages','p_feedback_id uuid'),
   ('public','get_user_session_data','p_user_id uuid'),
   ('public','get_user_tables',''),
   ('public','get_value_history','p_scope_id uuid, p_context_item_id uuid, p_limit integer'),
   ('public','guardian_can_view','p_student_id uuid'),
   ('public','guardian_grant','p_guardian_email text, p_relationship text'),
   ('public','guardian_has_active_link','p_student_id uuid'),
   ('public','guardian_list_links',''),
   ('public','guardian_request_student','p_student_email text, p_relationship text'),
   ('public','guardian_respond','p_guardian_user_id uuid, p_approve boolean'),
   ('public','guardian_student_attempts','p_student_id uuid, p_since timestamp with time zone'),
   ('public','guardian_student_card_topics','p_student_id uuid, p_card_ids uuid[]'),
   ('public','guardian_student_gain','p_student_id uuid'),
   ('public','guardian_student_mastery','p_student_id uuid'),
   ('public','guardian_student_sessions','p_student_id uuid'),
   ('public','guardian_student_streak','p_student_id uuid'),
   ('public','guardian_unlink','p_guardian_user_id uuid, p_student_user_id uuid'),
   ('public','hard_delete_file','p_file_id uuid'),
   ('public','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level'),
   ('public','has_permission_for','p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level'),
   ('public','hr_access_audit_query','p_from timestamp with time zone, p_to timestamp with time zone, p_target_token text, p_include_self boolean, p_limit integer, p_organization_id uuid'),
   ('public','hr_access_explain','p_user uuid, p_token text, p_id uuid'),
   ('public','hr_activate_employer','p_payload jsonb'),
   ('public','hr_activation_seed','p_organization_id uuid'),
   ('public','hr_attendance_exception_list','p_filters jsonb, p_page jsonb'),
   ('public','hr_attendance_exception_resolve','p_exception_id uuid, p_resolution_state text, p_note text, p_premium_earning_code_id uuid'),
   ('public','hr_authority_delegate','p_delegation_id uuid'),
   ('public','hr_authority_delegation_end','p_delegation_id uuid, p_reason text'),
   ('public','hr_authority_delegation_request','p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text'),
   ('public','hr_authority_grant','p_holder_kind text, p_holder_id text, p_action_type text, p_scope_kind text, p_scope_id uuid, p_scope_employment_ids uuid[], p_limits jsonb, p_rank integer, p_effective_from date, p_effective_to date, p_reason text, p_organization_id uuid'),
   ('public','hr_authority_revoke','p_authority_id uuid, p_reason text'),
   ('public','hr_break_glass','p_token text, p_id uuid, p_purpose text, p_justification text'),
   ('public','hr_calendar_upsert','p_payload jsonb'),
   ('public','hr_clock_state','p_employment_id uuid'),
   ('public','hr_code_upsert','p_kind text, p_payload jsonb'),
   ('public','hr_compensation_upsert','p_payload jsonb'),
   ('public','hr_confidential_get','p_token text, p_id uuid, p_purpose text'),
   ('public','hr_confidential_list','p_token text, p_filter jsonb, p_limit integer, p_cursor text, p_purpose text'));

do $$
declare n int; m int;
begin
  select count(*) into n from platform.definer_client_grant_grandfather
   where (schema_name, function_name, identity_args) in (

     ('public','edu_guardian_set_age_band','p_student_user_id uuid, p_band text'),
     ('public','edu_import_deck','p_deck jsonb'),
     ('public','edu_import_review_history','p_items jsonb'),
     ('public','edu_library_facets','p_scope text, p_search text'),
     ('public','edu_library_scope_counts','p_search text, p_filters jsonb'),
     ('public','edu_log_data_export',''),
     ('public','edu_my_classes',''),
     ('public','edu_restore_study_data',''),
     ('public','edu_set_age_band','p_band text'),
     ('public','edu_uncertify_content','p_resource_type text, p_resource_id uuid'),
     ('public','edu_verify_content','p_resource_type text, p_resource_id uuid, p_verified boolean, p_note text'),
     ('public','education_engagement_snapshot','p_session_id uuid'),
     ('public','ensure_personal_organization','p_user_id uuid'),
     ('public','entity_access_summary','p_type text, p_id uuid'),
     ('public','entity_titles','p_type text, p_ids uuid[]'),
     ('public','esign_campaign_close','p_campaign_id uuid, p_reason text'),
     ('public','esign_campaign_enroll','p_campaign_id uuid, p_members jsonb'),
     ('public','esign_campaign_export','p_campaign_id uuid'),
     ('public','esign_campaign_generate','p_campaign_id uuid, p_frozen jsonb, p_batch_size integer'),
     ('public','esign_campaign_progress','p_campaign_id uuid'),
     ('public','esign_certificate_public_keys',''),
     ('public','esign_create_campaign','p_organization_id uuid, p_title text, p_consumer_key text, p_document_source jsonb, p_envelope_type text, p_sensitivity text, p_audience_kind text, p_audience_ref jsonb, p_message text, p_expires_in_days integer'),
     ('public','esign_create_envelope','p_organization_id uuid, p_consumer_key text, p_title text, p_documents jsonb, p_signers jsonb, p_envelope_type text, p_sensitivity text, p_signing_order text, p_message text, p_source jsonb, p_expires_in_days integer, p_callback_key text'),
     ('public','esign_envelope_state','p_envelope_id uuid'),
     ('public','esign_expire_sweep','p_limit integer'),
     ('public','esign_mint_signer_token','p_signer_id uuid, p_email text'),
     ('public','esign_my_signer_row','p_envelope_id uuid'),
     ('public','esign_provider_dispatch','p_envelope_id uuid'),
     ('public','esign_provider_ingest','p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text, p_provider_event_id text, p_payload jsonb, p_observed jsonb'),
     ('public','esign_remind','p_envelope_id uuid'),
     ('public','esign_resend_signer','p_signer_id uuid, p_email text'),
     ('public','esign_rotate_signing_key','p_reason text'),
     ('public','esign_send_envelope','p_envelope_id uuid, p_frozen jsonb'),
     ('public','esign_sign','p_signer_id uuid, p_observed jsonb, p_action_id text, p_ip inet, p_ua text'),
     ('public','esign_sign_adopt_signature','p_signer_id uuid, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text'),
     ('public','esign_sign_consent','p_signer_id uuid, p_disclosure_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_decline','p_signer_id uuid, p_reason text, p_ip inet, p_ua text'),
     ('public','esign_sign_download','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_load','p_envelope_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_preview_ack','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_verify_envelope','p_envelope_id uuid, p_observed jsonb'),
     ('public','esign_void_envelope','p_envelope_id uuid, p_reason text'),
     ('public','feedback_get_admin_info','p_user_id uuid'),
     ('public','fn_kg_cost_batch_detail','p_batch_id uuid'),
     ('public','fn_kg_cost_list_orgs','p_limit integer, p_offset integer'),
     ('public','fn_kg_cost_org_detail','p_org_id uuid'),
     ('public','fn_kg_cost_pending_batches','p_limit integer, p_offset integer'),
     ('public','fn_kg_cost_summary',''),
     ('public','game_finalize_result','p_session_id uuid, p_display_name text'),
     ('public','game_record_answer','p_session_id uuid, p_item_id uuid, p_selected_answer text, p_expected_result text, p_difficulty numeric, p_stability numeric, p_due_at timestamp with time zone, p_retrievability numeric, p_lapses integer'),
     ('public','get_conversations_for_user','p_user_id uuid'),
     ('public','get_dm_unread_count','p_conversation_id uuid, p_user_id uuid'),
     ('public','get_dm_user_info','p_user_id uuid'),
     ('public','get_feedback_comments','p_feedback_id uuid'),
     ('public','get_mcp_catalog_for_user',''),
     ('public','get_org_file_list','p_user_id uuid, p_org_id uuid'),
     ('public','get_org_structure','p_org_id uuid'),
     ('public','get_organization_members','org_id uuid'),
     ('public','get_organization_members_with_users','p_org_id uuid'),
     ('public','get_scope_context','p_scope_id uuid, p_item_ids uuid[], p_include_empty boolean'),
     ('public','get_scope_tree','p_org_id uuid, p_type_id uuid'),
     ('public','get_ssr_shell_data','p_user_id uuid'),
     ('public','get_usage_status','p_user_id uuid, p_is_guest boolean'),
     ('public','get_user_emails_by_ids','user_ids uuid[]'),
     ('public','get_user_limits','p_user_id uuid, p_is_guest boolean'),
     ('public','get_user_lists_summary','p_user_id uuid'),
     ('public','get_user_messages','p_feedback_id uuid'),
     ('public','get_user_session_data','p_user_id uuid'),
     ('public','get_user_tables',''),
     ('public','get_value_history','p_scope_id uuid, p_context_item_id uuid, p_limit integer'),
     ('public','guardian_can_view','p_student_id uuid'),
     ('public','guardian_grant','p_guardian_email text, p_relationship text'),
     ('public','guardian_has_active_link','p_student_id uuid'),
     ('public','guardian_list_links',''),
     ('public','guardian_request_student','p_student_email text, p_relationship text'),
     ('public','guardian_respond','p_guardian_user_id uuid, p_approve boolean'),
     ('public','guardian_student_attempts','p_student_id uuid, p_since timestamp with time zone'),
     ('public','guardian_student_card_topics','p_student_id uuid, p_card_ids uuid[]'),
     ('public','guardian_student_gain','p_student_id uuid'),
     ('public','guardian_student_mastery','p_student_id uuid'),
     ('public','guardian_student_sessions','p_student_id uuid'),
     ('public','guardian_student_streak','p_student_id uuid'),
     ('public','guardian_unlink','p_guardian_user_id uuid, p_student_user_id uuid'),
     ('public','hard_delete_file','p_file_id uuid'),
     ('public','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level'),
     ('public','has_permission_for','p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level'),
     ('public','hr_access_audit_query','p_from timestamp with time zone, p_to timestamp with time zone, p_target_token text, p_include_self boolean, p_limit integer, p_organization_id uuid'),
     ('public','hr_access_explain','p_user uuid, p_token text, p_id uuid'),
     ('public','hr_activate_employer','p_payload jsonb'),
     ('public','hr_activation_seed','p_organization_id uuid'),
     ('public','hr_attendance_exception_list','p_filters jsonb, p_page jsonb'),
     ('public','hr_attendance_exception_resolve','p_exception_id uuid, p_resolution_state text, p_note text, p_premium_earning_code_id uuid'),
     ('public','hr_authority_delegate','p_delegation_id uuid'),
     ('public','hr_authority_delegation_end','p_delegation_id uuid, p_reason text'),
     ('public','hr_authority_delegation_request','p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text'),
     ('public','hr_authority_grant','p_holder_kind text, p_holder_id text, p_action_type text, p_scope_kind text, p_scope_id uuid, p_scope_employment_ids uuid[], p_limits jsonb, p_rank integer, p_effective_from date, p_effective_to date, p_reason text, p_organization_id uuid'),
     ('public','hr_authority_revoke','p_authority_id uuid, p_reason text'),
     ('public','hr_break_glass','p_token text, p_id uuid, p_purpose text, p_justification text'),
     ('public','hr_calendar_upsert','p_payload jsonb'),
     ('public','hr_clock_state','p_employment_id uuid'),
     ('public','hr_code_upsert','p_kind text, p_payload jsonb'),
     ('public','hr_compensation_upsert','p_payload jsonb'),
     ('public','hr_confidential_get','p_token text, p_id uuid, p_purpose text'),
     ('public','hr_confidential_list','p_token text, p_filter jsonb, p_limit integer, p_cursor text, p_purpose text'));
  if n <> 0 then raise exception 'DD-169 batch 3 (dd169_batch3_public_b): % grandfather row(s) named here survived', n; end if;
  select count(*) into m from platform.client_callable_door
   where declared_by = 'DD-169 batch 3 / B-75';
  if m < 64 then raise exception 'DD-169 batch 3 (dd169_batch3_public_b): expected at least 64 new door rows, found %', m; end if;
  -- every CLOSED function really lost every client grant
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where (ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) in (

     ('public','esign_campaign_close','p_campaign_id uuid, p_reason text'),
     ('public','esign_campaign_enroll','p_campaign_id uuid, p_members jsonb'),
     ('public','esign_campaign_export','p_campaign_id uuid'),
     ('public','esign_campaign_generate','p_campaign_id uuid, p_frozen jsonb, p_batch_size integer'),
     ('public','esign_campaign_progress','p_campaign_id uuid'),
     ('public','esign_certificate_public_keys',''),
     ('public','esign_create_campaign','p_organization_id uuid, p_title text, p_consumer_key text, p_document_source jsonb, p_envelope_type text, p_sensitivity text, p_audience_kind text, p_audience_ref jsonb, p_message text, p_expires_in_days integer'),
     ('public','esign_create_envelope','p_organization_id uuid, p_consumer_key text, p_title text, p_documents jsonb, p_signers jsonb, p_envelope_type text, p_sensitivity text, p_signing_order text, p_message text, p_source jsonb, p_expires_in_days integer, p_callback_key text'),
     ('public','esign_envelope_state','p_envelope_id uuid'),
     ('public','esign_expire_sweep','p_limit integer'),
     ('public','esign_mint_signer_token','p_signer_id uuid, p_email text'),
     ('public','esign_my_signer_row','p_envelope_id uuid'),
     ('public','esign_provider_dispatch','p_envelope_id uuid'),
     ('public','esign_provider_ingest','p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text, p_provider_event_id text, p_payload jsonb, p_observed jsonb'),
     ('public','esign_remind','p_envelope_id uuid'),
     ('public','esign_resend_signer','p_signer_id uuid, p_email text'),
     ('public','esign_rotate_signing_key','p_reason text'),
     ('public','esign_send_envelope','p_envelope_id uuid, p_frozen jsonb'),
     ('public','esign_sign','p_signer_id uuid, p_observed jsonb, p_action_id text, p_ip inet, p_ua text'),
     ('public','esign_sign_adopt_signature','p_signer_id uuid, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text'),
     ('public','esign_sign_consent','p_signer_id uuid, p_disclosure_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_decline','p_signer_id uuid, p_reason text, p_ip inet, p_ua text'),
     ('public','esign_sign_download','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_load','p_envelope_id uuid, p_ip inet, p_ua text'),
     ('public','esign_sign_preview_ack','p_signer_id uuid, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_verify_envelope','p_envelope_id uuid, p_observed jsonb'),
     ('public','esign_void_envelope','p_envelope_id uuid, p_reason text'),
     ('public','feedback_get_admin_info','p_user_id uuid'),
     ('public','get_conversations_for_user','p_user_id uuid'),
     ('public','get_org_structure','p_org_id uuid'),
     ('public','get_organization_members','org_id uuid'),
     ('public','get_value_history','p_scope_id uuid, p_context_item_id uuid, p_limit integer'),
     ('public','guardian_has_active_link','p_student_id uuid'),
     ('public','has_permission_for','p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level'),
     ('public','hr_authority_delegate','p_delegation_id uuid'),
     ('public','hr_authority_delegation_end','p_delegation_id uuid, p_reason text'),
     ('public','hr_authority_delegation_request','p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text'),
     ('public','hr_authority_revoke','p_authority_id uuid, p_reason text'),
     ('public','hr_calendar_upsert','p_payload jsonb'),
     ('public','hr_code_upsert','p_kind text, p_payload jsonb'))
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('public', p.oid, 'EXECUTE'));
  if n <> 0 then raise exception 'DD-169 batch 3 (dd169_batch3_public_b): % closed function(s) still hold a client EXECUTE grant', n; end if;
end $$;
