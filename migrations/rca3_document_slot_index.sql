-- autocommit: CREATE INDEX CONCURRENTLY
-- RC-A3 / STORE-DESIGN P6 (§3.7): a single-valued slot holds ONE document. A conversation has one
-- working document, an episode one script, a session one cleaned transcript: a second document
-- in the same slot is refused by the index instead of silently doubling the slot. Built
-- CONCURRENTLY (platform.associations is hot); apply in the 1-4 AM PT window through aidream's
-- runner: uv run python db/apply_migrations.py --source matrx-frontend --only rca3_document_slot_index.sql
create unique index concurrently if not exists assoc_document_slot_uq
  on platform.associations (target_type, target_id, role)
  where source_type = 'document' and deleted_at is null
    and role in ('working_document', 'cleanup_custom', 'scribe_cleanup', 'vision', 'requirements',
                 'document', 'cleaned_transcript', 'script');
