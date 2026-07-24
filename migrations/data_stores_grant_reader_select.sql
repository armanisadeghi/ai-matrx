-- data_stores_grant_reader_select.sql
--
-- Judge/RLS contradiction: iam.has_access('data_store', id, 'viewer') returns
-- TRUE for a Shared-Knowledge grant reader (explicit grant branch), but
-- rag.data_stores RLS only admitted owner + org-member — so a direct
-- `.from("data_stores")` read returned ZERO rows for the very user the judge
-- says may view it. The container was invisible while everything inside it
-- (files, processed docs, pages, chunks, extractions) was readable.
--
-- The canonical list path (rag.fn_list_user_data_stores / fn_list_library_catalog,
-- both SECURITY DEFINER) already includes granted stores, which is why this was
-- not user-visible yet — but any new direct table read would silently show
-- nothing. RLS is the ceiling; it must not sit BELOW the judge.
--
-- Additive SELECT only. Writes stay owner/org — grants never confer mutate.
-- No recursion risk: iam.has_access is SECURITY DEFINER and bypasses RLS.
-- Idempotent.

DROP POLICY IF EXISTS data_stores_grant_reader_select ON rag.data_stores;
CREATE POLICY data_stores_grant_reader_select
  ON rag.data_stores
  FOR SELECT
  TO authenticated
  USING (iam.has_access('data_store', id, 'viewer'::permission_level));

-- Members of a store you can view are viewable too (the member list is the
-- store's contents, already readable row-by-row via the file cascade).
DROP POLICY IF EXISTS data_store_members_grant_reader_select ON rag.data_store_members;
CREATE POLICY data_store_members_grant_reader_select
  ON rag.data_store_members
  FOR SELECT
  TO authenticated
  USING (iam.has_access('data_store', data_store_id, 'viewer'::permission_level));
