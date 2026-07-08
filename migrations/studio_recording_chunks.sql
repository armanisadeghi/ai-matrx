-- studio_recording_chunks — eager per-chunk upload journal (KNOWN_DEFECTS D7,
-- cross-device audio recovery).
--
-- While a recording is live, every ~10s MediaRecorder chunk is uploaded to
-- cld_files in the background (fire-and-forget, additional to — never instead
-- of — the IndexedDB safety net) and journaled here keyed by the recorder's
-- crash-safe `safety_id` (the same id persisted on
-- transcripts.studio_recording_segments.safety_id). When a recording's full
-- audio upload never lands (phone died / browser closed mid-upload), ANY
-- device that later opens the session can reassemble the audio server-side
-- data from these uploaded chunks: reconcileStuckRecordingsThunk downloads the
-- journaled chunk files in index order, concatenates them (byte-identical to
-- the live path's full-blob assembly), re-uploads the stitched blob via the
-- existing uploadRecordingAudioThunk, and then discards the journal.
--
-- Journal rows + their cld_files staging blobs are EPHEMERAL: deleted as soon
-- as the recording's durable full-audio upload succeeds. Chunk files live in
-- the hidden `.matrx-tmp/transcripts` staging folder (same convention as
-- audioFallbackUpload) so they never appear in the user's file tree.
--
-- RLS: canonical generator (iam.apply_rls, 'entity' variant). The token
-- 'recording_chunk' is deliberately NOT registered in platform.entity_types —
-- iam.has_access() returns false for unregistered tokens, so the policies
-- collapse to owner-only (created_by = auth.uid()), which is exactly right
-- for a private, ephemeral staging journal. No sharing, no public read.

create table if not exists transcripts.studio_recording_chunks (
  id uuid primary key default gen_random_uuid(),
  -- The recorder engine's crash-safe cycle id (rec_<ts>_<rand>). Links to
  -- transcripts.studio_recording_segments.safety_id (no FK — segments row may
  -- not exist yet when chunk 0 lands, and non-studio surfaces journal too).
  safety_id text not null,
  chunk_index integer not null,
  -- cld_files UUID of the uploaded chunk blob.
  file_id uuid not null,
  mime_type text not null default 'audio/webm',
  size_bytes bigint not null default 0,
  created_by uuid not null default auth.uid(),
  organization_id uuid null,
  created_at timestamptz not null default now(),
  unique (safety_id, chunk_index)
);

create index if not exists idx_studio_recording_chunks_safety
  on transcripts.studio_recording_chunks (safety_id);
create index if not exists idx_studio_recording_chunks_creator
  on transcripts.studio_recording_chunks (created_by, created_at);

grant select, insert, update, delete
  on transcripts.studio_recording_chunks to authenticated;
grant all on transcripts.studio_recording_chunks to service_role;

-- Canonical RLS — owner-only (unregistered token, see header comment).
select iam.apply_rls('transcripts', 'studio_recording_chunks', 'recording_chunk', 'entity');

-- New table in an already-exposed schema still 42501s for authenticated
-- until PostgREST reloads its schema cache.
notify pgrst, 'reload schema';
