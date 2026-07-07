-- Close base-shape FAILs surfaced by iam.verify_canonical on the §2.2 tables (additive only)

-- files.files: base columns + shared triggers
ALTER TABLE files.files
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS trg_cld_files_updated_at ON files.files; -- legacy updated_at trigger; _touch_row replaces it
DROP TRIGGER IF EXISTS _touch_row ON files.files;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON files.files
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
DROP TRIGGER IF EXISTS _stamp_actor ON files.files;
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON files.files
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- transcripts.transcripts: NOT NULL timestamps + metadata
UPDATE transcripts.transcripts SET created_at = COALESCE(created_at, updated_at, now()) WHERE created_at IS NULL;
UPDATE transcripts.transcripts SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE transcripts.transcripts
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- transcripts.studio_sessions: metadata
ALTER TABLE transcripts.studio_sessions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
