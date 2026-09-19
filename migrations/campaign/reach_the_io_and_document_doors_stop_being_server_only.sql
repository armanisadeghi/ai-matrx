-- REACH — IMPORT, EXPORT AND THE DOCUMENT VERBS STOP BEING SERVER-ONLY.
--
-- Nine functions in schema `custom` already carried a `platform.client_callable_door`
-- row, and every one of those rows said the same thing: `non_client_lane`, i.e. "no
-- client may ever call this". They are import, export and the document template verbs:
--
--   custom.io_export, io_export_csv, io_import_open, io_import_rows,
--   io_proposal_accept, io_proposal_reject,
--   custom.doc_template_save, doc_render_document, doc_sign
--
-- That declaration was true when it was written — those bodies decided the store's
-- switch and nothing else, so opening them to a client would have been a door with no
-- check behind it. `reach_the_client_doors_of_the_store.sql` (applied minutes before
-- this file) gave every one of them the organization wall and, where it names a record
-- or a Table, the one ladder at the level that verb needs. The declaration is now
-- false, and a false declaration is worse than a missing one: it is the sentence the
-- next person reads instead of measuring.
--
-- So this file REWRITES those nine rows to what is now true — signed-in callers, no
-- server-only lane — and asks `custom.reopen_declared_doors()` to make the catalogue
-- match. A person exporting their own table, importing a spreadsheet, accepting the
-- columns it proposes, or saving, rendering and signing a document template does all
-- of it from the app, which is the only place any of those things happen.
--
-- It does not touch any other door row: the `where` names these nine and nothing else,
-- and the seventeen genuinely server-only rows in this schema (the movers, the drains,
-- the anonymous-token internals, the visibility cache) are left exactly as they are.
--
-- ADDITIVE: it updates 9 rows in our own registry and issues the EXECUTE grants that
-- follow from them. It drops nothing and revokes nothing.
--
-- THE INVERSE: migrations/inverse/reach_the_io_and_document_doors_stop_being_server_only_down.sql.

set lock_timeout = '5s';
set statement_timeout = '600s';

update platform.client_callable_door d
   set signed_in_callers = true,
       anonymous_callers = false,
       non_client_lane   = null,
       declared_by       = 'migrations/campaign/reach_the_io_and_document_doors_stop_being_server_only.sql (lane REACH)',
       reason            = v.reason
  from (values
  ('io_export',           'Exporting a Table as JSON. Declared server-only when its body decided only the store''s switch; it now opens with custom.assert_client_may_reach, and every row it returns comes out of custom.query_visible_ids, which asks custom.has_visibility per row. The columns are the Table''s own declared Fields rather than whatever keys a document happens to carry.'),
  ('io_export_csv',       'The same export as CSV, escaped by the same function the importer parses back, over the same rows io_export returns. A person exporting their own data should never need somebody with a database connection.'),
  ('io_import_open',      'Opening an import run against a Table. It takes EDITOR on that Table on the one ladder (custom.assert_client_may_change), because an import run is the first half of writing rows into it.'),
  ('io_import_rows',      'Feeding rows into an open import run. The organization wall first, then every row through the store''s one write door, so validation, the value envelope, provenance and the rules all apply; a refused row is recorded with its reason rather than failing the run.'),
  ('io_proposal_accept',  'Accepting an unmapped import column as a new Field - the moment a spreadsheet becomes a shape. It is the offer half of the import and is useless if only a server can take it. Organization wall first, and the run it names must belong to that organization.'),
  ('io_proposal_reject',  'Declining that offer, so the column is remembered as refused rather than proposed again on the next run. Same wall, same run check.'),
  ('doc_template_save',   'Saving a document template against a Table. Every save is a new template version, because a signature seals a version. EDITOR on the Table on the one ladder.'),
  ('doc_render_document', 'Rendering a template against one record into a document version. VIEWER on the record on the one ladder: a document is the record''s own values, so reaching the document must take reaching the record.'),
  ('doc_sign',            'Signing a field on a rendered document. EDITOR on the record on the one ladder. It writes through the store''s own write door so the signature is a Value with a version and an author, and it refuses to overwrite a seal.')
  ) as v(fname, reason)
 where d.schema_name = 'custom'
   and d.function_name = v.fname;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
