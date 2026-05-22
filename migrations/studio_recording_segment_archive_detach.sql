-- Soft-remove states for mobile recording cards.
--
--   archived_at  → "Archive": hidden from the session's list, recoverable from
--                  the session's Archived view (stays in the session).
--   detached_at  → "Unsort": detached from the session, lands in a global
--                  Unsorted pool; "Restore" clears detached_at (returns to its
--                  original session).
--
-- user_id is denormalized so the cross-session Unsorted view is queryable in a
-- single filter; it is auto-filled from the parent session via a BEFORE INSERT
-- trigger. RLS is unchanged — access still inherits from the parent session.

ALTER TABLE public.studio_recording_segments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS detached_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.studio_recording_segments rs
SET user_id = s.user_id
FROM public.studio_sessions s
WHERE rs.session_id = s.id AND rs.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_studio_recording_segments_user_detached
  ON public.studio_recording_segments(user_id, detached_at)
  WHERE detached_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.studio_recording_segment_set_user_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT s.user_id INTO NEW.user_id
    FROM public.studio_sessions s
    WHERE s.id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS studio_recording_segment_set_user_id ON public.studio_recording_segments;
CREATE TRIGGER studio_recording_segment_set_user_id
  BEFORE INSERT ON public.studio_recording_segments
  FOR EACH ROW EXECUTE FUNCTION public.studio_recording_segment_set_user_id();
