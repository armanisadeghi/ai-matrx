-- web_marketing_crud_grants.sql
-- Marketing full-CRUD program: table-level grants for user-managed web.* tables.
--
-- RLS remains the ONLY authorization layer — canonical iam.apply_rls policies
-- (std_select/std_insert/std_update/std_delete) already exist on every table
-- below; these grants merely stop PostgREST from 42501-ing before RLS runs.
-- No RLS policy is created or changed here.
--
-- What each grant unlocks (all deletes are SOFT deletes = UPDATE deleted_at):
--   web.page          INSERT (manual page creation, provenance 'manual')
--                     UPDATE (page-intent editor — previously 42501'd — and soft-delete)
--   web.page_sitemap  UPDATE (cascade soft-delete of membership evidence when
--                             a user deletes its parent sitemap document; the
--                             table stays system-written otherwise)
--   web.screenshot    UPDATE (soft-delete stored captures)
--   web.crawl_session UPDATE (soft-delete crawl sessions)
--
-- GRANT is idempotent by nature.

grant insert, update on web.page to authenticated;
grant update on web.page_sitemap to authenticated;
grant update on web.screenshot to authenticated;
grant update on web.crawl_session to authenticated;
