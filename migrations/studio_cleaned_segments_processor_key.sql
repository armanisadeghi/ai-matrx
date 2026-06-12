-- studio_cleaned_segments_processor_key.sql
-- Generalize per-recording cleaning into per-recording PROCESSORS.
--
-- Cleaning is just the built-in per-segment processor. A user-defined
-- per-segment custom processor runs the same machinery (cleanRecording pipeline,
-- supersession, realtime, selectors) with a different agent and a different key.
-- `processor_key` discriminates them:
--   'clean'        → built-in cleaning (existing behavior, the default)
--   '<slot key>'   → a user's custom per-segment processor
--
-- Supersession is now scoped to (recording_segment_id, processor_key): re-running
-- a recording's clean replaces only that recording's prior CLEAN, and re-running a
-- custom processor replaces only that processor's prior output for that recording.
-- The full-session clean (selectSessionCleanedText) and per-recording clean
-- (selectCleanedSegmentForRecording) filter processor_key = 'clean', so custom
-- processor rows never pollute the canonical clean concatenation.
--
-- Additive with a NOT NULL DEFAULT 'clean': every existing row becomes a clean
-- row, so zero behavioral change for the Studio's windowed cleaner or Scribe.

alter table public.studio_cleaned_segments
  add column if not exists processor_key text not null default 'clean';

comment on column public.studio_cleaned_segments.processor_key is
  'Per-segment processor that produced this row. ''clean'' = built-in cleaning (default). Custom per-segment processors use their slot key. Supersession is scoped per (recording_segment_id, processor_key).';

-- The recording lookup index now keys on processor too, so "the active output of
-- processor P for recording R" is a single-row index probe.
drop index if exists idx_studio_cleaned_segments_recording;
create index if not exists idx_studio_cleaned_segments_recording
  on public.studio_cleaned_segments (session_id, recording_segment_id, processor_key)
  where superseded_at is null;
