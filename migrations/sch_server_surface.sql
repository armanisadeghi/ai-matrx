-- migrations/sch_server_surface.sql
--
-- Pins the valid set of surface values on `sch_task.surfaces` with a CHECK
-- constraint. Adds 'server' to the canonical list — this is the surface that
-- aidream's matrx-scheduler claims tasks under. The Chrome extension continues
-- to use 'chrome-extension-chat'; 'web' stays in the list as an
-- observer-and-create surface (matrx-frontend doesn't actually execute).
--
-- Without a CHECK, anything could land in surfaces[] and silently never be
-- claimed by any executor — a class of "ghost task" bugs. We close it now.
--
-- The check uses `<@` (array contained-in) so any subset of the canonical
-- list is valid.
--
-- Related plan: ~/.claude/plans/please-review-this-so-squishy-tome.md
-- Spec:        docs/SCHEDULING.md §4 (Surfaces)

BEGIN;

-- Canonical surface values (also mirrored in features/scheduling/constants/surfaces.ts).
--
--   'any'                  → first eligible online surface picks it up
--   'chrome-extension-chat' → matrx-extend Chrome extension
--   'desktop'              → matrx-local Tauri app (future)
--   'web'                  → aimatrx.com Next.js app (observe-and-create only in v1)
--   'mobile'               → future mobile app
--   'sandbox'              → sandbox runner (future)
--   'server'               → aidream Python backend (matrx-scheduler) — NEW

ALTER TABLE public.sch_task
  DROP CONSTRAINT IF EXISTS sch_task_surfaces_chk;

ALTER TABLE public.sch_task
  ADD CONSTRAINT sch_task_surfaces_chk
  CHECK (
    cardinality(surfaces) > 0
    AND surfaces <@ ARRAY[
      'any',
      'chrome-extension-chat',
      'desktop',
      'web',
      'mobile',
      'sandbox',
      'server'
    ]::text[]
  );

COMMENT ON COLUMN public.sch_task.surfaces IS
  'Which surfaces are allowed to claim/execute this task. ''any'' = first eligible online. ''server'' = aidream Python (matrx-scheduler). ''chrome-extension-chat'' = matrx-extend. Whitelist-enforced by sch_task_surfaces_chk.';

COMMIT;
