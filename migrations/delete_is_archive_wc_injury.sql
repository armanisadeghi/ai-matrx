-- Delete means archive (Arman, 2026-09-27). Removing an injury from a workers'
-- comp rating report (DELETE /legal-wc/injuries/{id}) destroyed the row. It now
-- moves to Trash; the report and the rating calculation read live injuries only.
-- Positive add (db-rules §8). history.row_versions is deliberately NOT given a
-- Trash column: it is the append-only version-history ledger (clients may only
-- SELECT it; every function that deletes from it — history.prune,
-- public.version_prune, crm_party_purge, delete_note_version — is closed to
-- clients and belongs to retention).
alter table legal.wc_injury add column if not exists deleted_at timestamptz;

update platform.entity_types
   set has_soft_delete = true
 where schema_name = 'legal' and table_name = 'wc_injury'
   and has_soft_delete = false;
