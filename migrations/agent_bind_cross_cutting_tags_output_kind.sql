-- agent_bind_cross_cutting_tags_output_kind.sql
--
-- D162 (part 1 of 2). Bind the Cross-Cutting Tag Generator
-- (agent.definition 106fd261-..., slot `research.cross_cutting_tags`,
-- gemini-3.6-flash) to its DECLARED kind `research_cross_cutting_tags`.
--
-- Precedent + full reasoning: migrations/agent_bind_keyword_researcher_output_kind.sql.
--
-- WHY THIS WAS BROKEN
-- `matrx_ai.client_host.agent_source.definition_to_agent_config` lifts
-- `output_schema` into `config.response_format` ONLY when
-- `config.response_format is None`. This agent's `settings.response_format`
-- held {"type": "json_schema"} -- a BARE PLACEHOLDER with no schema -- so it
-- won, and the real `output_schema` was discarded. Google's
-- `_build_google_response_schema` then found no usable schema and downgraded
-- to prompt-only (Gemini has no json_object fallback). Measured live
-- 2026-08-11 BEFORE this migration: the run returned markdown-fenced JSON and
-- `parsed` was null -- nothing was enforced, while the DB showed the agent
-- bound. Dropping the settings key is what makes the binding take effect.
--
-- WHY THE DECLARED KIND, NOT THE SLOT'S output_kind
-- The stale `output_schema.name` was `suggested_tags_schema`, which disagrees
-- with the slot's declared `output_kind = research_cross_cutting_tags`. The
-- disagreement is NOMENCLATURE ONLY, not shape: the kind's
-- `emitted_json_schema` is generated from `research.agents.CrossCuttingTagOutput`,
-- the very type this agent declares as its `Output` (research/agents.py:411)
-- and the type the consumer parses (research/tag_generation.py:194 --
-- `isinstance(run_result.parsed, CrossCuttingTagOutput)`, falling back to
-- `extract_model(..., CrossCuttingTagOutput)`). Both shapes are
-- `{suggested_tags: [{name, keywords_spanned, confidence, reason}]}`, field
-- for field. So the canonical kind wins and the slot's `output_kind` is
-- CORRECT and left alone.
--
-- The bound value is exactly what `matrx_ai.kinds.response_format_for_kind(
-- 'research_cross_cutting_tags')` builds today: the kind's
-- `emitted_json_schema` through `matrx_ai.schema.lint.lint_output_schema(...)`
-- `.portable_schema` (additionalProperties:false + all-required on every
-- object node). No `__kind` in the bound schema -- Gemini ignores JSON Schema
-- `const`, invents a discriminator, and `useKindRequest.readKind` prefers the
-- model's value over the caller's expectedKind, so a wrong `__kind` routes to
-- no registered kind.
--
-- NO PROMPT REWRITE. The precedent rewrote the prompt because it taught a
-- shape the schema FORBIDS. This prompt's "Output Format" block teaches
-- exactly `{"suggested_tags": [{name, keywords_spanned, confidence, reason}]}`
-- with no `__kind` and no extra keys -- it agrees with the bound schema, so it
-- is left untouched. (Its "no markdown" instruction was being ignored under
-- prompt-only mode; a real binding is what enforces it.)
--
-- NOTE ($defs): the portable schema keeps `$defs`/`$ref` -- `_make_portable`
-- does not inline (the kinds.py docstring overstates), and the lint emits a
-- google WARNING that Gemini's restricted subset may not resolve them. Gemini
-- receives this via `response_json_schema` (standard JSON Schema, not the
-- OpenAPI subset), which does resolve `$ref`. Verified live after apply.

update agent.definition set
  settings = settings - 'response_format',
  output_schema = $mtx${"name": "research_cross_cutting_tags", "schema": {"type": "object", "$defs": {"SuggestedCrossCuttingTag": {"type": "object", "title": "SuggestedCrossCuttingTag", "required": ["name", "reason", "confidence", "keywords_spanned"], "properties": {"name": {"type": "string", "title": "Name"}, "reason": {"type": "string", "title": "Reason", "default": ""}, "confidence": {"type": "number", "title": "Confidence", "default": 0.0}, "keywords_spanned": {"type": "array", "items": {"type": "string"}, "title": "Keywords Spanned"}}, "additionalProperties": false}}, "title": "CrossCuttingTagOutput", "properties": {"suggested_tags": {"type": "array", "items": {"$ref": "#/$defs/SuggestedCrossCuttingTag"}, "title": "Suggested Tags"}}, "additionalProperties": false, "required": ["suggested_tags"]}, "strict": true}$mtx$::jsonb,
  updated_at = now()
where id = '106fd261-1b5c-4b13-9522-cc121a1f5ef3'
  and deleted_at is null;
