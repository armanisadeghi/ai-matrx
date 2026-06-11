-- studio_cleaned_segments_recording_anchor.sql
-- Anchor cleaned segments to the recording they were derived from.
--
-- Scribe's cleaning model is recording-aligned: when a recording segment closes
-- (manual stop, or — soon — a periodic auto-rotation during continuous capture),
-- exactly that segment's raw text is cleaned into ONE cleaned segment. The
-- "full session clean" is then just the ordered concatenation of those rows, so
-- there is no separate monolithic clean document to keep in sync.
--
-- To make the per-recording <-> clean link robust (not a fragile t_start/t_end
-- time match), we anchor each cleaned segment to its source recording via a
-- nullable FK. NULL = a legacy / Studio time-windowed cleaning pass that wasn't
-- tied to a single recording (the desktop Studio's interval cleaner keeps
-- working unchanged). ON DELETE CASCADE so deleting a recording removes its
-- clean too.
--
-- Additive and nullable: zero impact on existing rows or the Studio's windowed
-- cleaning path.

alter table public.studio_cleaned_segments
  add column if not exists recording_segment_id uuid
    references public.studio_recording_segments (id) on delete cascade;

comment on column public.studio_cleaned_segments.recording_segment_id is
  'Source recording this clean was derived from (recording-aligned cleaning). NULL for Studio time-windowed passes not tied to a single recording.';

-- Fetch a session''s recording-aligned cleans, and look up the active clean for
-- a single recording, without scanning by time.
create index if not exists idx_studio_cleaned_segments_recording
  on public.studio_cleaned_segments (session_id, recording_segment_id)
  where superseded_at is null;
