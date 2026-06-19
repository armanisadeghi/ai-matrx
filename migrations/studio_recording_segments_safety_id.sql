-- Add a crash-safe recovery pointer to each recording cycle.
--
-- The recorder persists every chunk to the browser's IndexedDB keyed by a
-- `safetyId` BEFORE transcription/upload, so audio is never lost at capture.
-- But when a cycle is stranded (page reload/crash/back-to-back start before
-- finalize, or chunks never uploaded on bad mobile network), the row had no way
-- to point back at that IndexedDB entry — so the audio sat orphaned and
-- unrecoverable (KNOWN_DEFECTS D7). Storing the safetyId on the row lets the
-- session-load reconcile pull the assembled blob from IndexedDB and re-upload
-- it, closing the same-device loss gap. Nullable; written early (first chunk)
-- so a crash-before-finalize still leaves a recovery pointer.
--
-- Applied live to txzxabzwovsujtloxrus via MCP apply_migration 2026-06-14.
ALTER TABLE public.studio_recording_segments
  ADD COLUMN IF NOT EXISTS safety_id text;

COMMENT ON COLUMN public.studio_recording_segments.safety_id IS
  'Crash-safe IndexedDB entry id (audioSafetyStore) for this cycle''s audio; used by reconcileStuckRecordingsThunk to recover orphaned audio. See KNOWN_DEFECTS D7.';
