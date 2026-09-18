-- chair-step: writing production's OIDs back into the branch's door register re-breaks every client EXECUTE grant the guard checks; never additive, never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_door_argtypes_repair.sql` (§4.13).
--
-- It restores the state the repair found: the 29 door rows whose signature names a custom
-- type carry PRODUCTION's OID for that type, so `enforce_definer_client_grants` cannot match
-- them and revokes the client EXECUTE inside the GRANT that issues it. Read back with the
-- census in the up-migration's header; `branch-api.ts … --as-test-user` returns to HTTP 403.
--
-- The values are production's, read SELECT-only 2026-09-17, keyed by
-- (schema_name, function_name, identity_args) — the key that IS portable across databases.

set lock_timeout = '5s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %).',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

update platform.client_callable_door set identity_argtypes = '{2950,25,1698328,20,25,25,1184}'::oid[] where schema_name = 'billing' and function_name = 'addon_grant' and identity_args = 'p_org uuid, p_capability text, p_period billing.meter_period, p_limit bigint, p_source text, p_note text, p_expires_at timestamp with time zone';
update platform.client_callable_door set identity_argtypes = '{2950,1698360,25,25,1184}'::oid[] where schema_name = 'billing' and function_name = 'org_plan_set' and identity_args = 'p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamp with time zone';
update platform.client_callable_door set identity_argtypes = '{25,25,1698328,20}'::oid[] where schema_name = 'billing' and function_name = 'plan_limit_set' and identity_args = 'p_plan_id text, p_capability text, p_period billing.meter_period, p_limit_value bigint';
update platform.client_callable_door set identity_argtypes = '{2950,2950,1699632}'::oid[] where schema_name = 'files' and function_name = 'has_access_for' and identity_args = 'p_user_id uuid, p_file_id uuid, p_required permission_level';
update platform.client_callable_door set identity_argtypes = '{25,1699632,23}'::oid[] where schema_name = 'iam' and function_name = 'accessible_entity_ids' and identity_args = 'p_type text, p_required permission_level, p_depth integer';
update platform.client_callable_door set identity_argtypes = '{25,1699632,23,16}'::oid[] where schema_name = 'iam' and function_name = 'accessible_entity_ids' and identity_args = 'p_type text, p_required permission_level, p_depth integer, p_include_public boolean';
update platform.client_callable_door set identity_argtypes = '{25,2950,1699632}'::oid[] where schema_name = 'iam' and function_name = 'has_access' and identity_args = 'p_type text, p_id uuid, p_required permission_level';
update platform.client_callable_door set identity_argtypes = '{2950,25,2950,1699632}'::oid[] where schema_name = 'iam' and function_name = 'is_discoverable' and identity_args = 'p_user_id uuid, p_type text, p_id uuid, p_required permission_level';
update platform.client_callable_door set identity_argtypes = '{2950,1698398,3802,3802}'::oid[] where schema_name = 'public' and function_name = 'admin_promote' and identity_args = 'target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb';
update platform.client_callable_door set identity_argtypes = '{2950,1698398,3802,3802}'::oid[] where schema_name = 'public' and function_name = 'admin_update' and identity_args = 'target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb';
update platform.client_callable_door set identity_argtypes = '{25,25,25,1699632,16,25,25}'::oid[] where schema_name = 'public' and function_name = 'admin_upsert_relationship_rule' and identity_args = 'p_source_type text, p_target_type text, p_container_side text, p_conveys_max permission_level, p_is_active boolean, p_label text, p_notes text';
update platform.client_callable_door set identity_argtypes = '{2950,25,25,1698626,25,25,1698558,1698602,1009,25,21,1009,23,2951,3802}'::oid[] where schema_name = 'public' and function_name = 'create_context_item' and identity_args = 'p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb';
update platform.client_callable_door set identity_argtypes = '{2950,25,2950,1699632}'::oid[] where schema_name = 'public' and function_name = 'has_access_as' and identity_args = 'p_user uuid, p_type text, p_id uuid, p_required permission_level';
update platform.client_callable_door set identity_argtypes = '{25,2950,1699632}'::oid[] where schema_name = 'public' and function_name = 'has_permission' and identity_args = 'p_resource_type text, p_resource_id uuid, p_required_permission permission_level';
update platform.client_callable_door set identity_argtypes = '{25,25,25,1699522,1699562,1699498,25,25,25,25,25,25,1699550,16,1009}'::oid[] where schema_name = 'public' and function_name = 'provision_mcp_server' and identity_args = 'p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_endpoint_url text, p_description text, p_icon_url text, p_color text, p_docs_url text, p_website_url text, p_status mcp_server_status, p_is_official boolean, p_oauth_scopes text[]';
update platform.client_callable_door set identity_argtypes = '{25,25,25,1699522,1699562,1699498,2950,25,25,25,25,25,25,1699550,16,1009}'::oid[] where schema_name = 'public' and function_name = 'provision_mcp_server' and identity_args = 'p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_organization_id uuid, p_endpoint_url text, p_description text, p_icon_url text, p_color text, p_docs_url text, p_website_url text, p_status mcp_server_status, p_is_official boolean, p_oauth_scopes text[]';
update platform.client_callable_door set identity_argtypes = '{2950,2950,1698974,25}'::oid[] where schema_name = 'public' and function_name = 'udt_change_field_type' and identity_args = 'p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text';
update platform.client_callable_door set identity_argtypes = '{2950,25,25,25,1698626,1698558,1698602,1009,21,1698570,25}'::oid[] where schema_name = 'public' and function_name = 'update_context_item' and identity_args = 'p_item_id uuid, p_display_name text, p_description text, p_category text, p_value_type context_value_type, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_sort_order smallint, p_status context_item_status, p_status_note text';
update platform.client_callable_door set identity_argtypes = '{2950,2950,1699562,25}'::oid[] where schema_name = 'public' and function_name = 'upsert_mcp_connection' and identity_args = 'p_server_id uuid, p_config_id uuid, p_transport mcp_transport, p_endpoint_override text';
update platform.client_callable_door set identity_argtypes = '{2950,25,25,25,3802,3802,1698388,2950}'::oid[] where schema_name = 'web' and function_name = 'create_site' and identity_args = 'p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb, p_integrations jsonb, p_visibility visibility, p_brand_id uuid';

