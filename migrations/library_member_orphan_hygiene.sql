-- library_member_orphan_hygiene.sql  (P4 / D-F)
--
-- Orphan rag.data_store_members rows outlive their files: as of 2026-07-23,
-- 2 of 4 live cld_file members pointed at a soft-deleted or hard-missing
-- files.files row. A member whose source is gone is a lie in the catalog and
-- a dangling conveyance edge waiting to happen.
--
-- DECISION (delete-vs-flag): SOFT-DELETE the member (deleted_at = now()), with
-- a loud provenance marker in `notes`. Rationale: the trash model is already
-- how membership removal works everywhere else (Wave A), it cascades edge
-- removal through trg_data_store_members_assoc automatically, and it is
-- reversible. Restoring a file does NOT auto-restore membership — re-adding
-- to a store is an explicit curator act.
--
-- Enforcement: trigger on files.files — on soft-delete (deleted_at set) or
-- hard DELETE of a file, live cld_file members pointing at it are
-- soft-deleted, LOUDLY (RAISE WARNING names each store).
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Enforcement trigger on files.files
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.soft_delete_members_on_file_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rag, files
AS $$
DECLARE
  v_file uuid;
  v_count int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_file := OLD.id;
  ELSE
    -- Only act on the transition into soft-deleted.
    IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    v_file := NEW.id;
  END IF;

  UPDATE rag.data_store_members dm
     SET deleted_at = now(),
         notes = trim(both ' ' from coalesce(dm.notes, '') ||
                 ' [auto-removed ' || now()::date || ': source file deleted]')
   WHERE dm.source_kind = 'cld_file'
     AND dm.source_id = v_file::text
     AND dm.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RAISE WARNING '[rag.soft_delete_members_on_file_delete] file % deleted -> soft-deleted % data_store_members row(s). Membership does not auto-restore; re-add is an explicit curator act.',
      v_file, v_count;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_files_soft_delete_store_members ON files.files;
CREATE TRIGGER trg_files_soft_delete_store_members
  AFTER UPDATE OF deleted_at OR DELETE ON files.files
  FOR EACH ROW EXECUTE FUNCTION rag.soft_delete_members_on_file_delete();

-- ---------------------------------------------------------------------------
-- 2. One-time hygiene: soft-delete live members whose file is gone already
--    (missing row entirely, or soft-deleted). Loud marker in notes.
-- ---------------------------------------------------------------------------
UPDATE rag.data_store_members dm
   SET deleted_at = now(),
       notes = trim(both ' ' from coalesce(dm.notes, '') ||
               ' [auto-removed ' || now()::date || ': orphaned — source file missing/deleted (P4 D-F hygiene)]')
 WHERE dm.deleted_at IS NULL
   AND dm.source_kind = 'cld_file'
   AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND NOT EXISTS (
     SELECT 1 FROM files.files f
     WHERE f.id = dm.source_id::uuid
       AND f.deleted_at IS NULL
   );
