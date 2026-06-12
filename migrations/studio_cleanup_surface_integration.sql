-- studio_cleanup_surface_integration.sql
-- Merge the high-volume Transcription Cleanup page onto the studio data model so
-- both surfaces share one session registry and the same per-container tables.
--
-- 1) studio_sessions.source — origin flag. Each surface lists its own sessions by
--    default ('studio' = transcript studio, 'cleanup' = transcription cleanup page).
--    Additive + defaulted; existing rows become 'studio'. The studio list filters
--    source <> 'cleanup'; the cleanup list filters source = 'cleanup'. Either view
--    can opt to show all — a cleanup session is a real studio session.
--
-- 2) studio_session_settings.context_items — per-session, user-authored context
--    items passed to agents as proper context entries at invocation. Shape:
--    jsonb array of { id, key, label, value, type }. Null/absent = none. This was
--    a gap; adding it here makes free-form context first-class for BOTH surfaces.

alter table public.studio_sessions
  add column if not exists source text not null default 'studio';

comment on column public.studio_sessions.source is
  'Origin surface: ''studio'' (transcript studio) | ''cleanup'' (transcription cleanup page). Scopes session lists per surface; either view may show all.';

-- Source-scoped, recency-ordered list per user (the cleanup page is high-volume).
create index if not exists idx_studio_sessions_source_user_updated
  on public.studio_sessions (source, user_id, updated_at desc)
  where is_deleted = false;

alter table public.studio_session_settings
  add column if not exists context_items jsonb;

comment on column public.studio_session_settings.context_items is
  'Per-session user context items passed to agents as context entries: jsonb array of { id, key, label, value, type }. Null = none.';
