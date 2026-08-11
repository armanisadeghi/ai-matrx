-- agent_bind_auto_tagger_output_kind.sql
--
-- Bind the Auto-Tagger Agent (agent.definition dee57c6c-…, slot
-- `research.auto_tagger`, gemini-3.6-flash) to the `research_tag_suggestions`
-- kind so the schema reaches the provider instead of living only in the
-- system prompt's "# Output Format" block.
--
-- Precedent + reasoning: migrations/agent_bind_topic_idea_generator_output_kind.sql.
-- `agent.definition.output_schema` is the ONE channel that reaches the model —
-- matrx-ai `client_host/agent_source.definition_to_agent_config` lifts it
-- verbatim into `config.response_format = {type: json_schema, json_schema: …}`.
-- The slot funnel (`aidream/services/agent_slots/service.py`) only VALIDATES
-- against `slot_definition.output_kind` after the fact; it never binds.
--
-- The value written here is byte-for-byte what the server-side binder
-- `matrx_ai.kinds.response_format_for_kind('research_tag_suggestions')` would
-- build: the kind's `emitted_json_schema` run through
-- `matrx_ai.schema.lint.lint_output_schema(...).portable_schema`
-- (additionalProperties:false + all-required on every object node). Binding the
-- raw emitted schema instead would fail Anthropic/OpenAI strict validation if
-- this slot is ever repinned to a non-Google agent.
--
-- NO `__kind` IN THE SCHEMA — same finding as the topic_ideas precedent:
-- Gemini ignores JSON Schema `const`, invents a discriminator, and
-- `useKindRequest.readKind` prefers the model's value over the caller's
-- expectedKind, so a wrong `__kind` routes to no registered kind. The
-- consumer (`research/tagging.py` → `AutoTaggerOutput`) needs pure data only.
--
-- The kind's `emitted_json_schema` was verified identical to
-- `research.agents.AutoTaggerOutput.model_json_schema()` (authoring_owner
-- 'python') before binding — no contract was invented here. The agent's
-- existing prompt already teaches exactly {name, confidence, reason}, so the
-- schema confirms the prompt rather than contradicting it.

update agent.definition set
  output_schema = $mtx${"name": "research_tag_suggestions", "strict": true, "schema": {"type": "object", "$defs": {"SuggestedTag": {"type": "object", "title": "SuggestedTag", "required": ["name", "reason", "confidence"], "properties": {"name": {"type": "string", "title": "Name"}, "reason": {"type": "string", "title": "Reason", "default": ""}, "confidence": {"type": "number", "title": "Confidence", "default": 0.0}}, "additionalProperties": false}}, "title": "AutoTaggerOutput", "properties": {"suggested_tags": {"type": "array", "items": {"$ref": "#/$defs/SuggestedTag"}, "title": "Suggested Tags"}}, "additionalProperties": false, "required": ["suggested_tags"]}}$mtx$::jsonb,
  updated_at = now()
where id = 'dee57c6c-bd06-45ee-9a9d-c9d9b4f2cfe5'
  and deleted_at is null;
