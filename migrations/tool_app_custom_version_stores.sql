-- Applied via Supabase MCP 2026-08-12 (tool_app_custom_version_stores).
update platform.entity_types set version_store='custom', version_store_ref='tool.definition_version'::regclass where token='tool';
update platform.entity_types set version_store='custom', version_store_ref='app.definition_version'::regclass where token='app';
