-- Delete means archive (Arman, 2026-09-27): a data store's delete now sets
-- rag.data_stores.deleted_at. Register the kind with THE trash registry so the
-- person can find it in /trash and bring it back (public._trash_kind_rows lists
-- every platform.entity_types row with a user_artifact_kind; owner = created_by,
-- title = name; restore goes through public.entity_undelete, and the members
-- come back with it through platform.soft_delete_edge).

update platform.entity_types
   set user_artifact_kind = 'data_store'
 where token = 'data_store' and user_artifact_kind is null;
