-- docproc.processed_documents is column-granted to `authenticated` (storage_uri is withheld), so a
-- new column is unreadable until named: the Sources list asked for captured_at
-- (migrations/source_captured_at_column.sql) and PostgREST answered 42501. Read-only for clients —
-- the column is stamped on insert by docproc._stamp_source_captured_at() and never written by the app.
GRANT SELECT (captured_at) ON docproc.processed_documents TO authenticated;
