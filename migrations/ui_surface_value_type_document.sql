-- ui_surface_value_type_document.sql
-- The SurfaceValue.valueType union (features/surfaces/types.ts) and the drift
-- check both allow 'document', but the ui.ui_surface_value CHECK constraint
-- predates it — which made POST /api/admin/surfaces/sync-manifests fail 500
-- ("Unknown error") the moment any manifest declared a document value
-- (extractor-chunker's pdf_page did). Align the DB with the code contract.

alter table ui.ui_surface_value
  drop constraint if exists ui_surface_value_type_chk;

alter table ui.ui_surface_value
  add constraint ui_surface_value_type_chk
  check (value_type = any (array['string'::text, 'number'::text, 'boolean'::text, 'object'::text, 'array'::text, 'document'::text]));
