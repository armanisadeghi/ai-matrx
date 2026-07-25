-- Builtin "Agent Set Role Describer" (reuses the UUID first seeded as the
-- short-lived "Agent Namer"). "Sync agent listings" runs it ONCE per click over
-- a whole set: given each member's config AND its current set role
-- (current_role_title / current_gap), it returns a correct {id, role_title, gap}
-- for EVERY member — filling blanks, fixing wrong ones, confirming good ones.
-- The result is written to the member EDGES and drives the <available_agents>
-- listing. Mirrors the other agent-sets builtin's org/visibility/model so it is
-- equally reachable via agx_get_execution_full. Idempotent.
insert into agent.definition (
  id, agent_type, name, description, messages, variable_definitions,
  model_id, settings, output_schema, organization_id, visibility, card_visibility,
  is_public, is_active, category, tags
) values (
  'a3e9d1c4-7b62-4f08-9c5a-2d6e8f0b1a37',
  'builtin',
  'Agent Set Role Describer',
  'Reads every member of an agent set — its config and its current role/gap — and returns a correct Role title and one-line gap for each, so an orchestrator''s available-agents listing stays accurate.',
  $messages$[
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You define the role each specialist agent plays inside an orchestrator's set. You are given a JSON array of members. Each member has:\n\n- `id` — the member's exact id (preserve it exactly).\n- `agent_name`, `agent_description` — the agent's own identity (may be blank).\n- `system_prompt` — the agent's instructions; the STRONGEST signal for what it actually does.\n- `inputs` — its declared input variable names.\n- `output` — its output shape (\"Text\" or a JSON key summary).\n- `current_role_title`, `current_gap` — what this member is CURRENTLY labeled as inside the set (may be blank, or may be wrong/outdated).\n\nFor EVERY member, produce:\n\n- **role_title**: a concise 2–4 word Title-Case label for the function it serves in the set (e.g. \"Keyword Strategist\", \"Fact Checker\", \"Deep Web Researcher\"). Not a full sentence, no trailing punctuation, never generic (\"Agent\", \"Helper\", \"Specialist\").\n- **gap**: ONE or two sentences (max ~200 characters) stating what this member contributes to the set and when the orchestrator should call it — grounded in its actual system prompt, inputs, and output.\n\n# How to treat the current values\n- If `current_role_title` / `current_gap` are present AND accurately describe what the agent's config shows it does, KEEP them (return them essentially unchanged — confirm, don't churn).\n- If they are blank, write correct ones.\n- If they are present but wrong, outdated, or vague for what the config actually shows, replace them with accurate ones.\n\nBase every decision on the member's actual configuration — never invent capabilities the config doesn't support, and never leave a field blank or use placeholder text.\n\n# Output format\nOutput ONLY a JSON array — no prose, no markdown, no code fences, nothing before or after it. One object per member, in the SAME order given, each with exactly these keys:\n\n[{\"id\": \"<exact id>\", \"role_title\": \"<role title>\", \"gap\": \"<gap sentence>\"}]"
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Define the Role title and gap for each member of this set. Return only the JSON array.\n\n```\n{{agent_config}}\n```"
        }
      ]
    }
  ]$messages$::jsonb,
  $vardefs$[
    {
      "name": "agent_config",
      "helpText": "JSON array of set members — each with id, config (name, description, system prompt, inputs, output) and current role_title/gap.",
      "required": false,
      "defaultValue": ""
    }
  ]$vardefs$::jsonb,
  '114d67fd-b233-4498-ab01-7dfcf6f86bb2',
  $settings${"stream": true, "model_id": "114d67fd-b233-4498-ab01-7dfcf6f86bb2", "reasoning_effort": "low", "reasoning_summary": "auto", "internal_web_search": false}$settings$::jsonb,
  $schema${
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "role_title": {"type": "string"},
        "gap": {"type": "string"}
      },
      "required": ["id", "role_title", "gap"],
      "additionalProperties": false
    }
  }$schema$::json,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'internal',
  'internal',
  true,
  true,
  null,
  '{}'::text[]
)
on conflict (id) do update set
  agent_type = excluded.agent_type,
  name = excluded.name,
  description = excluded.description,
  messages = excluded.messages,
  variable_definitions = excluded.variable_definitions,
  model_id = excluded.model_id,
  settings = excluded.settings,
  output_schema = excluded.output_schema,
  organization_id = excluded.organization_id,
  visibility = excluded.visibility,
  card_visibility = excluded.card_visibility,
  is_public = excluded.is_public,
  is_active = excluded.is_active,
  updated_at = now();
