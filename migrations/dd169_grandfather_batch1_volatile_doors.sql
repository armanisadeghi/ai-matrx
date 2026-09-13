-- dd169_grandfather_batch1_volatile_doors.sql
--
-- DD-169 batch 1 (B-63) — the WRITING grandfathers stop being grandfathers.
--
-- WHAT WAS TRUE BEFORE THIS FILE. 185 SECURITY DEFINER, non-trigger, VOLATILE
-- (writing) functions could be EXECUTEd by `anon` — the role behind the published
-- anon key — and not one of them carried a `platform.client_callable_door` row.
-- Every one was covered by a `platform.definer_client_grant_grandfather` row, the
-- 2026-08-28 snapshot that makes the §6d-4 event trigger stand down. A grandfather
-- row is not a decision; it is the absence of one. This file replaces the absence
-- with a decision for each function, and deletes the grandfather row so the guard
-- watches it from now on.
--
-- THE THREE DECISIONS (census + per-function reasons: the B-63 report).
--   DECLARE (4) — a real ANONYMOUS caller exists and the body gates what it does.
--       A `client_callable_door` row records who may reach it and why.
--   REVOKE  (147) — only signed-in callers exist. `anon` and PUBLIC lose EXECUTE;
--       `authenticated` keeps it AND gets a door row, because once the grandfather
--       row is gone the §6d-4 re-sweep would otherwise take the signed-in grant too
--       (the guard's exemption list is grandfather-or-door, never anon-only).
--   CLOSE   (26) — no caller in matrx-frontend, aidream, matrx-extend or matrx-local.
--       EXECUTE revoked from PUBLIC, `anon` AND `authenticated`. Every one is an
--       internal helper called from a SECURITY DEFINER wrapper, which runs as its
--       owner and therefore needs no client grant at all.
--
-- NOT TOUCHED: 8 `pgsodium.*` functions. They are extension members owned by
-- `supabase_admin`/`pgsodium_keymaker`, so this role cannot REVOKE on them, and
-- `pgsodium` is absent from `pgrst.db_schemas` — the published key cannot reach
-- them over HTTPS at all. They are also already exempt inside the §6d-4 guard.
--
-- ORDER MATTERS. The door rows are inserted FIRST: every REVOKE below is itself a
-- grant-class DDL command, and `platform.enforce_definer_client_grants` answers one
-- of those with a DB-wide re-sweep that revokes every client EXECUTE on a definer
-- holding neither a grandfather nor a door row. With the rows already in place the
-- sweep passes over them. (Measured before writing this file: 0 definers are in
-- that state today, so the sweep has nothing else to take.)

-- ─── 1. Door rows: the 4 anonymous doors that stay open ──────────────────────
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'anonymous_report_open', 'p_organization_id uuid, p_ip inet', 'DD-169 / B-63', 'ANONYMOUS door. HR anonymous incident reporting: the reporter is anonymous by design. The body requires an organization, applies a 10-per-hour per-IP sliding window, and returns only a minted outsider token scoped to hr.anonymous_report.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'hr_kiosk_pin_reset', 'p_session_token text, p_new_pin text', 'DD-169 / B-63', 'ANONYMOUS door. HR time-clock kiosk: signed-out tablet. Possession of a person-bound hr.kiosk_session token is the proof of identity (that person PIN was accepted moments earlier); the employment is read from the session, never from an argument.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'hr_kiosk_punch', 'p_session_token text, p_employee_pin text, p_kind text, p_device_reported_at timestamp with time zone, p_idempotency_key text, p_photo_file_id uuid, p_geo jsonb, p_attestation jsonb', 'DD-169 / B-63', 'ANONYMOUS door. HR time-clock kiosk: the tablet is signed out by design. The session-token hash IS the identity (a person-bound hr.kiosk_session opened by hr_kiosk_session_open), the PIN is re-verified on every punch, and the employment is read from the session, never from an argument.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'log_client_error', 'p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid', 'DD-169 / B-63', 'ANONYMOUS door. Signed-out client error capture: the web app and the extension must be able to report a failure that happened before or instead of a session. Write-only into the diagnostics sink; it returns nothing but an id.') on conflict do nothing;

-- ─── 2. Door rows: the 147 signed-in doors that keep `authenticated` ─────────
-- Each row says the same thing in its own words: an anonymous caller has no
-- business here, a signed-in one does, and this is why.
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'addon_grant', 'p_org uuid, p_capability text, p_period billing.meter_period, p_limit bigint, p_source text, p_note text, p_expires_at timestamp with time zone', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'entitlement_check', 'p_capability text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'entitlement_check', 'p_capability text, p_org uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'entitlement_consume', 'p_capability text, p_quantity integer, p_check_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'entitlement_consume', 'p_capability text, p_quantity integer, p_check_id uuid, p_org uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'org_plan_assign', 'p_org uuid, p_plan text, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'org_plan_set', 'p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamp with time zone', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('billing', 'plan_limit_set', 'p_plan_id text, p_capability text, p_period billing.meter_period, p_limit_value bigint', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('content_ir', 'admin_upsert_kind_content_block', 'p_kind_definition_id uuid, p_block_id text, p_label text, p_description text, p_icon_name text, p_template text, p_metadata jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('context', 'provision_scope_dataset', 'p_item_id uuid, p_scope_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('files', 'webhook_dispatch', 'p_limit integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('files', 'webhook_send_test', 'p_webhook_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'decide_outcome_event', 'p_outcome_id uuid, p_status text, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'log_activity', 'p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'set_org_change_policy', 'p_org_id uuid, p_change_type_key text, p_handling_mode text, p_timeout_minutes integer, p_timeout_expiry text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('platform', 'upsert_unit_purpose', 'p_unit_type text, p_unit_id uuid, p_title text, p_statement text, p_grounding_tag text, p_inputs jsonb, p_outputs jsonb, p_safe_conditions jsonb, p_position integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_request_create', 'p_resource_type text, p_resource_id uuid, p_level text, p_message text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_request_decide', 'p_request_id uuid, p_decision text, p_level text, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_request_report', 'p_request_id uuid, p_reason text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'access_request_withdraw', 'p_request_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_reachability_guard_report', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_revoke', 'target_user_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_set_entity_type_preview', 'p_token text, p_allow boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_set_share_policy', 'p_resource_type text, p_is_link_shareable boolean, p_public_columns text[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_taxonomy_upsert', 'p_id uuid, p_slug text, p_name text, p_level text, p_parent_id uuid, p_status text, p_docs_path text, p_notes text, p_anchors jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_upsert_assist_producer_policy', 'p_source_pattern text, p_match_kind text, p_display_name text, p_feature_key text, p_disposition text, p_audit_status text, p_production_enabled boolean, p_presentation_enabled boolean, p_cost_class text, p_max_pending_per_user integer, p_max_presented_per_cycle integer, p_working_message text, p_rationale text, p_config jsonb, p_reason text, p_expected_version integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_upsert_reference_category', 'p_slug text, p_label text, p_sort_order integer, p_is_active boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'admin_upsert_schema', 'p_schema_name text, p_display_name text, p_sort_order integer, p_is_active boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_declare_contract_break', 'p_agent_id uuid, p_version_number integer, p_kind text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_duplicate_shortcut', 'p_shortcut_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_exemplar_approve', 'p_exemplar_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_promote_shortcut_to_global', 'p_shortcut_id uuid, p_target_category_id uuid, p_label text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_sync_linked_agents', 'p_from_id uuid, p_to_id uuid, p_include_identity boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'agx_sync_linked_agents_reviewed', 'p_from_id uuid, p_to_id uuid, p_include_identity boolean, p_expected_from_updated_at timestamp with time zone, p_expected_to_updated_at timestamp with time zone', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'bump_version', 'p_file_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'create_bundle_with_lister', 'p_name text, p_description text, p_is_system boolean, p_lister_tool_name text, p_member_tool_names text[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'create_note_version_manual', 'p_note_id uuid, p_content text, p_label text, p_change_source text, p_change_type text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'create_scope', 'p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid, p_description text, p_settings jsonb, p_slug text, p_sort_order smallint', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_dismiss_merge_candidate', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_inbox_set_handled', 'p_interaction_id uuid, p_handled boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_merge_parties', 'p_winner uuid, p_loser uuid, p_method text, p_reason text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_party_purge', 'p_party uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_resume_sending_identity', 'p_identity_id uuid, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_set_primary_contact_point', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'crm_unmerge_parties', 'p_merge_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'cx_message_set_content', 'p_message_id uuid, p_new_content jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'cx_message_soft_delete', 'p_message_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'cx_truncate_conversation_after', 'p_conversation_id uuid, p_after_position integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'delete_conversation_for_user', 'p_conversation_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'delete_note_version', 'p_id text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_delete_entries', 'p_level text, p_owner_id uuid, p_ids uuid[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_get_settings', 'p_level text, p_owner_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_list_entries', 'p_level text, p_owner_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_list_owners', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_resolve', 'p_include_user boolean, p_all boolean, p_organization_ids uuid[], p_scope_type_ids uuid[], p_scope_ids uuid[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_set_settings', 'p_level text, p_owner_id uuid, p_max_inline_chars integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dict_upsert_entries', 'p_level text, p_owner_id uuid, p_entries jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'dissociate_from_task', 'p_task_id uuid, p_entity_type text, p_entity_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_certify_content', 'p_resource_type text, p_resource_id uuid, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_learn_doc_admin_list', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_learn_doc_delete', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_learn_doc_set_status', 'p_id uuid, p_publish boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_learn_doc_upsert', 'p_slug text, p_title text, p_summary text, p_sections jsonb, p_id uuid, p_subject text, p_letter text, p_keywords text[], p_related jsonb, p_content_updated_at date', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_resolve_suggestion', 'p_id uuid, p_status text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'edu_suggest_edit', 'p_resource_id uuid, p_body text, p_resource_type text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'entity_soft_delete', 'p_token text, p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'entity_undelete', 'p_token text, p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'fork_processed_document', 'p_source_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'fork_shared_conversation', 'p_conversation_id uuid, p_token text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'fork_shared_flashcard_set', 'p_set_id uuid, p_token text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'fork_shared_quiz', 'p_quiz_id uuid, p_token text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'game_room_by_code', 'p_code text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'game_room_players', 'p_room_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_agent_core_batch', 'p_ids uuid[], p_sources text[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_agent_operational', 'p_id uuid, p_source text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_agents_for_chat', 'p_limit integer, p_cursor uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_cx_conversations_shared_with_me', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_resource_permissions', 'p_resource_type text, p_resource_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (2 call sites).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_dashboard_metrics', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'get_user_hierarchy', '', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'inv_accept', 'p_token text, p_hr_half_handled boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'kg_heavy_hitter_accept_plan', 'p_suggestion_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'league_leaderboard', 'p_week_start date', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_publish', 'p_entity_type text, p_entity_id uuid, p_audience text, p_industry_id uuid, p_organization_id uuid, p_actor uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_revoke', 'p_grant_id uuid, p_actor uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_subscribe', 'p_entity_type text, p_entity_id uuid, p_organization_id uuid, p_target jsonb, p_actor uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'library_unsubscribe', 'p_entity_type text, p_entity_id uuid, p_organization_id uuid, p_actor uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'list_udt_dataset_templates', 'p_org_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'log_kind_component_incident', 'p_kind text, p_error_type text, p_error_message text, p_platform text, p_role text, p_component_id uuid, p_component_key text, p_component_semver text, p_component_version integer, p_error_stack text, p_data_shape jsonb, p_browser_info jsonb, p_session_id text, p_route text, p_component_updated_at timestamp with time zone', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'make_resource_private', 'p_resource_type text, p_resource_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'make_resource_public', 'p_resource_type text, p_resource_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'mark_conversation_read', 'p_conversation_id uuid, p_message_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'move_site_to_organization', 'p_site_id uuid, p_target_organization_id uuid, p_expected_version integer, p_brand_action text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'org_admin_set_member_controls', 'p_org_id uuid, p_user_id uuid, p_member_level text, p_tier_override text, p_storage_cap_bytes bigint, p_monthly_budget_mcents bigint, p_notes text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'org_admin_set_member_status', 'p_org_id uuid, p_user_id uuid, p_status text, p_reason text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'preview_site_organization_move', 'p_site_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'rename_folder', 'p_folder_id uuid, p_new_path text, p_new_parent_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'restore_file', 'p_file_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'restore_folder', 'p_folder_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'restore_note_version', 'p_note_id uuid, p_version_number integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'revoke_resource_access', 'p_resource_type text, p_resource_id uuid, p_target_user_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'revoke_resource_org_access', 'p_resource_type text, p_resource_id uuid, p_target_org_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'rulebook_snapshot', 'p_rulebook_id uuid, p_version integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'rulebook_versions', 'p_rulebook_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'sch_recompute_task_next_due_at', 'p_task_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'scope_system_apply', 'p_org_id uuid, p_operations jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'scope_system_inspect', 'p_org_id uuid, p_include_values boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'set_entity_scopes', 'p_entity_type text, p_entity_id uuid, p_scope_ids uuid[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'set_scope_context_value', 'p_scope_id uuid, p_context_item_id uuid, p_value_text text, p_value_number numeric, p_value_boolean boolean, p_value_json jsonb, p_value_document_url text, p_value_date date, p_value_timestamp timestamp with time zone, p_value_time time without time zone, p_change_summary text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'set_streak_rest_weekdays', 'p_weekdays smallint[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'shape_doctor_set_skill_owner', 'p_kind text, p_syntax text, p_skill_id text, p_note text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (super-admin gate); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'share_resource_with_org', 'p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'share_resource_with_user', 'p_resource_type text, p_resource_id uuid, p_target_user_id uuid, p_permission_level text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'soft_delete_file', 'p_file_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'soft_delete_folder', 'p_folder_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'study_override_attempt', 'p_attempt_id uuid, p_result text, p_score_value numeric, p_score jsonb, p_difficulty numeric, p_stability numeric, p_due_at timestamp with time zone, p_retrievability numeric, p_lapses integer, p_streak integer, p_attempt_count integer, p_correct_count integer, p_struggle_flag boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'study_record_attempt', 'p_item_type text, p_item_id uuid, p_session_id uuid, p_method text, p_result text, p_score jsonb, p_score_value numeric, p_response_kind text, p_response_audio_file_id uuid, p_response_image_file_id uuid, p_response_transcript text, p_latency_ms integer, p_graded_by text, p_difficulty numeric, p_stability numeric, p_due_at timestamp with time zone, p_retrievability numeric, p_lapses integer, p_attempt_id uuid, p_reviewed_at timestamp with time zone', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'tool_register_mcp_discovered', 'p_server_id uuid, p_tool_specs jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'udt_delete_field', 'p_table_id uuid, p_field_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'udt_set_field_format', 'p_table_id uuid, p_field_id uuid, p_format jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'update_permission_level', 'p_resource_type text, p_resource_id uuid, p_target_user_id uuid, p_target_org_id uuid, p_new_level text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'update_scope', 'p_scope_id uuid, p_name text, p_description text, p_settings jsonb, p_slug text, p_sort_order smallint', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (3 call sites).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'update_user_table_row_ordering', 'p_table_id uuid, p_enabled boolean, p_order jsonb, p_label_field text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'wfx_duplicate_definition', 'p_definition_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('public', 'wfx_duplicate_version', 'p_version_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'fn_purge_library_document', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'fn_purge_library_file', 'p_file_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('rag', 'fn_restore_library_document', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'adopt_starter_pack', 'p_site_id uuid, p_pack_id uuid, p_include text[], p_topic_ids uuid[], p_seed_guidelines boolean, p_geo_places jsonb, p_geo_place_ids jsonb, p_item_ids uuid[], p_reset boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'fn_list_site_research_instance_ids', 'p_site_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_delete_saved_view', 'p_site_id uuid, p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_save_view', 'p_site_id uuid, p_name text, p_state jsonb, p_id uuid, p_surface text, p_position integer, p_shared boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_set_topic_value', 'p_site_id uuid, p_topic_id uuid, p_weight numeric, p_lead_quality text, p_offering_match text, p_notes text, p_clear boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'gsc_value_combo_set', 'p_site_id uuid, p_value_ids uuid[], p_effect text, p_amount numeric, p_label text, p_notes text, p_enabled boolean, p_combo_id uuid, p_archive boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'platform_default_rule_delete', 'p_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'platform_default_rule_save', 'p_label text, p_dimension_slug text, p_value_slug text, p_match_kind text, p_phrases text[], p_effect text, p_id uuid, p_exclusions text[], p_amount numeric, p_notes text, p_sort integer', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'set_site_offering_value', 'p_organization_id uuid, p_site_id uuid, p_brand_offering_id uuid, p_weight numeric, p_lead_quality text, p_offering_match text, p_notes text, p_clear boolean', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'stamp_keyword_places', 'p_keyword_ids uuid[], p_detector_version text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_from_proposal', 'p_proposal jsonb, p_industry_id uuid, p_source_corpus jsonb, p_source_site_ids uuid[]', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_item_delete', 'p_item_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_item_save', 'p_item jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_new_version', 'p_pack_id uuid, p_slug text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_save', 'p_pack jsonb', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('seo', 'starter_pack_set_status', 'p_pack_id uuid, p_status text, p_notes text', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('web', 'adopt_offering_template', 'p_organization_id uuid, p_site_id uuid, p_template_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('web', 'move_site_brand', 'p_site_id uuid, p_brand_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason) values ('web', 'save_site_offering', 'p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_name text, p_kind text, p_description text, p_parent_id uuid', 'DD-169 / B-63', 'SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.') on conflict do nothing;

-- ─── 3. The 1 signed-in doors that reached `authenticated` only through PUBLIC ──
-- Revoking PUBLIC below would take the signed-in caller with it, so the grant is
-- made explicit first. Its door row is already in place above, so the §6d-4
-- re-sweep this GRANT triggers passes over it.
grant execute on function seo.gsc_set_topic_value(uuid,uuid,numeric,text,text,text,boolean) to authenticated;

-- ─── 4. REVOKE: `anon` and PUBLIC lose the 147 writing doors ─────────────────
revoke execute on function billing.addon_grant(uuid,text,billing.meter_period,bigint,text,text,timestamp with time zone) from public, anon;
revoke execute on function billing.entitlement_check(text) from public, anon;
revoke execute on function billing.entitlement_check(text,uuid) from public, anon;
revoke execute on function billing.entitlement_consume(text,integer,uuid) from public, anon;
revoke execute on function billing.entitlement_consume(text,integer,uuid,uuid) from public, anon;
revoke execute on function billing.org_plan_assign(uuid,text,text) from public, anon;
revoke execute on function billing.org_plan_set(uuid,billing.tier,text,text,timestamp with time zone) from public, anon;
revoke execute on function billing.plan_limit_set(text,text,billing.meter_period,bigint) from public, anon;
revoke execute on function content_ir.admin_upsert_kind_content_block(uuid,text,text,text,text,text,jsonb) from public, anon;
revoke execute on function context.provision_scope_dataset(uuid,uuid) from public, anon;
revoke execute on function files.webhook_dispatch(integer) from public, anon;
revoke execute on function files.webhook_send_test(uuid) from public, anon;
revoke execute on function platform.decide_outcome_event(uuid,text,text) from public, anon;
revoke execute on function platform.log_activity(uuid,text,text,uuid,jsonb) from public, anon;
revoke execute on function platform.set_org_change_policy(uuid,text,text,integer,text) from public, anon;
revoke execute on function platform.upsert_unit_purpose(text,uuid,text,text,text,jsonb,jsonb,jsonb,integer) from public, anon;
revoke execute on function access_request_create(text,uuid,text,text) from public, anon;
revoke execute on function access_request_decide(uuid,text,text,text) from public, anon;
revoke execute on function access_request_report(uuid,text) from public, anon;
revoke execute on function access_request_withdraw(uuid) from public, anon;
revoke execute on function admin_reachability_guard_report() from public, anon;
revoke execute on function admin_revoke(uuid) from public, anon;
revoke execute on function admin_set_entity_type_preview(text,boolean) from public, anon;
revoke execute on function admin_set_share_policy(text,boolean,text[]) from public, anon;
revoke execute on function admin_taxonomy_upsert(uuid,text,text,text,uuid,text,text,text,jsonb) from public, anon;
revoke execute on function admin_upsert_assist_producer_policy(text,text,text,text,text,text,boolean,boolean,text,integer,integer,text,text,jsonb,text,integer) from public, anon;
revoke execute on function admin_upsert_reference_category(text,text,integer,boolean) from public, anon;
revoke execute on function admin_upsert_schema(text,text,integer,boolean) from public, anon;
revoke execute on function agx_declare_contract_break(uuid,integer,text) from public, anon;
revoke execute on function agx_duplicate_shortcut(uuid) from public, anon;
revoke execute on function agx_exemplar_approve(uuid) from public, anon;
revoke execute on function agx_promote_shortcut_to_global(uuid,uuid,text) from public, anon;
revoke execute on function agx_sync_linked_agents(uuid,uuid,boolean) from public, anon;
revoke execute on function agx_sync_linked_agents_reviewed(uuid,uuid,boolean,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function bump_version(uuid) from public, anon;
revoke execute on function create_bundle_with_lister(text,text,boolean,text,text[]) from public, anon;
revoke execute on function create_note_version_manual(uuid,text,text,text,text) from public, anon;
revoke execute on function create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint) from public, anon;
revoke execute on function crm_dismiss_merge_candidate(uuid) from public, anon;
revoke execute on function crm_inbox_set_handled(uuid,boolean) from public, anon;
revoke execute on function crm_merge_parties(uuid,uuid,text,text) from public, anon;
revoke execute on function crm_party_purge(uuid) from public, anon;
revoke execute on function crm_resume_sending_identity(uuid,text) from public, anon;
revoke execute on function crm_set_primary_contact_point(uuid) from public, anon;
revoke execute on function crm_unmerge_parties(uuid) from public, anon;
revoke execute on function cx_message_set_content(uuid,jsonb) from public, anon;
revoke execute on function cx_message_soft_delete(uuid) from public, anon;
revoke execute on function cx_truncate_conversation_after(uuid,integer) from public, anon;
revoke execute on function delete_conversation_for_user(uuid) from public, anon;
revoke execute on function delete_note_version(text) from public, anon;
revoke execute on function dict_delete_entries(text,uuid,uuid[]) from public, anon;
revoke execute on function dict_get_settings(text,uuid) from public, anon;
revoke execute on function dict_list_entries(text,uuid) from public, anon;
revoke execute on function dict_list_owners() from public, anon;
revoke execute on function dict_resolve(boolean,boolean,uuid[],uuid[],uuid[]) from public, anon;
revoke execute on function dict_set_settings(text,uuid,integer) from public, anon;
revoke execute on function dict_upsert_entries(text,uuid,jsonb) from public, anon;
revoke execute on function dissociate_from_task(uuid,text,uuid) from public, anon;
revoke execute on function edu_certify_content(text,uuid,text) from public, anon;
revoke execute on function edu_learn_doc_admin_list() from public, anon;
revoke execute on function edu_learn_doc_delete(uuid) from public, anon;
revoke execute on function edu_learn_doc_set_status(uuid,boolean) from public, anon;
revoke execute on function edu_learn_doc_upsert(text,text,text,jsonb,uuid,text,text,text[],jsonb,date) from public, anon;
revoke execute on function edu_resolve_suggestion(uuid,text) from public, anon;
revoke execute on function edu_suggest_edit(uuid,text,text) from public, anon;
revoke execute on function entity_soft_delete(text,uuid) from public, anon;
revoke execute on function entity_undelete(text,uuid) from public, anon;
revoke execute on function fork_processed_document(uuid) from public, anon;
revoke execute on function fork_shared_conversation(uuid,text) from public, anon;
revoke execute on function fork_shared_flashcard_set(uuid,text) from public, anon;
revoke execute on function fork_shared_quiz(uuid,text) from public, anon;
revoke execute on function game_room_by_code(text) from public, anon;
revoke execute on function game_room_players(uuid) from public, anon;
revoke execute on function get_agent_core_batch(uuid[],text[]) from public, anon;
revoke execute on function get_agent_operational(uuid,text) from public, anon;
revoke execute on function get_agents_for_chat(integer,uuid) from public, anon;
revoke execute on function get_cx_conversations_shared_with_me() from public, anon;
revoke execute on function get_resource_permissions(text,uuid) from public, anon;
revoke execute on function get_user_dashboard_metrics() from public, anon;
revoke execute on function get_user_hierarchy() from public, anon;
revoke execute on function inv_accept(text,boolean) from public, anon;
revoke execute on function kg_heavy_hitter_accept_plan(uuid) from public, anon;
revoke execute on function league_leaderboard(date) from public, anon;
revoke execute on function library_publish(text,uuid,text,uuid,uuid,uuid) from public, anon;
revoke execute on function library_revoke(uuid,uuid) from public, anon;
revoke execute on function library_subscribe(text,uuid,uuid,jsonb,uuid) from public, anon;
revoke execute on function library_unsubscribe(text,uuid,uuid,uuid) from public, anon;
revoke execute on function list_udt_dataset_templates(uuid) from public, anon;
revoke execute on function log_kind_component_incident(text,text,text,text,text,uuid,text,text,integer,text,jsonb,jsonb,text,text,timestamp with time zone) from public, anon;
revoke execute on function make_resource_private(text,uuid) from public, anon;
revoke execute on function make_resource_public(text,uuid) from public, anon;
revoke execute on function mark_conversation_read(uuid,uuid) from public, anon;
revoke execute on function move_site_to_organization(uuid,uuid,integer,text) from public, anon;
revoke execute on function org_admin_set_member_controls(uuid,uuid,text,text,bigint,bigint,text) from public, anon;
revoke execute on function org_admin_set_member_status(uuid,uuid,text,text) from public, anon;
revoke execute on function preview_site_organization_move(uuid) from public, anon;
revoke execute on function rename_folder(uuid,text,uuid) from public, anon;
revoke execute on function restore_file(uuid) from public, anon;
revoke execute on function restore_folder(uuid) from public, anon;
revoke execute on function restore_note_version(uuid,integer) from public, anon;
revoke execute on function revoke_resource_access(text,uuid,uuid) from public, anon;
revoke execute on function revoke_resource_org_access(text,uuid,uuid) from public, anon;
revoke execute on function rulebook_snapshot(uuid,integer) from public, anon;
revoke execute on function rulebook_versions(uuid) from public, anon;
revoke execute on function sch_recompute_task_next_due_at(uuid) from public, anon;
revoke execute on function scope_system_apply(uuid,jsonb) from public, anon;
revoke execute on function scope_system_inspect(uuid,boolean) from public, anon;
revoke execute on function set_entity_scopes(text,uuid,uuid[]) from public, anon;
revoke execute on function set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text) from public, anon;
revoke execute on function set_streak_rest_weekdays(smallint[]) from public, anon;
revoke execute on function shape_doctor_set_skill_owner(text,text,text,text) from public, anon;
revoke execute on function share_resource_with_org(text,uuid,uuid,text) from public, anon;
revoke execute on function share_resource_with_user(text,uuid,uuid,text) from public, anon;
revoke execute on function soft_delete_file(uuid) from public, anon;
revoke execute on function soft_delete_folder(uuid) from public, anon;
revoke execute on function study_override_attempt(uuid,text,numeric,jsonb,numeric,numeric,timestamp with time zone,numeric,integer,integer,integer,integer,boolean) from public, anon;
revoke execute on function study_record_attempt(text,uuid,uuid,text,text,jsonb,numeric,text,uuid,uuid,text,integer,text,numeric,numeric,timestamp with time zone,numeric,integer,uuid,timestamp with time zone) from public, anon;
revoke execute on function tool_register_mcp_discovered(uuid,jsonb) from public, anon;
revoke execute on function udt_delete_field(uuid,uuid) from public, anon;
revoke execute on function udt_set_field_format(uuid,uuid,jsonb) from public, anon;
revoke execute on function update_permission_level(text,uuid,uuid,uuid,text) from public, anon;
revoke execute on function update_scope(uuid,text,text,jsonb,text,smallint) from public, anon;
revoke execute on function update_user_table_row_ordering(uuid,boolean,jsonb,text) from public, anon;
revoke execute on function wfx_duplicate_definition(uuid) from public, anon;
revoke execute on function wfx_duplicate_version(uuid) from public, anon;
revoke execute on function rag.fn_purge_library_document(uuid) from public, anon;
revoke execute on function rag.fn_purge_library_file(uuid) from public, anon;
revoke execute on function rag.fn_restore_library_document(uuid) from public, anon;
revoke execute on function seo.adopt_starter_pack(uuid,uuid,text[],uuid[],boolean,jsonb,jsonb,uuid[],boolean) from public, anon;
revoke execute on function seo.fn_list_site_research_instance_ids(uuid) from public, anon;
revoke execute on function seo.gsc_delete_saved_view(uuid,uuid) from public, anon;
revoke execute on function seo.gsc_save_view(uuid,text,jsonb,uuid,text,integer,boolean) from public, anon;
revoke execute on function seo.gsc_set_topic_value(uuid,uuid,numeric,text,text,text,boolean) from public, anon;
revoke execute on function seo.gsc_value_combo_set(uuid,uuid[],text,numeric,text,text,boolean,uuid,boolean) from public, anon;
revoke execute on function seo.platform_default_rule_delete(uuid) from public, anon;
revoke execute on function seo.platform_default_rule_save(text,text,text,text,text[],text,uuid,text[],numeric,text,integer) from public, anon;
revoke execute on function seo.set_site_offering_value(uuid,uuid,uuid,numeric,text,text,text,boolean) from public, anon;
revoke execute on function seo.stamp_keyword_places(uuid[],text) from public, anon;
revoke execute on function seo.starter_pack_from_proposal(jsonb,uuid,jsonb,uuid[]) from public, anon;
revoke execute on function seo.starter_pack_item_delete(uuid) from public, anon;
revoke execute on function seo.starter_pack_item_save(jsonb) from public, anon;
revoke execute on function seo.starter_pack_new_version(uuid,text) from public, anon;
revoke execute on function seo.starter_pack_save(jsonb) from public, anon;
revoke execute on function seo.starter_pack_set_status(uuid,text,text) from public, anon;
revoke execute on function web.adopt_offering_template(uuid,uuid,uuid) from public, anon;
revoke execute on function web.move_site_brand(uuid,uuid) from public, anon;
revoke execute on function web.save_site_offering(uuid,uuid,uuid,text,text,text,uuid) from public, anon;

-- ─── 5. CLOSE: the 26 helpers no client role may call ────────────────────────
revoke execute on function esign._act_adopt(jsonb,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke execute on function esign._act_consent(jsonb,uuid) from public, anon, authenticated;
revoke execute on function esign._act_decline(jsonb,text) from public, anon, authenticated;
revoke execute on function esign._act_delegate(jsonb,text,text,text) from public, anon, authenticated;
revoke execute on function esign._act_download(jsonb,uuid) from public, anon, authenticated;
revoke execute on function esign._act_load(jsonb) from public, anon, authenticated;
revoke execute on function esign._act_preview_ack(jsonb,uuid) from public, anon, authenticated;
revoke execute on function esign._act_sign(jsonb,jsonb,text) from public, anon, authenticated;
revoke execute on function esign._ctx_internal(uuid,inet,text) from public, anon, authenticated;
revoke execute on function esign._ctx_outsider(text,text,inet,text) from public, anon, authenticated;
revoke execute on function esign._event(uuid,text,text,uuid,uuid,uuid,uuid,text,text,inet,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function esign._maybe_complete(uuid) from public, anon, authenticated;
revoke execute on function esign._notify(uuid,text,uuid,uuid,text,uuid,text,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function esign._notify_actionable(uuid,text) from public, anon, authenticated;
revoke execute on function esign._notify_actionable_capped(uuid,integer) from public, anon, authenticated;
revoke execute on function esign._revoke_open_tokens(uuid,text) from public, anon, authenticated;
revoke execute on function esign.config_set(uuid,text,jsonb,text) from public, anon, authenticated;
revoke execute on function files.webhook_tick() from public, anon, authenticated;
revoke execute on function iam._managed_invitation(uuid) from public, anon, authenticated;
revoke execute on function iam._org_audit(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function _edu_ensure_owner_membership(context.scopes) from public, anon, authenticated;
revoke execute on function _library_assert_admin(uuid) from public, anon, authenticated;
revoke execute on function _scope_system_resolve_type_id(uuid,jsonb,text) from public, anon, authenticated;
revoke execute on function seo._pack_convert_rules_to_meaning(uuid) from public, anon, authenticated;
revoke execute on function seo._pack_touch(uuid) from public, anon, authenticated;
revoke execute on function seo.fn_evaluate_matchers_internal(uuid,uuid[],text) from public, anon, authenticated;

-- ─── 6. The grandfather rows for all 177 decided functions are deleted ────────
-- From here the §6d-4 event trigger watches every one of them: a future GRANT to a
-- client role on any of these is taken straight back and logged, unless its door
-- row still says why. `pgsodium` rows are left alone (see the header). The last five tuples are
-- cmt_add / cmt_delete / cmt_edit / ues_set / ues_touch: already DECLARED doors that
-- still carried a grandfather row as well, so the row was pure redundancy and its
-- removal changes nothing about who may call them.
delete from platform.definer_client_grant_grandfather g
 using (values
  ('billing', 'addon_grant', '2950 25 1698328 20 25 25 1184'),
  ('billing', 'entitlement_check', '25'),
  ('billing', 'entitlement_check', '25 2950'),
  ('billing', 'entitlement_consume', '25 23 2950'),
  ('billing', 'entitlement_consume', '25 23 2950 2950'),
  ('billing', 'org_plan_assign', '2950 25 25'),
  ('billing', 'org_plan_set', '2950 1698360 25 25 1184'),
  ('billing', 'plan_limit_set', '25 25 1698328 20'),
  ('content_ir', 'admin_upsert_kind_content_block', '2950 25 25 25 25 25 3802'),
  ('context', 'provision_scope_dataset', '2950 2950'),
  ('esign', '_act_adopt', '3802 25 25 25 2950 3802'),
  ('esign', '_act_consent', '3802 2950'),
  ('esign', '_act_decline', '3802 25'),
  ('esign', '_act_delegate', '3802 25 25 25'),
  ('esign', '_act_download', '3802 2950'),
  ('esign', '_act_load', '3802'),
  ('esign', '_act_preview_ack', '3802 2950'),
  ('esign', '_act_sign', '3802 3802 25'),
  ('esign', '_ctx_internal', '2950 869 25'),
  ('esign', '_ctx_outsider', '25 25 869 25'),
  ('esign', '_event', '2950 25 25 2950 2950 2950 2950 25 25 869 25 25 3802 25'),
  ('esign', '_maybe_complete', '2950'),
  ('esign', '_notify', '2950 25 2950 2950 25 2950 25 25 25 3802 25'),
  ('esign', '_notify_actionable', '2950 25'),
  ('esign', '_notify_actionable_capped', '2950 23'),
  ('esign', '_revoke_open_tokens', '2950 25'),
  ('esign', 'config_set', '2950 25 3802 25'),
  ('files', 'webhook_dispatch', '23'),
  ('files', 'webhook_send_test', '2950'),
  ('files', 'webhook_tick', ''),
  ('iam', '_managed_invitation', '2950'),
  ('iam', '_org_audit', '2950 2950 25 3802'),
  ('platform', 'decide_outcome_event', '2950 25 25'),
  ('platform', 'log_activity', '2950 25 25 2950 3802'),
  ('platform', 'set_org_change_policy', '2950 25 25 23 25'),
  ('platform', 'upsert_unit_purpose', '25 2950 25 25 25 3802 3802 3802 23'),
  ('public', '_edu_ensure_owner_membership', '1700311'),
  ('public', '_library_assert_admin', '2950'),
  ('public', '_scope_system_resolve_type_id', '2950 3802 25'),
  ('public', 'access_request_create', '25 2950 25 25'),
  ('public', 'access_request_decide', '2950 25 25 25'),
  ('public', 'access_request_report', '2950 25'),
  ('public', 'access_request_withdraw', '2950'),
  ('public', 'admin_reachability_guard_report', ''),
  ('public', 'admin_revoke', '2950'),
  ('public', 'admin_set_entity_type_preview', '25 16'),
  ('public', 'admin_set_share_policy', '25 16 1009'),
  ('public', 'admin_taxonomy_upsert', '2950 25 25 25 2950 25 25 25 3802'),
  ('public', 'admin_upsert_assist_producer_policy', '25 25 25 25 25 25 16 16 25 23 23 25 25 3802 25 23'),
  ('public', 'admin_upsert_reference_category', '25 25 23 16'),
  ('public', 'admin_upsert_schema', '25 25 23 16'),
  ('public', 'agx_declare_contract_break', '2950 23 25'),
  ('public', 'agx_duplicate_shortcut', '2950'),
  ('public', 'agx_exemplar_approve', '2950'),
  ('public', 'agx_promote_shortcut_to_global', '2950 2950 25'),
  ('public', 'agx_sync_linked_agents', '2950 2950 16'),
  ('public', 'agx_sync_linked_agents_reviewed', '2950 2950 16 1184 1184'),
  ('public', 'anonymous_report_open', '2950 869'),
  ('public', 'bump_version', '2950'),
  ('public', 'create_bundle_with_lister', '25 25 16 25 1009'),
  ('public', 'create_note_version_manual', '2950 25 25 25 25'),
  ('public', 'create_scope', '2950 2950 25 2950 25 3802 25 21'),
  ('public', 'crm_dismiss_merge_candidate', '2950'),
  ('public', 'crm_inbox_set_handled', '2950 16'),
  ('public', 'crm_merge_parties', '2950 2950 25 25'),
  ('public', 'crm_party_purge', '2950'),
  ('public', 'crm_resume_sending_identity', '2950 25'),
  ('public', 'crm_set_primary_contact_point', '2950'),
  ('public', 'crm_unmerge_parties', '2950'),
  ('public', 'cx_message_set_content', '2950 3802'),
  ('public', 'cx_message_soft_delete', '2950'),
  ('public', 'cx_truncate_conversation_after', '2950 23'),
  ('public', 'delete_conversation_for_user', '2950'),
  ('public', 'delete_note_version', '25'),
  ('public', 'dict_delete_entries', '25 2950 2951'),
  ('public', 'dict_get_settings', '25 2950'),
  ('public', 'dict_list_entries', '25 2950'),
  ('public', 'dict_list_owners', ''),
  ('public', 'dict_resolve', '16 16 2951 2951 2951'),
  ('public', 'dict_set_settings', '25 2950 23'),
  ('public', 'dict_upsert_entries', '25 2950 3802'),
  ('public', 'dissociate_from_task', '2950 25 2950'),
  ('public', 'edu_certify_content', '25 2950 25'),
  ('public', 'edu_learn_doc_admin_list', ''),
  ('public', 'edu_learn_doc_delete', '2950'),
  ('public', 'edu_learn_doc_set_status', '2950 16'),
  ('public', 'edu_learn_doc_upsert', '25 25 25 3802 2950 25 25 1009 3802 1082'),
  ('public', 'edu_resolve_suggestion', '2950 25'),
  ('public', 'edu_suggest_edit', '2950 25 25'),
  ('public', 'entity_soft_delete', '25 2950'),
  ('public', 'entity_undelete', '25 2950'),
  ('public', 'fork_processed_document', '2950'),
  ('public', 'fork_shared_conversation', '2950 25'),
  ('public', 'fork_shared_flashcard_set', '2950 25'),
  ('public', 'fork_shared_quiz', '2950 25'),
  ('public', 'game_room_by_code', '25'),
  ('public', 'game_room_players', '2950'),
  ('public', 'get_agent_core_batch', '2951 1009'),
  ('public', 'get_agent_operational', '2950 25'),
  ('public', 'get_agents_for_chat', '23 2950'),
  ('public', 'get_cx_conversations_shared_with_me', ''),
  ('public', 'get_resource_permissions', '25 2950'),
  ('public', 'get_user_dashboard_metrics', ''),
  ('public', 'get_user_hierarchy', ''),
  ('public', 'hr_kiosk_pin_reset', '25 25'),
  ('public', 'hr_kiosk_punch', '25 25 25 1184 25 2950 3802 3802'),
  ('public', 'inv_accept', '25 16'),
  ('public', 'kg_heavy_hitter_accept_plan', '2950'),
  ('public', 'league_leaderboard', '1082'),
  ('public', 'library_publish', '25 2950 25 2950 2950 2950'),
  ('public', 'library_revoke', '2950 2950'),
  ('public', 'library_subscribe', '25 2950 2950 3802 2950'),
  ('public', 'library_unsubscribe', '25 2950 2950 2950'),
  ('public', 'list_udt_dataset_templates', '2950'),
  ('public', 'log_client_error', '25 25 25 25 25 2950 25 3802 3802 2950'),
  ('public', 'log_kind_component_incident', '25 25 25 25 25 2950 25 25 23 25 3802 3802 25 25 1184'),
  ('public', 'make_resource_private', '25 2950'),
  ('public', 'make_resource_public', '25 2950'),
  ('public', 'mark_conversation_read', '2950 2950'),
  ('public', 'move_site_to_organization', '2950 2950 23 25'),
  ('public', 'org_admin_set_member_controls', '2950 2950 25 25 20 20 25'),
  ('public', 'org_admin_set_member_status', '2950 2950 25 25'),
  ('public', 'preview_site_organization_move', '2950'),
  ('public', 'rename_folder', '2950 25 2950'),
  ('public', 'restore_file', '2950'),
  ('public', 'restore_folder', '2950'),
  ('public', 'restore_note_version', '2950 23'),
  ('public', 'revoke_resource_access', '25 2950 2950'),
  ('public', 'revoke_resource_org_access', '25 2950 2950'),
  ('public', 'rulebook_snapshot', '2950 23'),
  ('public', 'rulebook_versions', '2950'),
  ('public', 'sch_recompute_task_next_due_at', '2950'),
  ('public', 'scope_system_apply', '2950 3802'),
  ('public', 'scope_system_inspect', '2950 16'),
  ('public', 'set_entity_scopes', '25 2950 2951'),
  ('public', 'set_scope_context_value', '2950 2950 25 1700 16 3802 25 1082 1184 1083 25'),
  ('public', 'set_streak_rest_weekdays', '1005'),
  ('public', 'shape_doctor_set_skill_owner', '25 25 25 25'),
  ('public', 'share_resource_with_org', '25 2950 2950 25'),
  ('public', 'share_resource_with_user', '25 2950 2950 25'),
  ('public', 'soft_delete_file', '2950'),
  ('public', 'soft_delete_folder', '2950'),
  ('public', 'study_override_attempt', '2950 25 1700 3802 1700 1700 1184 1700 23 23 23 23 16'),
  ('public', 'study_record_attempt', '25 2950 2950 25 25 3802 1700 25 2950 2950 25 23 25 1700 1700 1184 1700 23 2950 1184'),
  ('public', 'tool_register_mcp_discovered', '2950 3802'),
  ('public', 'udt_delete_field', '2950 2950'),
  ('public', 'udt_set_field_format', '2950 2950 3802'),
  ('public', 'update_permission_level', '25 2950 2950 2950 25'),
  ('public', 'update_scope', '2950 25 25 3802 25 21'),
  ('public', 'update_user_table_row_ordering', '2950 16 3802 25'),
  ('public', 'wfx_duplicate_definition', '2950'),
  ('public', 'wfx_duplicate_version', '2950'),
  ('rag', 'fn_purge_library_document', '2950'),
  ('rag', 'fn_purge_library_file', '2950'),
  ('rag', 'fn_restore_library_document', '2950'),
  ('seo', '_pack_convert_rules_to_meaning', '2950'),
  ('seo', '_pack_touch', '2950'),
  ('seo', 'adopt_starter_pack', '2950 2950 1009 2951 16 3802 3802 2951 16'),
  ('seo', 'fn_evaluate_matchers_internal', '2950 2951 25'),
  ('seo', 'fn_list_site_research_instance_ids', '2950'),
  ('seo', 'gsc_delete_saved_view', '2950 2950'),
  ('seo', 'gsc_save_view', '2950 25 3802 2950 25 23 16'),
  ('seo', 'gsc_set_topic_value', '2950 2950 1700 25 25 25 16'),
  ('seo', 'gsc_value_combo_set', '2950 2951 25 1700 25 25 16 2950 16'),
  ('seo', 'platform_default_rule_delete', '2950'),
  ('seo', 'platform_default_rule_save', '25 25 25 25 1009 25 2950 1009 1700 25 23'),
  ('seo', 'set_site_offering_value', '2950 2950 2950 1700 25 25 25 16'),
  ('seo', 'stamp_keyword_places', '2951 25'),
  ('seo', 'starter_pack_from_proposal', '3802 2950 3802 2951'),
  ('seo', 'starter_pack_item_delete', '2950'),
  ('seo', 'starter_pack_item_save', '3802'),
  ('seo', 'starter_pack_new_version', '2950 25'),
  ('seo', 'starter_pack_save', '3802'),
  ('seo', 'starter_pack_set_status', '2950 25 25'),
  ('web', 'adopt_offering_template', '2950 2950 2950'),
  ('web', 'move_site_brand', '2950 2950'),
  ('web', 'save_site_offering', '2950 2950 2950 25 25 25 2950'),
  ('public', 'cmt_add', '25 2950 25 2950 2950'),
  ('public', 'cmt_delete', '2950'),
  ('public', 'cmt_edit', '2950 25'),
  ('public', 'ues_set', '25 2950 16 16 16'),
  ('public', 'ues_touch', '25 2950')
) as v(sch, fn, argtypes)
 where g.schema_name = v.sch and g.function_name = v.fn and g.argtypes = v.argtypes;

-- ─── 7. Postconditions — this file fails loudly rather than land half-done ─────
do $$
declare v_anon int; v_gf int; v_doors int; v_closed int;
begin
  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
     and n.nspname not in ('pg_catalog','information_schema','pgsodium')
     and p.provolatile = 'v'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  if v_anon <> 0 then
    raise exception 'dd169 batch 1: % writing definers are still anon-executable with no door row — the sweep did not land', v_anon;
  end if;

  select count(*) into v_doors from platform.client_callable_door where declared_by = 'DD-169 / B-63';
  if v_doors <> 151 then
    raise exception 'dd169 batch 1: expected 151 new door rows, found %', v_doors;
  end if;

  select count(*) into v_closed
    from (values
      ('esign._act_adopt(jsonb,text,text,text,uuid,jsonb)'),
      ('esign._act_consent(jsonb,uuid)'),
      ('esign._act_decline(jsonb,text)'),
      ('esign._act_delegate(jsonb,text,text,text)'),
      ('esign._act_download(jsonb,uuid)'),
      ('esign._act_load(jsonb)'),
      ('esign._act_preview_ack(jsonb,uuid)'),
      ('esign._act_sign(jsonb,jsonb,text)'),
      ('esign._ctx_internal(uuid,inet,text)'),
      ('esign._ctx_outsider(text,text,inet,text)'),
      ('esign._event(uuid,text,text,uuid,uuid,uuid,uuid,text,text,inet,text,text,jsonb,text)'),
      ('esign._maybe_complete(uuid)'),
      ('esign._notify(uuid,text,uuid,uuid,text,uuid,text,text,text,jsonb,text)'),
      ('esign._notify_actionable(uuid,text)'),
      ('esign._notify_actionable_capped(uuid,integer)'),
      ('esign._revoke_open_tokens(uuid,text)'),
      ('esign.config_set(uuid,text,jsonb,text)'),
      ('files.webhook_tick()'),
      ('iam._managed_invitation(uuid)'),
      ('iam._org_audit(uuid,uuid,text,jsonb)'),
      ('_edu_ensure_owner_membership(context.scopes)'),
      ('_library_assert_admin(uuid)'),
      ('_scope_system_resolve_type_id(uuid,jsonb,text)'),
      ('seo._pack_convert_rules_to_meaning(uuid)'),
      ('seo._pack_touch(uuid)'),
      ('seo.fn_evaluate_matchers_internal(uuid,uuid[],text)')
    ) as c(sig)
   where has_function_privilege('authenticated', c.sig::regprocedure, 'EXECUTE')
      or has_function_privilege('anon', c.sig::regprocedure, 'EXECUTE');
  if v_closed <> 0 then
    raise exception 'dd169 batch 1: % closed helpers still answer a client role', v_closed;
  end if;

  select count(*) into v_gf from platform.definer_client_grant_grandfather g
    join pg_namespace n on n.nspname = g.schema_name
    join pg_proc p on p.pronamespace = n.oid and p.proname = g.function_name
                  and p.proargtypes::text = g.argtypes
   where p.prosecdef and p.provolatile = 'v' and p.prokind = 'f'
     and p.prorettype <> 'trigger'::regtype
     and n.nspname <> 'pgsodium'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_gf <> 0 then
    raise exception 'dd169 batch 1: % grandfather rows still shield an anon-executable writing definer', v_gf;
  end if;

  raise notice 'dd169 batch 1: % declared anonymous doors, % signed-in doors, % closed helpers; 0 undeclared anon-executable writing definers outside pgsodium', 4, 147, 26;
end $$;
