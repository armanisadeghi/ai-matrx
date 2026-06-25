-- War Room ANCHOR — the thread/room's primary subject as a polymorphic pair.
--
-- anchor_type ('task' | 'project' | 'canvas') + anchor_id (uuid, null for canvas)
-- on ctx_war_room_tiles (thread) AND ctx_war_room_sessions (room). The anchor is a
-- SINGLE, exactly-one subject — deliberately NOT a platform.associations edge — so
-- there is never a "which edge is the official one" ambiguity: attached
-- tasks/projects are ordinary association edges; the anchor is the row's own
-- columns. "Everything for this thread" = the anchor (from the row) UNION the
-- edges (from associations), with the anchor flagged distinctly.
--
-- Transitional + idempotent: the columns are NULLABLE and the CHECK ALLOWS NULL so
-- the current frontend (which still writes task_id / project_id) keeps working
-- untouched; the backfill seeds existing rows. A later migration tightens
-- anchor_type to NOT NULL DEFAULT 'canvas' once the code writes anchors directly.
-- Re-appliable: ADD COLUMN IF NOT EXISTS, guarded CHECK creation, backfill UPDATEs
-- scoped to `anchor_type IS NULL`.

alter table public.ctx_war_room_tiles
  add column if not exists anchor_type text,
  add column if not exists anchor_id uuid;

alter table public.ctx_war_room_sessions
  add column if not exists anchor_type text,
  add column if not exists anchor_id uuid;

-- Lenient CHECK: NULL allowed during the transition; otherwise canvas⇒no id,
-- task/project⇒an id.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ctx_wrt_anchor_chk') then
    alter table public.ctx_war_room_tiles add constraint ctx_wrt_anchor_chk check (
      anchor_type is null
      or (anchor_type = 'canvas' and anchor_id is null)
      or (anchor_type in ('task','project') and anchor_id is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ctx_wrs_anchor_chk') then
    alter table public.ctx_war_room_sessions add constraint ctx_wrs_anchor_chk check (
      anchor_type is null
      or (anchor_type = 'canvas' and anchor_id is null)
      or (anchor_type in ('task','project') and anchor_id is not null)
    );
  end if;
end $$;

-- Backfill existing rows (only where the anchor isn't set). Tiles: task wins, else
-- project, else canvas (data-verified: 0 tiles carry BOTH task_id and project_id,
-- so precedence is unambiguous). Sessions: project, else canvas.
update public.ctx_war_room_tiles
  set anchor_type = 'task', anchor_id = task_id
  where anchor_type is null and task_id is not null;
update public.ctx_war_room_tiles
  set anchor_type = 'project', anchor_id = project_id
  where anchor_type is null and project_id is not null;
update public.ctx_war_room_tiles
  set anchor_type = 'canvas', anchor_id = null
  where anchor_type is null and task_id is null and project_id is null;

update public.ctx_war_room_sessions
  set anchor_type = 'project', anchor_id = project_id
  where anchor_type is null and project_id is not null;
update public.ctx_war_room_sessions
  set anchor_type = 'canvas', anchor_id = null
  where anchor_type is null and project_id is null;
