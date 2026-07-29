-- surface_binding payload v2 + agent.menu_surface write_policies column.
-- APPLIED LIVE 2026-07-29 via Supabase MCP (project txzxabzwovsujtloxrus).
--
-- Bindings (and shortcuts — the same system, one opinionated layer stronger)
-- may override a surface write target's applyPolicy per target. The SURFACE
-- declares the default (ui.ui_surface_write_target.apply_policy); the BINDING
-- is where the user controls it. A binding may tighten (auto→ask→manual) but
-- can never open a target the surface declared manual — enforced client-side
-- in surface-writeback.ts resolveApplyPolicy.

update platform.edge_payload_kind
set version = 2,
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
        }
      },
      "additionalProperties": false
    }'::jsonb
where kind = 'surface_binding';

-- agent.menu_surface: `write_policies` appended as the LAST column (CREATE OR
-- REPLACE VIEW requires existing columns unchanged). Full definition applied
-- live; see the Supabase migration `menu_surface_write_policies` for the
-- verbatim view body — reproducing 60 lines of view SQL here would invite
-- drift against the live definition, which is the source of truth.
-- migrate: skip: applied live via MCP; the view body lives in the DB.
