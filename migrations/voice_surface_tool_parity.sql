-- voice_surface_tool_parity.sql
--
-- Voice-agent tool parity (June 2026). The realtime tool bridge lets a
-- browser voice session resolve and call the EXACT same tools a turn-based
-- agent has. Tool resolution walks the surface's executor + parent chain
-- (apply_unified_tools / tool_resolve_for_request), but the two voice
-- surfaces were created orphaned:
--
--   matrx-user/chat-voice            executor_name=NULL, parent=NULL
--   matrx-user/transcript-scribe-live executor_name=NULL, parent=NULL
--
-- vs. the text chat surface:
--
--   matrx-user/chat   executor_name='matrx-user', parent='matrx-default/default'
--
-- An orphaned surface resolves a DIFFERENT (empty) executor chain than chat,
-- so a voice agent would silently get a different tool set than the same
-- agent run as text — day-one drift, exactly what the bridge exists to kill.
--
-- Fix: parent both voice surfaces UNDER matrx-user/chat and give them the
-- same 'matrx-user' client executor. They then inherit chat's executor
-- binding and any future surface-default tools, so "swap the model to a
-- voice model" yields an identical toolset by construction.
--
-- Idempotent: pure UPDATE of existing rows; safe to re-run.
--
-- Reversibility:
--   UPDATE public.ui_surface
--     SET executor_name = NULL, parent_surface_name = NULL
--     WHERE name IN ('matrx-user/chat-voice','matrx-user/transcript-scribe-live');

UPDATE public.ui_surface
SET executor_name = 'matrx-user',
    parent_surface_name = 'matrx-user/chat'
WHERE name IN (
  'matrx-user/chat-voice',
  'matrx-user/transcript-scribe-live'
);
