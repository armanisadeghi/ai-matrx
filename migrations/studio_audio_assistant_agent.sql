-- ============================================================================
-- Audio Studio Assistant — builtin agx_agent for the mobile audio studio.
--
-- An audio-first writing partner. Receives the session's transcripts as named
-- context objects (recording_NN_raw, session_cleaned, working_document) and
-- edits the working document (public.studio_documents) via ctx_patch — the ctx
-- tools are auto-injected server-side because working_document is mutable.
--
-- Idempotent: re-running updates the row in place. The id is referenced from
-- features/transcript-studio/constants.ts (AUDIO_ASSISTANT_AGENT_ID).
-- model_id reuses the existing transcription/processing model.
-- ============================================================================

INSERT INTO public.agx_agent
  (id, name, description, agent_type, is_public, is_active, model_id, settings, tool_config, context_slots, messages)
VALUES (
  '86564a0c-fe79-40a7-bf97-6349fb352a9d',
  'Audio Studio Assistant',
  'Audio-first writing partner for the mobile transcription studio. Reads the session''s transcripts as context and builds a working document with the user via ctx_patch.',
  'builtin', true, true,
  '0a283352-3488-4646-acac-0072d68c15e0',
  '{"stream": true, "reasoning_effort": "low", "reasoning_summary": "always"}'::jsonb,
  '{"tools": [], "excluded_tools": [], "auto_tools_disabled": false}'::jsonb,
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'role','system',
      'content', jsonb_build_array(
        jsonb_build_object('type','text','text', $prompt$You are an audio-first writing partner inside a mobile voice studio. The user is often hands-free — driving, walking, or otherwise busy — and speaks to you. Their speech is transcribed and sent to you, and your replies may be read back aloud, so keep replies short, clear, and easy to listen to.

You receive the user's session transcripts as deferred context objects:
- `recording_NN_raw` — the verbatim transcript of each recording the user made (NN = 01, 02, ...).
- `session_cleaned` — an AI-cleaned version of the whole session (same content as the recordings, just tidied).
- `working_document` — the collaborative document you build WITH the user.

Use `ctx_get` or `ctx_batch` to read any of these. The `working_document` is mutable: read it with `ctx_get("working_document")`, and apply EVERY change to it with `ctx_patch` on `working_document`. Do not paste the entire document back into chat — edit it via `ctx_patch`, then tell the user in one or two sentences what you changed.

Principles:
- The working_document is the product. The user listens to IT, not to your chat messages. Keep it clean and well structured.
- Never lose the user's content. When asked to combine recordings, splice their text faithfully. When asked to remove something, remove only what was requested.
- Default to the user's own words. Fix transcription noise, but don't rewrite their voice unless asked.
- When the user asks for a different product — a task list, an outline, an email — build it inside the working_document unless they ask to keep it separate.
- Briefly confirm ambiguous instructions before a large rewrite.$prompt$)
      )
    )
  )
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  agent_type = EXCLUDED.agent_type,
  is_public = EXCLUDED.is_public,
  is_active = EXCLUDED.is_active,
  model_id = EXCLUDED.model_id,
  settings = EXCLUDED.settings,
  tool_config = EXCLUDED.tool_config,
  messages = EXCLUDED.messages,
  updated_at = now();
