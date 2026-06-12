-- studio_session_settings_custom_slots.sql
-- Multiple "custom" output slots for the Transcription Cleanup page.
--
-- Outputs already store fine (studio_documents takes any kind per session,
-- UNIQUE(session_id, kind)) — the gap was AGENT TRACKING: settings had only
-- the three fixed shortcut columns. custom_slots holds the full slot list:
--   jsonb array of { id, agentId, label, source ('raw'|'clean'),
--                    autoRun, docKind }
-- docKind maps the slot to its studio_documents row ('cleanup_custom' for the
-- first slot — back-compat — then 'cleanup_custom_<id8>'). Null = single
-- legacy slot derived from module_shortcut_id.

alter table public.studio_session_settings
  add column if not exists custom_slots jsonb;

comment on column public.studio_session_settings.custom_slots is
  'Cleanup-page custom output slots: jsonb array of { id, agentId, label, source, autoRun, docKind }. Each docKind maps to a studio_documents row. Null = single legacy slot (module_shortcut_id).';
