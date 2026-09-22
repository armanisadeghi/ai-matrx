-- chair-step: DOORS-ONLY-5 inverse -- drops the three restrictive refusal policies on
-- platform.categories, putting the client write surface back. On this table that also restores
-- four things no policy ever covered: the dimension was not a wall, a metadata write replaced
-- the whole column (ContentBlocksManager wiped legacy_table with an is_active toggle), the
-- skills thunks built metadata from a Redux cache, and three callers HARD-deleted a row that
-- thirty-plus tables carry a foreign key to. Only run it to undo a closure that broke a real
-- path, and say which path.

drop policy if exists "categories_client_insert_refused" on platform.categories;
drop policy if exists "categories_client_update_refused" on platform.categories;
drop policy if exists "categories_client_delete_refused" on platform.categories;
