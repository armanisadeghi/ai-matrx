-- Fix: task pairs for the page workspace were registered backwards.
-- The task system's canonical edge direction is entity -> task (the task is
-- the container/target — see conversation->task, note->task), and
-- trg_associations_auto_orient REJECTS reversed writes rather than flipping.
delete from platform.association_types where source_type='task' and target_type in ('web_page','web_screenshot');

insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes) values
  ('web_page',       'task', 'target', 'viewer', true, 'Page workspace — a canonical page a task is about (entity->task canonical direction). 2026-07-27'),
  ('web_screenshot', 'task', 'target', 'viewer', true, 'Page workspace — a capture a task is about (entity->task canonical direction). 2026-07-27')
on conflict do nothing;
