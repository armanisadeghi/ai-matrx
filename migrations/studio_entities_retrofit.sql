-- studio_entities_retrofit.sql
-- DB Changeover Wave-3 ADDITIVE base retrofit for the studio_* (audio/transcription studio) tables.
-- Project: txzxabzwovsujtloxrus (Matrx Main).
--
-- Scope: ADDITIVE Step-1 ONLY — standard base columns + org/actor backfill + _touch_row/_stamp_actor
-- triggers, via platform.retrofit_entity. NO RLS flips, NO drops, NO NOT NULL, NO history capture.
-- Idempotent: retrofit_entity uses ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF EXISTS, and backfills
-- guarded on "... IS NULL", so re-applying is a no-op.
--
-- Classification of the 9 public.studio_* base tables:
--   Base-1 ENTITY (retrofitted here):
--     studio_sessions          — session parent (token studio_session); owner user_id; personal org.
--     studio_session_settings  — 1:1 child of session (PK session_id, no owner col); org from parent.
--     studio_documents         — child working-doc (has its own `version` — reused, not re-added); org from parent.
--     studio_recording_segments— child recording (owner user_id, business INSERT trigger preserved); org from parent.
--   Base-3 LOG (SKIPPED — additive Step-1 is entity-only; ledger pass is out of scope):
--     studio_runs, studio_raw_segments, studio_cleaned_segments,
--     studio_concept_items, studio_module_segments  (append-only, no updated_at/version).
--
-- Notes:
--   * studio_sessions retrofitted FIRST (it is the org-bearing parent of the 3 children).
--   * Audio file refs (studio_sessions.audio_storage_path, studio_recording_segments.audio_path) are
--     left untouched — only org/actor are retrofitted.
--   * created_by left NULL on studio_documents / studio_session_settings = system actor (decision #9);
--     they have no owner column to backfill from.

-- 1. Parent entity (personal org from the owner's personal org, system-org fallback).
select platform.retrofit_entity(
  'studio_sessions', 'studio_session', 'personal', 'user_id',
  null, null, 'studio_sessions_updated_at'
);

-- 2. Children — org denormalized from the parent studio_sessions via session_id.
select platform.retrofit_entity(
  'studio_session_settings', 'studio_session_settings', 'parent', 'user_id',
  'studio_sessions', 'session_id', 'studio_session_settings_updated_at'
);

select platform.retrofit_entity(
  'studio_documents', 'studio_document', 'parent', 'user_id',
  'studio_sessions', 'session_id', 'studio_documents_updated_at'
);

select platform.retrofit_entity(
  'studio_recording_segments', 'studio_recording_segment', 'parent', 'user_id',
  'studio_sessions', 'session_id', 'studio_recording_segments_updated_at'
);
