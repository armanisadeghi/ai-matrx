-- migrate: skip: applied directly via Supabase MCP to shared aidream-owned config
-- tables (public.ui_surface + public.tool_surface_defaults). Recorded here for
-- traceability only; the ledger applier must not re-run it.
-- ============================================================================
-- Scribe session surface + memory tool default.
--
-- Registers a dedicated UI surface for the Scribe session screen
-- (/transcripts/scribe/[id], features/transcript-studio) so its Agent tab can
-- carry its own tool defaults independently of the transcripts list. Seeds the
-- `memory` tool onto that surface — the frontend sends `client.surface =
-- matrx-user/transcript-scribe` on every Agent turn (see
-- features/surfaces/utils/route-to-surface.ts), and the server's
-- tool_resolve_for_request inheritance grants the memory tool from
-- tool_surface_defaults.
--
-- NOTE: the Live (voice/xAI) tab does NOT route through surface resolution —
-- it connects directly to xAI Realtime. Giving Live the memory tool requires
-- the xAI custom-function-tool bridge (see features/voice-agent/FEATURE.md),
-- which is separate, larger work.
-- ============================================================================

INSERT INTO public.ui_surface
  (name, client_name, description, sort_order, is_active, execution_mode)
VALUES (
  'matrx-user/transcript-scribe',
  'matrx-user',
  'Scribe session screen (mobile audio studio): the Agent tab chats against the working document and session recordings. Distinct from the transcripts list so it can carry its own tool defaults (memory).',
  210, true, 'python-stream'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.tool_surface_defaults
  (surface_name, always_include_tools, always_include_bundles,
   never_include_tools, never_include_bundles, is_active, notes)
VALUES (
  'matrx-user/transcript-scribe',
  ARRAY['memory']::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  true,
  'Scribe session Agent tab. Seeded with the memory tool; expand always_include_tools to grant more (e.g. scratchpad, storage, tasks) as needed.'
)
ON CONFLICT (surface_name) DO UPDATE SET
  always_include_tools = EXCLUDED.always_include_tools,
  is_active = true,
  notes = EXCLUDED.notes,
  updated_at = now();
