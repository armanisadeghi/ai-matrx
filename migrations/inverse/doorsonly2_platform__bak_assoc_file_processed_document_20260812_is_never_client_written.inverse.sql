-- retired: platform._bak_assoc_file_processed_document_20260812 DROPPED 2026-09-27 by the database estate-reduction program wave 2 (backup /Users/armanisadeghi/db-estate-backups/2026-09-27/platform._bak_assoc_file_processed_document_20260812.dump); this file creates, moves, or asserts a table that no longer exists and must never run again
-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform._bak_assoc_file_processed_document_20260812,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a DEAD BACKUP-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "_bak_assoc_file_processed_document_20260812_client_insert_refused" on platform._bak_assoc_file_processed_document_20260812;
drop policy if exists "_bak_assoc_file_processed_document_20260812_client_update_refused" on platform._bak_assoc_file_processed_document_20260812;
drop policy if exists "_bak_assoc_file_processed_document_20260812_client_delete_refused" on platform._bak_assoc_file_processed_document_20260812;
