-- ============================================================
-- War Room — tile FLAVOR + project association (Epic Phase 5)
-- ============================================================
-- Adds two columns to ctx_war_room_tiles:
--   • flavor      — what the tile primarily represents:
--                     'thread'  = the generic multi-tab tile (today's default)
--                     'task'    = task-anchored (uses the existing task_id)
--                     'project' = project-anchored (uses the new project_id; its
--                                 Task tab lists/creates the project's tasks)
--   • project_id  — direct FK to ctx_projects, MIRRORING ctx_tasks.project_id so
--                   War Room is a VIEW onto the app-wide project↔task link, not a
--                   parallel store. Tasks created in a project tile carry this id
--                   through the existing ctx_tasks.project_id (no new association
--                   mechanism — a task created here shows up in the project
--                   everywhere else, and vice-versa).
--
-- Association invariant (enforced in app logic, documented here for the next
-- agent):
--   A room (ctx_war_room_sessions.project_id — already exists) and its tiles can
--   never hold CONFLICTING projects. If the SESSION has a project, every tile is
--   NULL (inherits it) or equal to it. Per-tile projects (different projects on
--   different tiles) are allowed ONLY when the session has no project. The
--   conflict resolution when a user adds a tile with a different project:
--   "switch to per-thread" stamps the room's project onto every existing tile,
--   clears the room's project, and gives the new tile its own; "keep room
--   project" joins the new tile to the room's project instead.
--
-- Idempotent. No RLS change: tile access stays gated by the parent session; a
-- project tile's tasks are gated by ctx_tasks' own RLS when the Task tab queries
-- them (WHERE project_id = $1). No link table — a tile represents at most ONE
-- project, so a 1:1 FK is the right shape (unlike the many audio/note links).
-- ============================================================

ALTER TABLE public.ctx_war_room_tiles
  ADD COLUMN IF NOT EXISTS flavor text NOT NULL DEFAULT 'thread'
    CHECK (flavor IN ('thread','task','project')),
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES public.ctx_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ctx_war_room_tiles_project
  ON public.ctx_war_room_tiles(project_id) WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.ctx_war_room_tiles.flavor IS
  'What the tile represents: thread (generic, default) | task (task-anchored, uses task_id) | project (project-anchored, uses project_id). UI render/intent discriminator; extend via the CHECK like active_tab.';
COMMENT ON COLUMN public.ctx_war_room_tiles.project_id IS
  'Optional FK to ctx_projects for a project-flavor tile. Mirrors ctx_tasks.project_id so tasks created here auto-associate app-wide. INVARIANT: if the parent session has a project_id, this is NULL or equal to it (no conflicting room/tile projects).';
