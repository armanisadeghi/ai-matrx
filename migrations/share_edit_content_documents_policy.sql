-- Lane SHARE-EDIT-CONTENT, part 3: let `edit_content` update a Spaces page (content.document).
-- ONE additive permissive update policy (policies are OR'd, so the existing editor rule is unchanged); the
-- column rule is the trigger _a00_guard_edit_content_structure from share_edit_content_documents_and_entity_seat.sql,
-- which MUST be applied first: without it this policy would let edit_content change structure columns.
-- NOTE: a later full `iam.apply_rls` regeneration of content.document drops this extra policy; re-apply after one.
create policy edit_content_update on content.document
  for update
  using (iam.has_access('document'::text, id, 'edit_content'::public.permission_level))
  with check (iam.has_access('document'::text, id, 'edit_content'::public.permission_level));
