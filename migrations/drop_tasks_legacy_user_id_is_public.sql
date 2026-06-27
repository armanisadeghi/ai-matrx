-- Step 2 of teardown: drop workspace.tasks legacy columns user_id, is_public.
-- Verified before drop: 0 functions, 0 policies, FE fully repointed; user_id==created_by and
-- is_public==(visibility='public') for all rows (bridge-enforced, 0 mismatch). Tested after:
-- read path (dashboard/full_context/task_associations) + write path (create + make_public/private).
-- ROLLBACK (clean, data-lossless): re-add columns, backfill user_id=created_by /
-- is_public=(visibility='public'), recreate the _tasks_canonical_bridge trigger.
DROP TRIGGER IF EXISTS tasks_canonical_bridge ON workspace.tasks;
DROP FUNCTION IF EXISTS public._tasks_canonical_bridge();
ALTER TABLE workspace.tasks DROP COLUMN user_id;
ALTER TABLE workspace.tasks DROP COLUMN is_public;
