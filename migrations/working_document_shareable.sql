-- working_document_shareable.sql
--
-- Make the working document a first-class shareable resource:
--
--  1. `workbench.working_documents.visibility` — the canonical
--     `platform.visibility` enum, default 'personal'. Before this column the
--     access kernel (`platform.entity_row_access_attrs`) already fell back to
--     'personal' for this table, so the default changes NOTHING about current
--     access; it unlocks the owner-controlled public/link lanes ShareModal
--     writes (`visibility` column, `isPublicColumn = null` registry shape).
--  2. `platform.entity_types.default_visibility` → 'personal' for the token —
--     a working document rides its chat, and conversations default personal.
--     (Was 'internal', which nothing consumed yet; 'personal' matches the
--     live fallback behavior above.)
--  3. One row in `platform.shareable_resource_registry` so the sharing RPC
--     family (`share_resource_with_user` / `resolve_shareable_resource` /
--     `get_resource_access` / share links) recognizes 'working_document'.
--     RLS on the table already enforces grants via
--     `iam.has_access('working_document', id, <level>)`, so grants written
--     into `iam.permissions` are honored with no policy change.

alter table workbench.working_documents
  add column if not exists visibility platform.visibility not null default 'personal';

update platform.entity_types
   set default_visibility = 'personal'
 where token = 'working_document'
   and default_visibility is distinct from 'personal';

insert into platform.shareable_resource_registry (
  resource_type, schema_name, table_name, id_column, owner_column,
  is_public_column, display_label, url_path_template,
  rls_uses_has_permission, is_active, is_link_shareable,
  content_role, is_scopeable, public_columns, notes
) values (
  'working_document', 'workbench', 'working_documents', 'id', 'created_by',
  null, 'Working Document', '/chat/new?attachDoc={id}',
  true, true, true,
  'destination', false,
  array['id','title','content','kind','created_at','updated_at'],
  'Chat working documents. RLS = std entity-variant via iam.has_access. No standalone route: the in-app destination opens a new chat with the document linked.'
)
on conflict (resource_type) do nothing;
