-- soft_delete_partial_unique_indexes_context.sql   (DD / B-18, Q84)
--
-- THE DEFECT: three unique indexes on the scopes system count soft-deleted rows.
-- `deleted_at IS NULL` means live (db-rules FEATURE.md §8), and every screen
-- filters on it -- so after a user removes a scope type called "Region" it is
-- gone everywhere they can look, and creating "Region" again fails with
--     duplicate key value violates unique constraint "unique_type_per_org"
-- naming a row nobody can see. There is no way out of that from the UI: the
-- name is held forever by an invisible row.
--
-- PROVEN RED on the live database 2026-09-11, each inside one rolled-back
-- transaction (create X -> set deleted_at -> create X again):
--   unique_type_per_org      RED  duplicate key value violates unique constraint "unique_type_per_org"
--   idx_scope_unique_top     RED  duplicate key value violates unique constraint "idx_scope_unique_top"
--   idx_scope_unique_nested  RED  duplicate key value violates unique constraint "idx_scope_unique_nested"
--
-- THE FIX: add `deleted_at IS NULL` to each predicate, which is the shape the
-- two indexes beside them already use -- `ctx_scope_types_org_slug_uniq` and
-- `ctx_scopes_type_slug_uniq` were both written partial and are untouched here.
-- Uniqueness among LIVE rows is unchanged; only removed rows stop blocking.
--
-- NOT NARROWING. A partial unique index accepts strictly more rows than the
-- total one it replaces, so no write that succeeds today can start failing
-- (db-rules §6: narrowing is as serious as widening). Current population:
-- context.scope_types 30 rows / 0 removed, context.scopes 96 rows / 0 removed,
-- so no duplicate can appear at build time either.
--
-- `unique_type_per_org` is a UNIQUE CONSTRAINT, not a bare index -- a constraint
-- cannot carry a predicate, so it becomes an index of the same name. No foreign
-- key references it (checked live: zero pg_constraint rows with confrelid =
-- 'context.scope_types' using those columns), so dropping the constraint drops
-- nothing else.
--
-- Both tables are tiny, so plain CREATE INDEX inside the transaction is correct
-- here; CONCURRENTLY is for hot tables and cannot run in a transaction anyway.
--
-- THE CLASS IS MUCH BIGGER: 257 unique indexes across 222 registered
-- soft-deletable tables have no `deleted_at IS NULL` predicate. The rest are
-- censused and frozen by `pnpm check:soft-delete-unique`
-- (scripts/check-soft-delete-unique.ts + its baseline), which fails on any NEW
-- one. They are not fixed here: each needs its own read of whether a removed row
-- should keep holding its key, and several are deliberate (an idempotency key or
-- a provider handle must stay unique forever, removed or not).
--
-- Idempotent. Safe to re-run.

-- `pnpm db:apply` sends this whole file in ONE transactional call, so the file
-- carries no BEGIN/COMMIT of its own (EXECUTE of transaction commands is not
-- implemented on that transport).

-- 1/3 -- context.scope_types (organization_id, label_singular)
ALTER TABLE context.scope_types DROP CONSTRAINT IF EXISTS unique_type_per_org;
DROP INDEX IF EXISTS context.unique_type_per_org;
CREATE UNIQUE INDEX unique_type_per_org
  ON context.scope_types (organization_id, label_singular)
  WHERE deleted_at IS NULL;
COMMENT ON INDEX context.unique_type_per_org IS
  'One live scope type per organization+label. Partial on deleted_at so a removed type stops holding its name (B-18, 2026-09-11).';

-- 2/3 -- context.scopes, top-level
DROP INDEX IF EXISTS context.idx_scope_unique_top;
CREATE UNIQUE INDEX idx_scope_unique_top
  ON context.scopes (organization_id, scope_type_id, name)
  WHERE parent_scope_id IS NULL AND deleted_at IS NULL;
COMMENT ON INDEX context.idx_scope_unique_top IS
  'One live top-level scope per organization+type+name. Partial on deleted_at (B-18, 2026-09-11).';

-- 3/3 -- context.scopes, nested
DROP INDEX IF EXISTS context.idx_scope_unique_nested;
CREATE UNIQUE INDEX idx_scope_unique_nested
  ON context.scopes (organization_id, scope_type_id, parent_scope_id, name)
  WHERE parent_scope_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON INDEX context.idx_scope_unique_nested IS
  'One live nested scope per organization+type+parent+name. Partial on deleted_at (B-18, 2026-09-11).';

