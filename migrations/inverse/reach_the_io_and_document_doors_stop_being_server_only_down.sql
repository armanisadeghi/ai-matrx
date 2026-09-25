-- The inverse of reach_the_io_and_document_doors_stop_being_server_only.sql: the nine
-- import / export / document doors go back to being declared server-only, and the DDL
-- guard takes their EXECUTE grants back on the next DDL that touches them. It is
-- additive as written (an UPDATE of our own registry rows); it is here rather than in
-- the campaign directory because no sweep should ever run it by accident.
--
-- After running it, the app can no longer export a table, import a spreadsheet, accept
-- the columns an import proposes, or save, render and sign a document template.
set lock_timeout = '2s';

update platform.client_callable_door d
   set signed_in_callers = false,
       anonymous_callers = false,
       non_client_lane   = 'server_only: reverted by migrations/inverse/reach_the_io_and_document_doors_stop_being_server_only_down.sql - the import, export and document verbs are reachable only by the role that owns the store until a lane declares them again.'
 where d.schema_name = 'custom'
   and d.function_name in ('io_export', 'io_export_csv', 'io_import_open', 'io_import_rows',
                           'io_proposal_accept', 'io_proposal_reject',
                           'doc_template_save', 'doc_render_document', 'doc_sign');
