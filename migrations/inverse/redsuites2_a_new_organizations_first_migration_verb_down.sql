-- chair-step: it drops the index RED-SUITES-2 added to history.row_versions. It removes an index
--   and nothing else: no body, no grant, no policy, no row. Read the lock note below before
--   running it on the live database — it is the whole reason this file looks the way it does.
--
-- Running this puts back a full 7 GB scan on the first Migration verb any organization with no
-- history yet ever runs.
--
-- 🚨 WHY THIS IS ONE STATEMENT AND NOT THIRTY (NIGHT-SWEEP, 2026-09-21).
--
-- The obvious inverse of "29 CREATE INDEX CONCURRENTLY plus a parent" is "29 DROP INDEX
-- CONCURRENTLY plus a parent", and that is what this file used to say. POSTGRES REFUSES BOTH
-- HALVES OF IT, measured on the rehearsal branch against the real 29 attached partition indexes:
--
--   drop index concurrently history.row_versions_2025_11_org_latest_idx;
--     ERROR:  cannot drop index history.row_versions_2025_11_org_latest_idx because index
--             history.rv_org_latest_idx requires it
--     HINT:   You can drop index history.rv_org_latest_idx instead.
--
--   drop index concurrently history.rv_org_latest_idx;
--     ERROR:  cannot drop partitioned index "rv_org_latest_idx" concurrently
--
-- An ATTACHED partition index is not a droppable object — it is a part of its parent, and there is
-- no ALTER INDEX ... DETACH PARTITION to separate them. So the ONLY inverse Postgres offers is to
-- drop the parent, which cascades to all 29 children in one catalog operation.
--
-- AND THAT IS SAFE IN THE WINDOW, for a reason worth stating rather than assuming: dropping an
-- index rewrites NO DATA. It takes AccessExclusiveLock on the parent and each partition, unlinks
-- 29 relations in the catalog and returns. What can hurt is WAITING for that lock behind a long
-- read, so the wait is bounded explicitly and the statement FAILS rather than queues — the
-- database's own `ddl_lock_timeout_guard` bounds an unset DROP INDEX to 2s and says so; this file
-- names 5s so the bound is a decision in the file rather than a default it inherited.
--
-- MEASURED on the branch, 2026-09-21, over the real 29-partition index: see the rule-27 run in
-- `v5/handoff-2026-09-20/PROGRESS-NIGHT-SWEEP.md`.
--
-- HOW TO RUN IT — the ordinary frontend route, because after the rewrite above there is no
-- CONCURRENTLY left in it and nothing here needs autocommit (its TWIN still does):
--   pnpm db:apply migrations/inverse/redsuites2_a_new_organizations_first_migration_verb_down.sql \
--     --target branch|production
-- Measured on the branch: applied and ledgered in 578 ms, all 30 index rows gone.
--
-- ITS TWIN: `migrations/campaign/redsuites2_a_new_organizations_first_migration_verb.sql`.

set lock_timeout = '2s';

-- The parent, and with it all 29 attached partition indexes. Catalog-only; no data is rewritten.
drop index if exists history.rv_org_latest_idx;

set lock_timeout = '2s';
