-- target: branch
--
-- W1-PROV — the 20 FUNCTION EXECUTE GRANTS production gives and the rehearsal branch did not.
--
-- FOUND BY A PROOF GOING RED, NOT BY A SWEEP. `branch-api.ts --expose custom --prove
-- custom.record --as-test-user` returned HTTP 403 `42501 permission denied for function
-- accessible_entity_ids`: the canonical `std_select` policy on every entity table calls
-- `iam.accessible_entity_ids`, production grants `authenticated` EXECUTE on both overloads,
-- and the branch granted neither. `W1-STORE` reported the same thing at 10:10 UTC and named
-- it as something that "will hit every later lane whose browser proof goes through a
-- canonical RLS policy". It did.
--
-- 🚨 THIS IS RULE 36 WEARING THE PRIVILEGE SIGN. `W0-SYNC` levelled the branch's OBJECTS with
-- production. Privileges are not objects, and `W0-DATA`'s graph copy does not carry them, so
-- the branch's EXECUTE surface drifted in BOTH directions. Measured 2026-09-17 over
-- `iam`, `platform`, `files`, `public` and `history` — 1,778 functions on production, 1,832
-- on the branch, 149 of the shared ones with different grants:
--
--     20  UNDER-GRANTS — production grants, the branch does not. THIS FILE. Every one is
--         generated from production's own catalogue below, and levelling in this direction
--         can never make the branch more permissive than production.
--    195  OVER-GRANTS — the branch grants, production does not; `anon` holds EXECUTE on
--         `iam.apply_rls`, `iam.apply_reference_rls`, `platform.close_new_functions_to_anon`
--         and 192 more. THIS FILE DOES NOT TOUCH THEM, and they are the dangerous half for
--         the access rehearsal: they make the branch look MORE permissive than production,
--         which is how an access diff comes back clean on a database nobody is measuring.
--         Left to the lane that owns `LOCK:iam`'s grant surface and named in this lane's
--         report; a REVOKE on the branch could take another lane's in-flight proof with it,
--         and that is a decision, not a levelling.
--
-- THE COMMAND, so neither number has to be believed (it is the census, run against both):
--
--   select n.nspname||'|'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||
--          case when has_function_privilege('authenticated',p.oid,'EXECUTE') then 'auth' else '-' end||','||
--          case when has_function_privilege('anon',p.oid,'EXECUTE') then 'anon' else '-' end||','||
--          case when has_function_privilege('service_role',p.oid,'EXECUTE') then 'svc' else '-' end
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname in ('iam','platform','files','public','history') and p.prokind = 'f'
--    order by 1;
--
-- BRANCH ONLY: production already holds every grant below, which is where they came from.
-- THE INVERSE: `migrations/inverse/w1_prov_branch_function_grant_levelling_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). Every grant in this file was READ '
      'from here; re-issuing them would be a no-op at best and a privilege change at worst.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

grant execute on function files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level) to authenticated;
grant execute on function iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer) to authenticated;
grant execute on function iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean) to authenticated;
grant execute on function iam.entity_read_kernel_expected() to anon;
grant execute on function iam.entity_read_kernel_fingerprint() to anon;
grant execute on function iam.has_access(p_type text, p_id uuid, p_required permission_level) to authenticated;
grant execute on function iam.has_access(p_type text, p_id uuid, p_required permission_level) to anon;
grant execute on function iam.is_discoverable(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) to authenticated;
grant execute on function iam.record_transfer_refusal(p_refusal jsonb) to service_role;
grant execute on function public.admin_promote(target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb) to authenticated;
grant execute on function public.admin_update(target_user_id uuid, target_level admin_level, target_permissions jsonb, target_metadata jsonb) to authenticated;
grant execute on function public.admin_upsert_relationship_rule(p_source_type text, p_target_type text, p_container_side text, p_conveys_max permission_level, p_is_active boolean, p_label text, p_notes text) to authenticated;
grant execute on function public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb) to authenticated;
grant execute on function public.has_access_as(p_user uuid, p_type text, p_id uuid, p_required permission_level) to authenticated;
grant execute on function public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level) to authenticated;
grant execute on function public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level) to anon;
grant execute on function public.provision_mcp_server(p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_organization_id uuid, p_endpoint_url text, p_description text, p_icon_url text, p_color text, p_docs_url text, p_website_url text, p_status mcp_server_status, p_is_official boolean, p_oauth_scopes text[]) to authenticated;
grant execute on function public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text) to authenticated;
grant execute on function public.update_context_item(p_item_id uuid, p_display_name text, p_description text, p_category text, p_value_type context_value_type, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_sort_order smallint, p_status context_item_status, p_status_note text) to authenticated;
grant execute on function public.upsert_mcp_connection(p_server_id uuid, p_config_id uuid, p_transport mcp_transport, p_endpoint_override text) to authenticated;

