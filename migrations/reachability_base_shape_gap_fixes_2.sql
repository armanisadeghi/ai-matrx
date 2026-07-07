-- transcripts.metadata pre-existed as NULLABLE; ADD COLUMN IF NOT EXISTS no-oped. Fix the shape.
UPDATE transcripts.transcripts SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE transcripts.transcripts
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL;

-- files.files: updated_by FK -> auth.users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_updated_by_fkey' AND conrelid = 'files.files'::regclass) THEN
    ALTER TABLE files.files ADD CONSTRAINT files_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
