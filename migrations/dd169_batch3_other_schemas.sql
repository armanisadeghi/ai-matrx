-- DD-169 batch 3 (dd169_batch3_other_schemas) — the remaining schemas
--
-- The 608 `authenticated`-executable SECURITY DEFINER functions B-64 left on
-- platform.definer_client_grant_grandfather run as the owner, so RLS does not apply
-- inside them and a grandfather row is the ABSENCE of a decision. This file decides
-- 72 of them: 41 DECLARED as doors (each one's body resolves the caller, and
-- gate_predicate records the literal D6 asserts is still present), and
-- 31 CLOSED (no client call site in any of the four repos, no RLS policy and no
-- security_invoker path that a client role evaluates — so the client EXECUTE grant is
-- removed outright). Every grandfather row named here is deleted; the matching entries
-- leave scripts/impl-doors/grandfather-allowlist.json in the same commit (D2c/D2d).

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, declared_by, gate_predicate)
values
 ('communication','configure_my_sms_task_notifications','p_enabled boolean, p_program_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','enqueue_my_sms_assistant_test','p_program_key text, p_body text, p_idempotency_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','enqueue_my_task_sms_reminder','p_task_id uuid, p_program_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','get_my_sms_assistant_program','p_program_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','get_my_sms_task_notification_preference','p_program_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','mark_notification_read','p_notification_id uuid, p_channel text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('communication','set_my_sms_assistant_enabled','p_program_key text, p_enabled boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('content_ir','set_kind_activation','p_kind_definition_id uuid, p_active boolean, p_note text, p_actor uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 19 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('files','has_access_for','p_user_id uuid, p_file_id uuid, p_required permission_level','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 47 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('files','webhook_redeliver','p_delivery_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('hr','reveal_ssn','p_employee_id uuid, p_purpose text, p_justification text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('iam','fn_grant_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text, p_level text, p_expires_at timestamp with time zone','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('iam','fn_list_resource_permissions','p_resource_type text, p_resource_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `iam.has_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','iam.has_access'),
 ('iam','fn_revoke_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `iam.has_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','iam.has_access'),
 ('iam','is_discoverable','p_user_id uuid, p_type text, p_id uuid, p_required permission_level','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('iam','personal_org_id','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('platform','admin_relation_catalog','','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_platform_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_platform_admin'),
 ('platform','admin_relation_columns','p_schema text, p_table text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_platform_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_platform_admin'),
 ('platform','feature_knob_set','p_feature text, p_key text, p_value jsonb','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('platform','lifecycle_user_keep','p_entity_token text, p_ids uuid[]','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('platform','lifecycle_user_notice','p_user_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('platform','list_my_presentable_assists','p_limit integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('platform','my_assist_admission_decision','p_source_key text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('private','get_file_resource_family_for_user','p_user_id uuid, p_file_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; reached through other database objects only. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_bulk_delete_library_documents','p_ids uuid[], p_status text','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_data_store_members_rich','p_store_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_delete_library_document','p_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_delete_library_document_and_source','p_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_get_user_data_store','p_store_id uuid, p_member_limit integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_kg_inspector_entities','p_organization_id uuid, p_kind text, p_q text, p_limit integer, p_offset integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('rag','fn_kg_inspector_entity_mentions','p_entity_id uuid, p_limit integer, p_offset integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('rag','fn_kg_inspector_top_edges','p_organization_id uuid, p_kind text, p_limit integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('rag','fn_list_library_catalog','p_organization_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','fn_list_user_data_stores','p_include_inactive boolean','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()'),
 ('rag','library_grant_publish','p_store_id uuid, p_audience text, p_industry_id uuid, p_organization_id uuid, p_actor uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.library_publish` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.library_publish'),
 ('rag','library_grant_revoke','p_grant_id uuid, p_actor uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.library_revoke` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.library_revoke'),
 ('rag','library_subscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 9 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.library_subscribe` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.library_subscribe'),
 ('rag','library_unsubscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.library_unsubscribe` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.library_unsubscribe'),
 ('scheduler','system_schedule_alarms','p_overdue_grace_minutes integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `public.is_super_admin` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','public.is_super_admin'),
 ('web','count_link_edges','p_site_id uuid, p_session_id uuid, p_search text, p_target_url text, p_anchor_text text, p_rel text, p_is_internal boolean, p_http_status_min integer, p_http_status_max integer, p_position_min integer, p_position_max integer','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; reads; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `iam.has_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','iam.has_access'),
 ('web','create_site','p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb, p_integrations jsonb, p_visibility platform.visibility, p_brand_id uuid','Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.','DD-169 batch 3 / B-75','auth.uid()');

-- CLOSED: no client caller anywhere. The grant goes, not just the stand-down.
revoke execute on function communication."record_notification_outcome"(p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone) from public, anon, authenticated;
revoke execute on function crm."check_send_eligibility"(p_medium_id uuid, p_list_id uuid, p_identity_id uuid) from public, anon, authenticated;
revoke execute on function files."is_discoverable_for"(p_user_id uuid, p_file_id uuid, p_required permission_level) from public, anon, authenticated;
revoke execute on function hr."capability"(p_user uuid, p_capability text, p_subject_employment uuid, p_at date, p_organization_id uuid) from public, anon, authenticated;
revoke execute on function hr."jurisdiction_evaluate"(p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb, p_organization_id uuid, p_subject_type text, p_subject_id uuid) from public, anon, authenticated;
revoke execute on function hr."write_calculation_snapshot"(p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text, p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text, p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb, p_actor_type text, p_actor_id uuid, p_employment_id uuid, p_clamps jsonb, p_prospective boolean, p_supersedes_id uuid, p_recalculation_batch_id uuid) from public, anon, authenticated;
revoke execute on function iam."discoverable_ids"(p_user_id uuid, p_type text, p_required permission_level, p_depth integer) from public, anon, authenticated;
revoke execute on function iam."discoverable_ids"(p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean) from public, anon, authenticated;
revoke execute on function iam."has_access_as"(p_user uuid, p_type text, p_id uuid, p_required permission_level) from public, anon, authenticated;
revoke execute on function iam."has_access_for"(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) from public, anon, authenticated;
revoke execute on function iam."has_access_for_base"(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) from public, anon, authenticated;
revoke execute on function iam."has_access_for_base"(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean) from public, anon, authenticated;
revoke execute on function iam."has_org_access_for"(p_user_id uuid, p_org uuid) from public, anon, authenticated;
revoke execute on function iam."is_discoverable_base"(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) from public, anon, authenticated;
revoke execute on function iam."is_discoverable_base"(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean) from public, anon, authenticated;
revoke execute on function iam."is_org_member"(p_user uuid, p_org uuid) from public, anon, authenticated;
revoke execute on function iam."membership_row_visible"(p_membership_id uuid) from public, anon, authenticated;
revoke execute on function platform."admin_access_contract_violations"() from public, anon, authenticated;
revoke execute on function platform."assert_admin_access_contract"() from public, anon, authenticated;
revoke execute on function platform."assert_outsider_scope"(p_session text, p_resource text, p_id uuid, p_action text, p_ip inet) from public, anon, authenticated;
revoke execute on function platform."assist_production_allowed"(p_source_key text) from public, anon, authenticated;
revoke execute on function platform."entity_row_access_attrs"(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean) from public, anon, authenticated;
revoke execute on function platform."lifecycle_hot_reference_scan"() from public, anon, authenticated;
revoke execute on function platform."resolve_assist_producer_policy"(p_source_key text) from public, anon, authenticated;
revoke execute on function platform."retention_settling_interval"() from public, anon, authenticated;
revoke execute on function rag."fn_list_data_store_grants"(p_store_id uuid) from public, anon, authenticated;
revoke execute on function runtime."agent_usage_totals"(p_request_ids uuid[]) from public, anon, authenticated;
revoke execute on function runtime."spine_soft_delete_conversation_requests"(p_conversation_id uuid) from public, anon, authenticated;
revoke execute on function web."move_site_offering"(p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid, p_sibling_order uuid[]) from public, anon, authenticated;
revoke execute on function web."remove_site_offering"(p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_replacement_offering_id uuid) from public, anon, authenticated;
revoke execute on function web."site_offering_delete_impact"(p_site_id uuid, p_offering_id uuid) from public, anon, authenticated;

delete from platform.definer_client_grant_grandfather g
 where (g.schema_name, g.function_name, g.identity_args) in (
   ('communication','configure_my_sms_task_notifications','p_enabled boolean, p_program_key text'),
   ('communication','enqueue_my_sms_assistant_test','p_program_key text, p_body text, p_idempotency_key text'),
   ('communication','enqueue_my_task_sms_reminder','p_task_id uuid, p_program_key text'),
   ('communication','get_my_sms_assistant_program','p_program_key text'),
   ('communication','get_my_sms_task_notification_preference','p_program_key text'),
   ('communication','mark_notification_read','p_notification_id uuid, p_channel text'),
   ('communication','record_notification_outcome','p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone'),
   ('communication','set_my_sms_assistant_enabled','p_program_key text, p_enabled boolean'),
   ('content_ir','set_kind_activation','p_kind_definition_id uuid, p_active boolean, p_note text, p_actor uuid'),
   ('crm','check_send_eligibility','p_medium_id uuid, p_list_id uuid, p_identity_id uuid'),
   ('files','has_access_for','p_user_id uuid, p_file_id uuid, p_required permission_level'),
   ('files','is_discoverable_for','p_user_id uuid, p_file_id uuid, p_required permission_level'),
   ('files','webhook_redeliver','p_delivery_id uuid'),
   ('hr','capability','p_user uuid, p_capability text, p_subject_employment uuid, p_at date, p_organization_id uuid'),
   ('hr','jurisdiction_evaluate','p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb, p_organization_id uuid, p_subject_type text, p_subject_id uuid'),
   ('hr','reveal_ssn','p_employee_id uuid, p_purpose text, p_justification text'),
   ('hr','write_calculation_snapshot','p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text, p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text, p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb, p_actor_type text, p_actor_id uuid, p_employment_id uuid, p_clamps jsonb, p_prospective boolean, p_supersedes_id uuid, p_recalculation_batch_id uuid'),
   ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer'),
   ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean'),
   ('iam','fn_grant_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text, p_level text, p_expires_at timestamp with time zone'),
   ('iam','fn_list_resource_permissions','p_resource_type text, p_resource_id uuid'),
   ('iam','fn_revoke_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text'),
   ('iam','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level'),
   ('iam','has_access_for','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
   ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
   ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
   ('iam','has_org_access_for','p_user_id uuid, p_org uuid'),
   ('iam','is_discoverable','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
   ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
   ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
   ('iam','is_org_member','p_user uuid, p_org uuid'),
   ('iam','membership_row_visible','p_membership_id uuid'),
   ('iam','personal_org_id','p_user_id uuid'),
   ('platform','admin_access_contract_violations',''),
   ('platform','admin_relation_catalog',''),
   ('platform','admin_relation_columns','p_schema text, p_table text'),
   ('platform','assert_admin_access_contract',''),
   ('platform','assert_outsider_scope','p_session text, p_resource text, p_id uuid, p_action text, p_ip inet'),
   ('platform','assist_production_allowed','p_source_key text'),
   ('platform','entity_row_access_attrs','p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean'),
   ('platform','feature_knob_set','p_feature text, p_key text, p_value jsonb'),
   ('platform','lifecycle_hot_reference_scan',''),
   ('platform','lifecycle_user_keep','p_entity_token text, p_ids uuid[]'),
   ('platform','lifecycle_user_notice','p_user_id uuid'),
   ('platform','list_my_presentable_assists','p_limit integer'),
   ('platform','my_assist_admission_decision','p_source_key text'),
   ('platform','resolve_assist_producer_policy','p_source_key text'),
   ('platform','retention_settling_interval',''),
   ('private','get_file_resource_family_for_user','p_user_id uuid, p_file_id uuid'),
   ('rag','fn_bulk_delete_library_documents','p_ids uuid[], p_status text'),
   ('rag','fn_data_store_members_rich','p_store_id uuid'),
   ('rag','fn_delete_library_document','p_id uuid'),
   ('rag','fn_delete_library_document_and_source','p_id uuid'),
   ('rag','fn_get_user_data_store','p_store_id uuid, p_member_limit integer'),
   ('rag','fn_kg_inspector_entities','p_organization_id uuid, p_kind text, p_q text, p_limit integer, p_offset integer'),
   ('rag','fn_kg_inspector_entity_mentions','p_entity_id uuid, p_limit integer, p_offset integer'),
   ('rag','fn_kg_inspector_top_edges','p_organization_id uuid, p_kind text, p_limit integer'),
   ('rag','fn_list_data_store_grants','p_store_id uuid'),
   ('rag','fn_list_library_catalog','p_organization_id uuid'),
   ('rag','fn_list_user_data_stores','p_include_inactive boolean'),
   ('rag','library_grant_publish','p_store_id uuid, p_audience text, p_industry_id uuid, p_organization_id uuid, p_actor uuid'),
   ('rag','library_grant_revoke','p_grant_id uuid, p_actor uuid'),
   ('rag','library_subscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid'),
   ('rag','library_unsubscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid'),
   ('runtime','agent_usage_totals','p_request_ids uuid[]'),
   ('runtime','spine_soft_delete_conversation_requests','p_conversation_id uuid'),
   ('scheduler','system_schedule_alarms','p_overdue_grace_minutes integer'),
   ('web','count_link_edges','p_site_id uuid, p_session_id uuid, p_search text, p_target_url text, p_anchor_text text, p_rel text, p_is_internal boolean, p_http_status_min integer, p_http_status_max integer, p_position_min integer, p_position_max integer'),
   ('web','create_site','p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb, p_integrations jsonb, p_visibility platform.visibility, p_brand_id uuid'),
   ('web','move_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid, p_sibling_order uuid[]'),
   ('web','remove_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_replacement_offering_id uuid'),
   ('web','site_offering_delete_impact','p_site_id uuid, p_offering_id uuid'));

do $$
declare n int; m int;
begin
  select count(*) into n from platform.definer_client_grant_grandfather
   where (schema_name, function_name, identity_args) in (

     ('communication','configure_my_sms_task_notifications','p_enabled boolean, p_program_key text'),
     ('communication','enqueue_my_sms_assistant_test','p_program_key text, p_body text, p_idempotency_key text'),
     ('communication','enqueue_my_task_sms_reminder','p_task_id uuid, p_program_key text'),
     ('communication','get_my_sms_assistant_program','p_program_key text'),
     ('communication','get_my_sms_task_notification_preference','p_program_key text'),
     ('communication','mark_notification_read','p_notification_id uuid, p_channel text'),
     ('communication','record_notification_outcome','p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone'),
     ('communication','set_my_sms_assistant_enabled','p_program_key text, p_enabled boolean'),
     ('content_ir','set_kind_activation','p_kind_definition_id uuid, p_active boolean, p_note text, p_actor uuid'),
     ('crm','check_send_eligibility','p_medium_id uuid, p_list_id uuid, p_identity_id uuid'),
     ('files','has_access_for','p_user_id uuid, p_file_id uuid, p_required permission_level'),
     ('files','is_discoverable_for','p_user_id uuid, p_file_id uuid, p_required permission_level'),
     ('files','webhook_redeliver','p_delivery_id uuid'),
     ('hr','capability','p_user uuid, p_capability text, p_subject_employment uuid, p_at date, p_organization_id uuid'),
     ('hr','jurisdiction_evaluate','p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb, p_organization_id uuid, p_subject_type text, p_subject_id uuid'),
     ('hr','reveal_ssn','p_employee_id uuid, p_purpose text, p_justification text'),
     ('hr','write_calculation_snapshot','p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text, p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text, p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb, p_actor_type text, p_actor_id uuid, p_employment_id uuid, p_clamps jsonb, p_prospective boolean, p_supersedes_id uuid, p_recalculation_batch_id uuid'),
     ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer'),
     ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean'),
     ('iam','fn_grant_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text, p_level text, p_expires_at timestamp with time zone'),
     ('iam','fn_list_resource_permissions','p_resource_type text, p_resource_id uuid'),
     ('iam','fn_revoke_resource_permission','p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text'),
     ('iam','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
     ('iam','has_org_access_for','p_user_id uuid, p_org uuid'),
     ('iam','is_discoverable','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
     ('iam','is_org_member','p_user uuid, p_org uuid'),
     ('iam','membership_row_visible','p_membership_id uuid'),
     ('iam','personal_org_id','p_user_id uuid'),
     ('platform','admin_access_contract_violations',''),
     ('platform','admin_relation_catalog',''),
     ('platform','admin_relation_columns','p_schema text, p_table text'),
     ('platform','assert_admin_access_contract',''),
     ('platform','assert_outsider_scope','p_session text, p_resource text, p_id uuid, p_action text, p_ip inet'),
     ('platform','assist_production_allowed','p_source_key text'),
     ('platform','entity_row_access_attrs','p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean'),
     ('platform','feature_knob_set','p_feature text, p_key text, p_value jsonb'),
     ('platform','lifecycle_hot_reference_scan',''),
     ('platform','lifecycle_user_keep','p_entity_token text, p_ids uuid[]'),
     ('platform','lifecycle_user_notice','p_user_id uuid'),
     ('platform','list_my_presentable_assists','p_limit integer'),
     ('platform','my_assist_admission_decision','p_source_key text'),
     ('platform','resolve_assist_producer_policy','p_source_key text'),
     ('platform','retention_settling_interval',''),
     ('private','get_file_resource_family_for_user','p_user_id uuid, p_file_id uuid'),
     ('rag','fn_bulk_delete_library_documents','p_ids uuid[], p_status text'),
     ('rag','fn_data_store_members_rich','p_store_id uuid'),
     ('rag','fn_delete_library_document','p_id uuid'),
     ('rag','fn_delete_library_document_and_source','p_id uuid'),
     ('rag','fn_get_user_data_store','p_store_id uuid, p_member_limit integer'),
     ('rag','fn_kg_inspector_entities','p_organization_id uuid, p_kind text, p_q text, p_limit integer, p_offset integer'),
     ('rag','fn_kg_inspector_entity_mentions','p_entity_id uuid, p_limit integer, p_offset integer'),
     ('rag','fn_kg_inspector_top_edges','p_organization_id uuid, p_kind text, p_limit integer'),
     ('rag','fn_list_data_store_grants','p_store_id uuid'),
     ('rag','fn_list_library_catalog','p_organization_id uuid'),
     ('rag','fn_list_user_data_stores','p_include_inactive boolean'),
     ('rag','library_grant_publish','p_store_id uuid, p_audience text, p_industry_id uuid, p_organization_id uuid, p_actor uuid'),
     ('rag','library_grant_revoke','p_grant_id uuid, p_actor uuid'),
     ('rag','library_subscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid'),
     ('rag','library_unsubscribe','p_store_id uuid, p_organization_id uuid, p_actor uuid'),
     ('runtime','agent_usage_totals','p_request_ids uuid[]'),
     ('runtime','spine_soft_delete_conversation_requests','p_conversation_id uuid'),
     ('scheduler','system_schedule_alarms','p_overdue_grace_minutes integer'),
     ('web','count_link_edges','p_site_id uuid, p_session_id uuid, p_search text, p_target_url text, p_anchor_text text, p_rel text, p_is_internal boolean, p_http_status_min integer, p_http_status_max integer, p_position_min integer, p_position_max integer'),
     ('web','create_site','p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb, p_integrations jsonb, p_visibility platform.visibility, p_brand_id uuid'),
     ('web','move_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid, p_sibling_order uuid[]'),
     ('web','remove_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_replacement_offering_id uuid'),
     ('web','site_offering_delete_impact','p_site_id uuid, p_offering_id uuid'));
  if n <> 0 then raise exception 'DD-169 batch 3 (dd169_batch3_other_schemas): % grandfather row(s) named here survived', n; end if;
  select count(*) into m from platform.client_callable_door
   where declared_by = 'DD-169 batch 3 / B-75';
  if m < 41 then raise exception 'DD-169 batch 3 (dd169_batch3_other_schemas): expected at least 41 new door rows, found %', m; end if;
  -- every CLOSED function really lost every client grant
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where (ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) in (

     ('communication','record_notification_outcome','p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone'),
     ('crm','check_send_eligibility','p_medium_id uuid, p_list_id uuid, p_identity_id uuid'),
     ('files','is_discoverable_for','p_user_id uuid, p_file_id uuid, p_required permission_level'),
     ('hr','capability','p_user uuid, p_capability text, p_subject_employment uuid, p_at date, p_organization_id uuid'),
     ('hr','jurisdiction_evaluate','p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb, p_organization_id uuid, p_subject_type text, p_subject_id uuid'),
     ('hr','write_calculation_snapshot','p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text, p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text, p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb, p_actor_type text, p_actor_id uuid, p_employment_id uuid, p_clamps jsonb, p_prospective boolean, p_supersedes_id uuid, p_recalculation_batch_id uuid'),
     ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer'),
     ('iam','discoverable_ids','p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean'),
     ('iam','has_access_as','p_user uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_access_for_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
     ('iam','has_org_access_for','p_user_id uuid, p_org uuid'),
     ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level'),
     ('iam','is_discoverable_base','p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean'),
     ('iam','is_org_member','p_user uuid, p_org uuid'),
     ('iam','membership_row_visible','p_membership_id uuid'),
     ('platform','admin_access_contract_violations',''),
     ('platform','assert_admin_access_contract',''),
     ('platform','assert_outsider_scope','p_session text, p_resource text, p_id uuid, p_action text, p_ip inet'),
     ('platform','assist_production_allowed','p_source_key text'),
     ('platform','entity_row_access_attrs','p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean'),
     ('platform','lifecycle_hot_reference_scan',''),
     ('platform','resolve_assist_producer_policy','p_source_key text'),
     ('platform','retention_settling_interval',''),
     ('rag','fn_list_data_store_grants','p_store_id uuid'),
     ('runtime','agent_usage_totals','p_request_ids uuid[]'),
     ('runtime','spine_soft_delete_conversation_requests','p_conversation_id uuid'),
     ('web','move_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid, p_sibling_order uuid[]'),
     ('web','remove_site_offering','p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_replacement_offering_id uuid'),
     ('web','site_offering_delete_impact','p_site_id uuid, p_offering_id uuid'))
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('public', p.oid, 'EXECUTE'));
  if n <> 0 then raise exception 'DD-169 batch 3 (dd169_batch3_other_schemas): % closed function(s) still hold a client EXECUTE grant', n; end if;
end $$;
