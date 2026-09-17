-- ============================================================================
-- THE ARTIFACTS PANEL 500'd ABOUT ONE READ IN FOUR (2026-09-17, CS-27)
--
-- `features/ai-work/conversations/artifacts/service.ts` is the coding-session
-- Files tab's only read. It asks `files.files` for one session's artifacts:
--     metadata->>'kind'           = 'coding_session_artifact'
--     metadata->>'cli_session_id' = <provider session id>
--     deleted_at IS NULL
--     ORDER BY metadata->>'relative_path'
-- No index covered either JSONB filter, so the planner fell back to a full walk
-- of `idx_cld_files_owner` — every one of the table's ~158k live rows — and
-- evaluated the `files.files` `std_select` RLS predicate (a ~180-subplan OR
-- chain) on each one before the two metadata equalities could throw it away.
--
-- Measured live on production as admin@admin.com, one session (5,984 artifact
-- rows stored, 338 visible to that identity):
--   EXPLAIN ANALYZE ......... 29,147 ms, 720,494 shared buffers hit
--   12-20 real PostgREST GETs  15 ok / 5 HTTP 500, every failure
--                              `57014 canceling statement due to statement
--                              timeout` (role `authenticated` = 8 s), the
--                              successes 5.3-8.3 s — i.e. the read sat ON the
--                              ceiling and which side it landed on was cache
--                              weather. The panel's honest "We couldn't load
--                              this session's artifacts / Try again" is what a
--                              person saw roughly one open in four.
--
-- The fix is the plan, never the ceiling: the two equalities plus the sort key
-- become one btree so the scan yields ~6k candidate rows instead of 158k and
-- the ORDER BY is answered by index order (no Sort). RLS still runs per
-- surviving row — measured cost of that predicate over 5,310 rows reached by an
-- index condition, same connection, same identity: 184 ms — so the whole read
-- lands in the low hundreds of milliseconds against an 8 s budget.
--
-- Expression keys, not a partial predicate on `kind`: PostgREST sends the
-- filter values as bound parameters, and a generic plan cannot prove a
-- parameter equals the constant in an index's WHERE clause. `deleted_at IS
-- NULL` is a literal the query itself carries, so that one stays a predicate
-- and keeps the index off soft-deleted rows.
--
-- Built CONCURRENTLY: `files.files` is hot (every upload, every publisher
-- mirror) — CLAUDE.md, index hot tables only with CONCURRENTLY. Applied with
-- `python db/apply_migrations.py --source matrx-frontend` from aidream, the
-- autocommit path; `pnpm db:apply` refuses CONCURRENTLY by name.
--
-- Census (the sibling JSON filters this class could hide in): the whole
-- frontend has exactly one other `metadata->>` filter over a big table —
-- `features/pdf/scanner/processing.ts` on `docproc.processed_documents` — and
-- it is bounded by `owner_id` and `limit 12`, so it never leaves the owner
-- index. No other read filters `files.files` by a JSONB path.
-- ⚠️ IF THIS FILE FAILS, DROP WHAT IT LEFT BEHIND BEFORE RE-RUNNING. A
-- `CREATE INDEX CONCURRENTLY` that does not finish leaves an INVALID index that
-- Postgres still maintains on every write, and `IF NOT EXISTS` then skips it
-- forever. It happened on the first attempt here: `files.files` is written
-- constantly, the build could not get its ShareUpdateExclusiveLock inside the
-- 8 s `lock_timeout` this connection inherits, and the run ended with
-- `files_coding_session_artifact_idx` present, `indisvalid = false` and no
-- ledger row. Check with
--     select c.relname, i.indisvalid from pg_class c
--       join pg_index i on i.indexrelid = c.oid
--      where c.relname = 'files_coding_session_artifact_idx';
-- and drop it if `indisvalid` is false. Hence the explicit `SET lock_timeout`
-- below: the build itself is online, but it needs a moment of quiet to start,
-- and 8 s of a hot table is not a moment of quiet.
-- ============================================================================

-- 2 s, because a DB-wide guard refuses maintenance DDL on an autocommit
-- migration session whose `lock_timeout` is zero or above 2000 ms — an online
-- build must never sit in the lock queue of a table every client writes. So the
-- attempt fails FAST rather than waiting, and the answer to a busy minute is to
-- drop the invalid leftover and re-run, not to widen the wait. (`SET` of
-- lock_timeout is an enumerated additive statement — migrations/JUDGMENT.md §4
-- — and lasts for this connection only.)
SET lock_timeout = '2s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS files_coding_session_artifact_idx
  ON files.files (
    (metadata ->> 'kind'),
    (metadata ->> 'cli_session_id'),
    (metadata ->> 'relative_path')
  )
  WHERE deleted_at IS NULL;
