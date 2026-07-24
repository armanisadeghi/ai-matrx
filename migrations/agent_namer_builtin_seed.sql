-- Builtin "Agent Namer" — given a JSON dump of agent configs, returns a strict
-- JSON array of {id, name, description} used to backfill member agents in an
-- agent set that are missing a name and/or description. Mirrors the "Agent
-- Description Generator" builtin's org/visibility/model so it is equally
-- reachable via agx_get_execution_full. Idempotent: re-running refreshes the def.
insert into agent.definition (
  id, agent_type, name, description, messages, variable_definitions,
  model_id, settings, output_schema, organization_id, visibility, card_visibility,
  is_public, is_active, category, tags
) values (
  'a3e9d1c4-7b62-4f08-9c5a-2d6e8f0b1a37',
  'builtin',
  'Agent Namer',
  'Reads one or more agent configurations and produces a concise human name and a one-line description for each — used to backfill member agents that are missing a name or description.',
  $messages$[
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You name and describe AI agents. You are given one or more agent configurations — each with an `id`, its current `name`/`description` (which may be empty), its system prompt (`messages`), `variable_definitions`, and `output_schema`. For EACH agent, produce:\n\n- **name**: a concise, human-readable name in Title Case, 2–5 words, no surrounding quotes, no trailing punctuation. It should read like a product feature a person would recognize (e.g. \"Flashcard Set Generator\", \"Meeting Notes Summarizer\"). Never generic (\"AI Agent\", \"Assistant\", \"Helper\").\n- **description**: ONE sentence, at most 160 characters, stating precisely what the agent does and, when it helps distinguish it, its key input or output. Active voice, concrete, no filler or preamble.\n\nInfer the agent's function primarily from its system prompt and output schema. If the configuration is thin, describe what it does from the strongest available evidence — never write placeholder text and never invent capabilities not in the configuration.\n\nPreserve each agent's exact `id`. Do not alter, guess, or omit ids.\n\n# Output format\nOutput ONLY a JSON array — no prose, no markdown, no code fences, nothing before or after it. Each element is an object with exactly these keys:\n\n[{\"id\": \"<exact id>\", \"name\": \"<name>\", \"description\": \"<description>\"}]\n\nEmit one element per agent, in the order provided."
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Name and describe the following agent configuration(s). Return only the JSON array.\n\n```\n{{agent_config}}\n```"
        }
      ]
    }
  ]$messages$::jsonb,
  $vardefs$[
    {
      "name": "agent_config",
      "helpText": "JSON dump of the agent configuration(s) to name — id, name, description, system prompt, variables, output schema.",
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
        "name": {"type": "string"},
        "description": {"type": "string"}
      },
      "required": ["id", "name", "description"],
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
