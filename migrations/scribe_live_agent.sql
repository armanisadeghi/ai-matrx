-- scribe_live_agent.sql
--
-- Built-in realtime voice agent for the Transcription Scribe LIVE tab
-- (matrx-user/transcript-scribe-live). Phase 2 of the realtime tool bridge:
-- a voice agent that listens to the live conversation (the transcripts arrive
-- as context via scope/context injection) and edits the session's working
-- document in real time through CLIENT-executed tools.
--
-- Tools:
--   • Two INLINE custom tools (always client-delegated) that the frontend's
--     shared realtime client-tool registry executes against the live
--     studio_documents working-document row:
--       - scribe_working_doc_append          (append a paragraph / note)
--       - scribe_working_doc_append_heading  (append a Markdown heading + body)
--     Names MUST match features/transcript-studio/components/scribe/
--     realtimeWorkingDocTools.ts exactly.
--   • data + data_action (server tools) are AUTO-INJECTED by apply_unified_tools
--     for any authenticated user, so the agent can also read/update the user's
--     notes and tasks (RLS-enforced, acting_as_user) — no per-table tool needed.
--
-- Model: realtime-api (xAI Realtime Voice) — interaction='realtime', so the
-- capability funnel grants it function calling + web search (data-driven).
--
-- Idempotent: ON CONFLICT (id) DO UPDATE keeps the row's tools/instructions
-- fresh on re-apply.
--
-- Reversibility:
--   DELETE FROM public.agx_agent WHERE id = '00000000-0000-4000-8000-000000000002';

INSERT INTO public.agx_agent (
  id, name, description, agent_type, is_active, is_archived, is_public, is_favorite,
  model_id, settings, messages, tools, mcp_servers, tags, category,
  context_slots, variable_definitions, output_schema, model_tiers,
  skill_config, custom_tools, tool_config,
  rag_awareness_mode, default_rag_boost,
  user_id, organization_id, project_id, task_id,
  source_agent_id, version
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  'Scribe Live Assistant',
  'Built-in realtime voice agent for the Transcription Scribe Live tab. Listens to the live conversation (transcripts arrive as context) and edits the working document in real time via client-executed tools. Also reads/updates the user''s notes and tasks via the generic data tools.',
  'builtin',
  true, false, true, false,
  '218ac819-f530-4c7e-9dcd-3265c9e4fdb0',
  '{"voice_id":"ara"}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'role', 'system',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text',
          'You are the Scribe Live Assistant. You listen to a live conversation — its transcript is provided to you as context — and you help the user capture and organize a working document in real time. When the user asks you to add, append, or structure content, use your working-document tools to write it (append text, or append a heading with an optional body). Keep edits concise and faithful to what was said. You can also create or update the user''s notes and tasks when asked. Confirm briefly what you changed. Never invent content the user did not intend.'
        )
      )
    )
  ),
  ARRAY[]::uuid[],
  ARRAY[]::uuid[],
  ARRAY[]::text[],
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  NULL, NULL,
  '{}'::jsonb,
  -- custom_tools — inline, client-delegated working-document mutators. Shape =
  -- matrx_ai CustomTool: {name, description, input_schema:{type,properties,required}}.
  jsonb_build_array(
    jsonb_build_object(
      'name', 'scribe_working_doc_append',
      'description', 'Append a paragraph or note to the end of the live working document.',
      'input_schema', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'text', jsonb_build_object('type', 'string', 'description', 'The text to append to the working document.')
        ),
        'required', jsonb_build_array('text')
      )
    ),
    jsonb_build_object(
      'name', 'scribe_working_doc_append_heading',
      'description', 'Append a Markdown heading (and optional body) to the end of the live working document.',
      'input_schema', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'heading', jsonb_build_object('type', 'string', 'description', 'The heading text.'),
          'level', jsonb_build_object('type', 'integer', 'description', 'Heading level 1-6 (default 2).'),
          'body', jsonb_build_object('type', 'string', 'description', 'Optional body text under the heading.')
        ),
        'required', jsonb_build_array('heading')
      )
    )
  ),
  '{"tools":[],"excluded_tools":[],"auto_tools_disabled":false}'::jsonb,
  'none', 0,
  NULL, NULL, NULL, NULL,
  NULL, 1
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      model_id = EXCLUDED.model_id,
      settings = EXCLUDED.settings,
      messages = EXCLUDED.messages,
      custom_tools = EXCLUDED.custom_tools,
      tool_config = EXCLUDED.tool_config,
      is_active = EXCLUDED.is_active,
      is_public = EXCLUDED.is_public;
