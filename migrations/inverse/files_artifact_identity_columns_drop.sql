-- chair-step: remove the two artifact-identity columns and their index from files.files — the inverse of CS-30, kept so the change is reversible; a DROP is never additive and never swept

-- ============================================================================
-- THE INVERSE OF CS-30 (2026-09-17)
--
-- Undoes, in reverse order:
--   20260917_files_artifact_identity_backfill_and_index.sql  (index + backfill)
--   20260917_files_artifact_identity_columns.sql             (the two columns)
--
-- Dropping the columns drops the data in them, which is safe ONLY because every
-- value in them is a copy of a JSONB key that is still there:
--     artifact_kind        = metadata->>'kind'
--     provider_session_id  = metadata->>'cli_session_id'
-- Nothing is the sole home of anything. What DOES break the moment this runs is
-- the coding-session Files tab: `features/ai-work/conversations/artifacts/
-- service.ts` filters by these columns, and with them gone the panel's read
-- errors loudly (an unknown column is a 400, not a silent empty list). So this
-- inverse belongs with a frontend revert, never on its own.
--
-- `DROP COLUMN` is metadata-only (no rewrite) but does need the table's ACCESS
-- EXCLUSIVE lock for a moment — hence the 2 s ceiling, which fails fast rather
-- than queueing behind live writes. Re-run it; never widen the wait.
--
-- Rehearse on the branch with the same bytes, after the up, then run it at
-- production — interactively, because the runner prints the reason and the whole
-- body, refuses a non-TTY stdin and demands the filename typed back:
--   pnpm db:apply migrations/inverse/files_artifact_identity_columns_drop.sql --target branch
--   pnpm db:apply migrations/inverse/files_artifact_identity_columns_drop.sql --target production
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

DROP INDEX IF EXISTS files.files_artifact_provider_session_idx;

ALTER TABLE files.files
  DROP COLUMN IF EXISTS provider_session_id,
  DROP COLUMN IF EXISTS artifact_kind;
