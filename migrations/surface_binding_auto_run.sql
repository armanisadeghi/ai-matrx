-- surface_binding payload v3 + agent.menu_surface `auto_run` column.
-- APPLIED LIVE 2026-08-29 via Supabase MCP (project brsgrqvjdzwihsvnfqkf).
-- migrate: skip: applied live via MCP; a re-run would stamp the whole schema
-- row and could revert a future payload-schema v4 back to v3.
--
-- THE AUTO-RUN INVERSION (THE-MODEL law 7): "a referenced, fully-mapped
-- binding runs with no user input; prompting is the flexibility option."
-- Shortcuts have carried `auto_run` since day one (193/207 use it); surface
-- bindings carried nothing, so EVERY bound agent stopped at the input panel
-- even when the binding already supplied every variable. `auto_run` is the
-- binding's own answer to "does the UI stop before the request goes out?" —
-- the same single question `agent.shortcut.auto_run` answers, on the same
-- Step-5 skip inside launchAgentExecution.
--
-- Default false: absent on every existing payload, and the view COALESCEs to
-- false, so no existing binding changes behavior.
--
-- The client also refuses to honor a stored `true` when the launch's required
-- agent variables did not all resolve (see surface-scope-mapping.ts
-- `unresolvedRequiredVariables`) — a mapping gap still stops at the panel and
-- asks for exactly the gap. The stored flag is intent, never a bypass.

update platform.edge_payload_kind
set version = 3,
    json_schema = '{
      "type": "object",
      "required": ["value_mappings"],
      "properties": {
        "value_mappings": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "required": ["mapType"],
            "properties": {
              "prompt": {"type": "string"},
              "target": {"type": "string"},
              "mapType": {"enum": ["surface_value", "direct_value", "prompt_user", "unmapped"]},
              "required": {"type": "boolean"},
              "defaultValue": {"type": "string"}
            },
            "additionalProperties": false
          }
        },
        "write_policies": {
          "type": "object",
          "additionalProperties": {"enum": ["manual", "ask", "auto"]}
        },
        "auto_run": {"type": "boolean"}
      },
      "additionalProperties": false
    }'::jsonb
where kind = 'surface_binding';

-- agent.menu_surface: `auto_run` appended as the LAST column (CREATE OR
-- REPLACE VIEW requires every existing column to keep its position and type).
-- The full view body was applied live in the Supabase migration
-- `surface_binding_auto_run`; the appended projection is:
--
--   COALESCE((a.payload ->> 'auto_run')::boolean, false) AS auto_run
--
-- Reproducing the other 60 lines of view SQL here would invite drift against
-- the live definition, which is the source of truth (same reasoning as
-- surface_binding_write_policies.sql).
