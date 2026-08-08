-- Remove forbidden relationship shortcuts discovered while repairing the
-- transcript hub's list-scope queries.
--
-- `platform._mirror_fk_to_assoc` is not a canonical association writer, and a
-- transcript must remain valid without a project. The nullable legacy columns
-- stay in place for compatibility; only the trigger dependencies and project
-- FK are removed.

DO $migration$
BEGIN
  IF to_regclass('transcripts.transcripts') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS _mirror_proj ON transcripts.transcripts;
  DROP TRIGGER IF EXISTS _mirror_task ON transcripts.transcripts;

  ALTER TABLE transcripts.transcripts
    DROP CONSTRAINT IF EXISTS transcripts_project_id_fkey;
END
$migration$;
