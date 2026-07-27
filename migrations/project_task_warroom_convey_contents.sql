-- Project / Task / War Room convey access to their (non-personal) contents (2026-07-23)
--
-- Arman's directive: "A project and task DEFINITELY convey access to everything inside, at the
-- member's level (read+edit). When a user adds something to an org/project/task/war room, push
-- that access down so they don't hit permission errors inside." The axis is PERSONAL vs
-- NON-PERSONAL — personal things (chats) stay private via the `visibility='personal'` valve; not-
-- personal things (files, tasks, projects, documents, data stores) convey.
--
-- The platform ALREADY conveys project/task membership → agents, apps, tasks, conversations,
-- skills, notes, research topics (FK-containment + existing association edges). The FK path is
-- gated on the item's `visibility >= internal`, so a personal chat attached to a project does NOT
-- convey — that is the personal valve, already working. This migration closes the remaining gap:
-- files, data stores, working documents, and processed documents had NO conveyance path to a
-- project/task/war room at all (files live in folders; folders don't link to projects). Zero such
-- association edges exist today, so this is forward-looking — nothing is suddenly exposed; when the
-- product attaches one of these to a container, it conveys at the member's level.
--
-- All rows: container is the TARGET (little→big: item→container), conveys_max='editor'
-- (read+edit), matching the existing note→project / note→task editor edges. Conversations are
-- deliberately NOT added — chats stay personal by design.
--
-- Registering an association_types rule auto-recomputes platform.reachability via the
-- statement-level trigger trg_association_types_reachability. No backfill needed.

insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
values
  -- project contains …
  ('file',               'project',  'target', 'editor', true, 'project conveys editor to attached files (2026-07-23 push-down)'),
  ('data_store',         'project',  'target', 'editor', true, 'project conveys editor to attached data stores'),
  ('working_document',   'project',  'target', 'editor', true, 'project conveys editor to attached working documents'),
  ('processed_document', 'project',  'target', 'editor', true, 'project conveys editor to attached processed documents'),
  ('task',               'project',  'target', 'editor', true, 'project conveys editor to its tasks (association mirror of the task.project_id FK — enables transitive project→task→contents reachability)'),
  -- task contains …
  ('file',               'task',     'target', 'editor', true, 'task conveys editor to attached files'),
  ('data_store',         'task',     'target', 'editor', true, 'task conveys editor to attached data stores'),
  ('working_document',   'task',     'target', 'editor', true, 'task conveys editor to attached working documents'),
  ('processed_document', 'task',     'target', 'editor', true, 'task conveys editor to attached processed documents'),
  -- war room contains … (already conveys to its projects/threads; add directly-attached tiles)
  ('file',               'war_room', 'target', 'editor', true, 'war room conveys editor to attached files (audio/media tiles)'),
  ('data_store',         'war_room', 'target', 'editor', true, 'war room conveys editor to attached data stores'),
  ('working_document',   'war_room', 'target', 'editor', true, 'war room conveys editor to attached working documents'),
  ('processed_document', 'war_room', 'target', 'editor', true, 'war room conveys editor to attached processed documents'),
  ('note',               'war_room', 'target', 'editor', true, 'war room conveys editor to attached notes (note tiles)'),
  ('task',               'war_room', 'target', 'editor', true, 'war room conveys editor to attached tasks (task tiles)')
on conflict (source_type, target_type) do update
  set container_side = excluded.container_side,
      conveys_max    = excluded.conveys_max,
      is_active      = true,
      notes          = excluded.notes,
      updated_at     = now();
