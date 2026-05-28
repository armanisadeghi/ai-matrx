-- voice_intro_agent_and_surface.sql
--
-- Step 4 of the voice-agent unification (May 2026): make the AI Matrx
-- Introduction Agent a normal `agx_agent` row so the locked /chat/voice
-- surface is no longer powered by hardcoded `constants.ts` values. The
-- voice transport / audio modules / token mint are unchanged — what
-- changes is which agent record drives them.
--
-- Three pieces:
--   1. The intro agent row (model_id → xai_realtime; settings carries
--      voice_id + realtime_tools; messages[0].content[0].text holds the
--      system prompt).
--   2. A new `ui_surface` row for `/chat/voice` with
--      `execution_mode = 'browser-realtime'`. This is the data side of
--      the `pickRuntime` resolver in features/agents/runtime/. Set to
--      browser-realtime so launching realtime models from this surface
--      activates `launchRealtimeSession`.
--   3. Anything else stays untouched. Other surfaces still default to
--      python-stream — no behavior change for the rest of the app.
--
-- Reversibility:
--   • DELETE FROM public.agx_agent WHERE id = '00000000-0000-4000-8000-000000000001';
--   • UPDATE public.ui_surface SET execution_mode = 'python-stream'
--       WHERE name = 'matrx-user/chat-voice';
--   • DELETE FROM public.ui_surface WHERE name = 'matrx-user/chat-voice';
--
-- Applied 2026-05-28 via the Supabase MCP. This file captures the SQL
-- for re-runnable / re-seedable contexts.

-- ─── 1. Built-in voice intro agent ────────────────────────────────────
INSERT INTO public.agx_agent (
  id, name, description, agent_type, is_active, is_archived, is_public, is_favorite,
  model_id, settings, messages, tools, mcp_servers, tags, category,
  context_slots, variable_definitions, output_schema, model_tiers,
  skill_config, custom_tools, tool_config,
  rag_awareness_mode, default_rag_boost,
  user_id, organization_id, project_id, task_id,
  source_agent_id, version
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'AI Matrx Introduction Agent',
  'Built-in realtime voice agent for new caller introductions. Drives the locked /chat/voice surface. Configurable by duplicating into your own agent.',
  'builtin',
  true, false, true, false,
  '218ac819-f530-4c7e-9dcd-3265c9e4fdb0',
  '{"voice_id":"ara","realtime_tools":["web_search","x_search"]}'::jsonb,
  -- messages[0].content[0].text — the full system prompt, including the
  -- locked `## Pronunciation` substitution rules. Editing this in the
  -- Agent Builder is the supported path; do NOT edit it inline here.
  jsonb_build_array(
    jsonb_build_object(
      'role', 'system',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text',
          -- intentionally short stub — the real prompt body is seeded
          -- via the MCP-applied INSERT and persisted on the row. See
          -- features/voice-agent/constants.ts -> INTRO_INSTRUCTIONS for
          -- the canonical text the row was seeded from.
          '# AI Matrx Introduction Agent — see Agent Builder for the live prompt.'
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
  '[]'::jsonb,
  '{"tools":[],"excluded_tools":[],"auto_tools_disabled":false}'::jsonb,
  'none', 0,
  NULL, NULL, NULL, NULL,
  NULL, 1
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. /chat/voice surface — flip to browser-realtime ───────────────
INSERT INTO public.ui_surface (
  name, client_name, description, is_active, sort_order, execution_mode, url_pattern
) VALUES (
  'matrx-user/chat-voice',
  'matrx-user',
  'Realtime voice chat surface (/chat/voice). Browser↔model direct WebSocket; bypasses the Python streaming backend.',
  true,
  111,
  'browser-realtime',
  '/chat/voice'
)
ON CONFLICT (name) DO UPDATE
  SET execution_mode = EXCLUDED.execution_mode,
      description = EXCLUDED.description,
      url_pattern = EXCLUDED.url_pattern;
