-- chair-step: remove files_coding_session_artifact_idx, which POSTGRESQL CAN NEVER USE for the client read it was built for — a non-leakproof qual cannot be an index condition under RLS — so it is pure write-amplification on the platform's hottest table

-- ============================================================================
-- THE INVERSE OF `files_coding_session_artifact_lookup_index.sql` (CS-27)
--
-- That migration added, CONCURRENTLY, an expression index on
--   (metadata->>'kind', metadata->>'cli_session_id', metadata->>'relative_path')
--   WHERE deleted_at IS NULL
-- to make the coding-session Files tab's read stop timing out. It did not, and
-- it cannot, and the reason is a property of PostgreSQL rather than of the
-- index: `files.files` has RLS enabled, and a qual whose operator is NOT
-- LEAKPROOF may not be evaluated before the security quals — so it can never
-- become an index condition. `jsonb_object_field_text` (`->>`) has
-- `proleakproof = false`. Measured live, same statement, same identity:
--   as `postgres` (no RLS)       Index Scan using files_coding_session_artifact_idx
--                               Index Cond on both JSONB equalities · 2.4 ms
--   as `authenticated` (RLS on)  Index Scan using idx_cld_files_owner — a FULL
--                               walk — with both JSONB equalities demoted into
--                               Filter · cost 3,986,650 · 29,147 ms
-- The control proves it is leakproofness and not the planner's taste: the same
-- read with a LEAKPROOF qual (`uuid_eq` on `created_by`, and a text RANGE on
-- `file_path`) DOES get an Index Cond under identical RLS, and returns in 1.1 ms.
--
-- So the index serves exactly one kind of reader: one that bypasses RLS —
-- `service_role`, or a SECURITY DEFINER body. No such reader queries
-- `files.files` by `metadata->>'cli_session_id'` today: matrx-local's publisher
-- (`app/services/coding_sessions/artifacts.py`) confirms its rows by
-- `file_path`, never by that key. It therefore earns nothing and costs every
-- INSERT and UPDATE on a 158k-row, 335 MB, constantly-written table — the
-- publisher alone writes thousands of rows per session.
--
-- (Two older siblings, `idx_cld_files_derived_from` and
-- `idx_cld_files_variant_key`, are the same shape and equally unusable by any
-- client read; they are NOT dropped here because server-side variant/derivation
-- code does read those keys as `service_role`, where they work. The class is
-- recorded in FOUND_DEFECTS.md.)
--
-- Rehearse on the branch with the same bytes:
--   pnpm db:apply migrations/inverse/files_coding_session_artifact_index_drop.sql --target branch
-- Then, interactively, at production (the runner prints this reason and the
-- whole body, refuses a non-TTY stdin and demands the filename typed back):
--   pnpm db:apply migrations/inverse/files_coding_session_artifact_index_drop.sql --target production
-- ============================================================================


-- ⚠️ A PLAIN `DROP INDEX`, NOT `DROP INDEX CONCURRENTLY`, AND THE REASON IS THE
-- RUNNERS (measured 2026-09-17, CS-30). A file in `migrations/inverse/` is
-- reachable ONLY by the frontend runner, which names the file directly
-- (`pnpm db:apply migrations/inverse/<file> --target production`) — the aidream
-- runner's every glob is non-recursive, so it cannot SEE this directory:
--     uv run python db/apply_migrations.py --source matrx-frontend \
--       --only inverse/<file>  ->  "no migration matches"
--     ... --only <basename>    ->  "no migration matches"
-- And the frontend runner is transactional, so it refuses ANY statement that
-- needs autocommit — `DROP INDEX CONCURRENTLY` included — by name, pointing at
-- the aidream runner that cannot reach the file. So a CONCURRENTLY statement in
-- an inverse file is unapplicable by either sanctioned path; that gap is filed
-- rather than worked around. A plain `DROP INDEX` is not the hazard a plain
-- `CREATE INDEX` is: the build is what takes minutes, the drop is a catalogue
-- delete and an unlink. What it needs is the ACCESS EXCLUSIVE lock for that
-- instant, and `SET LOCAL lock_timeout = '2s'` (the runner sets it too) means a
-- busy table makes this fail FAST instead of queueing in front of live writes.
-- Re-run it; never widen the wait.

SET LOCAL lock_timeout = '2s';

DROP INDEX IF EXISTS files.files_coding_session_artifact_idx;
