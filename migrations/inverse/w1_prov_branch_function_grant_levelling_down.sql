-- chair-step: revoking EXECUTE on the access kernel's own functions takes every canonical RLS policy down with it; never additive, never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_function_grant_levelling.sql` (§4.13).
-- It refuses on production, where these grants are the originals rather than a copy, and it
-- restores the branch to the state the proof found: `authenticated` without EXECUTE on
-- `iam.accessible_entity_ids`, so `branch-api.ts … --as-test-user` goes back to HTTP 403
-- `42501 permission denied for function accessible_entity_ids`.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These grants are production''s own.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

revoke execute on function files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level) from authenticated;
revoke execute on function iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer) from authenticated;
revoke execute on function iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean) from authenticated;
revoke execute on function iam.entity_read_kernel_expected() from anon;
revoke execute on function iam.entity_read_kernel_fingerprint() from anon;
revoke execute on function iam.has_access(p_type text, p_id uuid, p_required permission_level) from authenticated;
revoke execute on function iam.has_access(p_type text, p_id uuid, p_required permission_level) from anon;
revoke execute on function iam.is_discoverable(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) from authenticated;
revoke execute on function iam.record_transfer_refusal(p_refusal jsonb) from service_role;
revoke execute on function public.admin_promote(target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb) from authenticated;
revoke execute on function public.admin_update(target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb) from authenticated;
revoke execute on function public.admin_upsert_relationship_rule(p_source_type text, p_target_type text, p_container_side text, p_conveys_max permission_level, p_is_active boolean, p_label text, p_notes text) from authenticated;
revoke execute on function public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb) from authenticated;
revoke execute on function public.has_access_as(p_user uuid, p_type text, p_id uuid, p_required permission_level) from authenticated;
revoke execute on function public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level) from authenticated;
revoke execute on function public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level) from anon;
revoke execute on function public.provision_mcp_server(p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_organization_id uuid, p_endpoint_url text, p_description text, p_icon_url text, p_color text, p_docs_url text, p_website_url text, p_status mcp_server_status, p_is_official boolean, p_oauth_scopes text[]) from authenticated;
revoke execute on function public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text) from authenticated;
revoke execute on function public.update_context_item(p_item_id uuid, p_display_name text, p_description text, p_category text, p_value_type context_value_type, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_sort_order smallint, p_status context_item_status, p_status_note text) from authenticated;
revoke execute on function public.upsert_mcp_connection(p_server_id uuid, p_config_id uuid, p_transport mcp_transport, p_endpoint_override text) from authenticated;
