-- Applied via Supabase MCP 2026-08-12 (tool_definition_bundle_system_variant_rls).
-- Pre-canonical cfg_* policies -> canonical 'system' variant (platform-catalog class, same as ai).
update platform.entity_types set rls_variant='system' where token in ('tool','tool_bundle') and coalesce(rls_variant,'') <> 'system';
select iam.apply_rls('tool','definition','tool','system');
select iam.apply_rls('tool','bundle','tool_bundle','system');
