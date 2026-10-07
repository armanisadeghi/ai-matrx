-- inverse of share_edit_content_documents_policy.sql
-- chair-step: removes edit_content's write door on Spaces pages; the owner of lane SHARE-EDIT-CONTENT decides.
drop policy if exists edit_content_update on content.document;
