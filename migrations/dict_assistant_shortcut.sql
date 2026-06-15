-- ============================================================================
-- Dictionary Assistant — global shortcut (widget launch).
--
-- Opens the factory-built Dictionary Assistant agent
-- (ab1a868e-b866-4ade-9383-fd63b0928c7c) as a floating-chat WIDGET — not the
-- full /chat route. The "Ask assistant" buttons in the dictionary management
-- UIs launch this shortcut via useAgentLauncher().launchShortcut.
--
-- Global / platform shortcut: all four scope columns NULL (visible to every
-- user per the agx_shortcut RLS policy). use_latest=true so the agent's current
-- config (model + dictionary tool + skills) always applies. allow_chat=true +
-- auto_run=false → opens an empty chat the user talks to; the agent does the
-- dictionary reads/writes via its tool.
--
-- Fixed id so features/dictionary/constants.ts can reference it.
-- Category: the existing global "Audio Transcription" shortcut category.
-- ============================================================================

INSERT INTO public.agx_shortcut (
  id,
  agent_id,
  agent_version_id,
  use_latest,
  label,
  description,
  icon_name,
  category_id,
  display_mode,
  allow_chat,
  auto_run,
  show_variable_panel,
  is_active,
  user_id, organization_id, project_id, task_id, surface_name
)
VALUES (
  'a6200e02-1c55-4804-98e4-f123145872d2',
  'ab1a868e-b866-4ade-9383-fd63b0928c7c',
  NULL,
  true,
  'Dictionary Assistant',
  'Chat to build your dictionary — it adds your terms and pronunciations for you.',
  'BookA',
  '874878f3-dbb7-4edb-8401-d4f721637220',  -- global "Audio Transcription" category
  'floating-chat',
  true,
  false,
  false,
  true,
  NULL, NULL, NULL, NULL, NULL
)
ON CONFLICT (id) DO UPDATE SET
  agent_id = EXCLUDED.agent_id,
  use_latest = EXCLUDED.use_latest,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  display_mode = EXCLUDED.display_mode,
  allow_chat = EXCLUDED.allow_chat,
  auto_run = EXCLUDED.auto_run,
  is_active = EXCLUDED.is_active,
  updated_at = now();
