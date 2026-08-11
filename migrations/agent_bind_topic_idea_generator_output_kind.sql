-- agent_bind_topic_idea_generator_output_kind.sql
--
-- Bind the Topic Idea Generator (agent.definition 2edcbd85-…) to the
-- `topic_ideas` kind so the schema reaches the provider instead of relying on
-- a JSON example pasted in the system prompt.
--
-- `agent.definition.output_schema` is the ONE channel that reaches this agent:
-- matrx-ai `client_host/agent_source.definition_to_agent_config` lifts it
-- verbatim into `config.response_format = {type: json_schema, json_schema: …}`,
-- and the Google translator turns that into `response_mime_type` +
-- `response_json_schema`.
--
-- WHY THE PLAIN `emitted_json_schema` AND NOT THE `__kind`-INJECTED BLOCK
-- EXPORT (what the FE binder's `buildKindOutputSchema` writes): verified live
-- against gemini-3.6-flash on 2026-08-11 — Gemini does NOT honour JSON Schema
-- `const`. Three grounded runs bound to the block export returned invented
-- discriminators (`podcast_topic_list`, `PodcastTopicIdeas`,
-- `podcast_ideas_response`) instead of `topic_ideas`. A WRONG `__kind` is worse
-- than none: `useKindRequest.readKind` prefers the model's value over the
-- caller's `expectedKind`, so the payload would route to no registered kind and
-- render through the generic viewer. Without `__kind` in the schema the model
-- emits none and the dialog stamps `expectedKind="topic_ideas"` — correct
-- routing, guaranteed. This also matches the server-side binder
-- (`matrx_ai.kinds.response_format_for_kind`), which builds from
-- `emitted_json_schema`.
--
-- Also verified live: grounding (googleSearch + url_context, both ON for this
-- agent) and `response_json_schema` are compatible on gemini-3.6-flash — the
-- combination returns schema-shaped JSON, no 400.

update agent.definition set
  output_schema = $mtx${"name": "topic_ideas", "strict": true, "schema": {"type": "object", "properties": {"concept_summary": {"type": "string", "description": "A one-sentence summary of the user's core concept and the angle explored"}, "search_insights": {"type": "string", "description": "2-4 sentences summarizing the most interesting and relevant findings from web searches"}, "ideas": {"type": "array", "items": {"$ref": "#/$defs/topic_idea"}, "description": "The individual topic ideas"}}, "required": ["concept_summary", "search_insights", "ideas"], "additionalProperties": false, "$defs": {"topic_idea": {"type": "object", "properties": {"title": {"type": "string", "description": "A compelling, specific topic title written as if it were the episode or article headline"}, "hook": {"type": "string", "description": "1-2 sentences explaining the core angle and why it's interesting or timely"}, "why_now": {"type": "string", "description": "What recent event, trend, or data point makes this especially relevant right now"}, "key_points": {"type": "array", "items": {"type": "string"}, "description": "Key points or talking points"}, "format_notes": {"type": "string", "description": "A brief note on why this idea works well for the selected format and any structural suggestions"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "Topical tags"}}, "required": ["title", "hook", "why_now", "key_points", "format_notes", "tags"], "additionalProperties": false}}}}$mtx$::jsonb,
  updated_at = now()
where id = '2edcbd85-91e0-4f0a-9890-1e7d262e2c62'
  and deleted_at is null;

-- The slot the client resolves (`podcast_client.topic_ideas`) declares the kind
-- too, so the slot bench can give a structural verdict on any agent a user
-- binds in place of the default. Mirrors `declare_slot(..., output_kind=…)` in
-- aidream `aidream/services/agent_slots/client_slots.py`.
update agent.slot_definition set
  output_kind = 'topic_ideas',
  updated_at = now()
where slot_key = 'podcast_client.topic_ideas'
  and deleted_at is null;
