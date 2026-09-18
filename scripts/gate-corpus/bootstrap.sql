-- ============================================================================
-- BRANCH BOOTSTRAP — the one-time preparation the throwaway branch needs before
-- the corpus is seeded. Run on the branch, immediately before seed.sql.
--
-- It is separate from seed.sql on purpose: a DDL change and the statements that
-- depend on it cannot travel in the same simple-query batch (a trigger's cached
-- plan does not see it — measured 2026-09-15 against this branch), so the
-- runner sends this file as its own query.
-- ============================================================================

-- Promoting an admin (arm 9's principal) fires `admins_audit_trigger`, which
-- writes `admin.admin_audit_log` with no `organization_id` — a NOT NULL column
-- filled from a request session that a seed does not have. Giving the column a
-- default is refused by `ddl_guard`, and correctly so: THE NO-DB-ASSIGNED-ORG
-- LAW says no default or trigger may choose an organization. So the audit
-- trigger stands down for the seed and seed.sql puts it back on its last line.
alter table admin.admins disable trigger admins_audit_trigger;
