-- Reachability rollout §2.2: RLS must delegate to iam.has_access (the single judge)
-- so inherited containment access actually reaches content tables.
-- Tables: files.files, transcripts.transcripts, transcripts.studio_sessions

-- 1. studio_sessions: add canonical visibility + deleted_at (legacy is_public/is_deleted kept through soak)
ALTER TABLE transcripts.studio_sessions
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE transcripts.studio_sessions
   SET deleted_at = COALESCE(deleted_at, updated_at, now())
 WHERE is_deleted = true AND deleted_at IS NULL;

-- 2. Canonical policies via the one authority (drops all legacy policies, installs std set)
SELECT iam.apply_rls('files', 'files', 'file', 'entity');
SELECT iam.apply_rls('transcripts', 'transcripts', 'transcript', 'entity');
SELECT iam.apply_rls('transcripts', 'studio_sessions', 'studio_session', 'entity');

-- 3. Sharing registry: canonical owner column for transcript
UPDATE platform.shareable_resource_registry
   SET owner_column = 'created_by'
 WHERE resource_type = 'transcript' AND owner_column = 'user_id';
