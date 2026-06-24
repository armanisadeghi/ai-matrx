-- sharing_resource_registry_repoint_files_to_cld_files.sql
--
-- The "files" shareable resource pointed at a phantom table `public.user_files`
-- that never held a row and was a meaningless duplicate of the real cloud file
-- system (`public.cld_files`). `user_files` has now been dropped. Repoint the
-- registry's files entry at the real table so every share / org / scope / peek
-- surface resolves against `cld_files`.
--
-- Column reality on cld_files (vs the phantom): owner is `owner_id` (not
-- `user_id`); name is `file_name`; size is `size_bytes`. The canonical detail
-- route is `/files/f/{id}`.
--
-- IMPORTANT — rls_uses_has_permission flips to FALSE: cld_files RLS does NOT
-- consult the generic `has_permission()` sharing function. It enforces its own
-- model (`cld_user_has_permission_grant` + cld_file_permissions / cld_share_links).
-- So a row inserted into `public.permissions` for a cld_file would NOT grant the
-- grantee access. `false` is the honest value — it surfaces that generic
-- permission-table sharing is not the path for cloud files (use the cld_* share
-- system instead). No file shares existed in `permissions`, so nothing is orphaned.
--
-- Idempotent: re-running matches zero rows once the repoint has happened.

UPDATE public.shareable_resource_registry
SET
    resource_type          = 'cld_files',
    table_name             = 'cld_files',
    owner_column           = 'owner_id',
    url_path_template      = '/files/f/{id}',
    rls_uses_has_permission = false,
    updated_at             = now()
WHERE resource_type = 'user_files';
