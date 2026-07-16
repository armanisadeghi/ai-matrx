-- agent_tool_config_strip_assignment_key
--
-- THE PROBLEM: Builder saves tools to the authoritative `agent.definition.tools`
-- uuid[] column (and `custom_tools` jsonb). A stale `tool_config.tools` key —
-- often `[]` — was preferred on FE read and made saves look like they never
-- stuck. Aidream's executor already reads ONLY the tools column; tool_config
-- never assigns tools (`auto_tools_disabled` / `excluded_tools` only).
--
-- THE FIX: drop the dead assignment key from tool_config on definition,
-- definition_version, and template. Idempotent (`- 'tools'` is a no-op when
-- absent). Does NOT touch tools / custom_tools columns.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

UPDATE agent.definition
SET tool_config = tool_config - 'tools'
WHERE tool_config ? 'tools';

UPDATE agent.definition_version
SET tool_config = tool_config - 'tools'
WHERE tool_config ? 'tools';

UPDATE agent.template
SET tool_config = tool_config - 'tools'
WHERE tool_config ? 'tools';
