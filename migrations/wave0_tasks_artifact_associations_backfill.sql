-- Wave 0 (artifact system): converge pre-existing auto-created task links onto
-- the canonical ctx_task_associations bridge.
--
-- Before this build, the tasks artifact adapter AUTO-CREATED ctx_tasks on
-- materialize and recorded the originating artifact only inline in
-- settings.source_artifact_id (a one-off linkage with no bridge row). Auto-create
-- is now removed (vision R7: tasks are a tracked proposal + explicit Convert),
-- and tasks link via ctx_task_associations(entity_type='artifact',
-- entity_id=<canvas_items.id>) — the same generic bridge every other surface
-- uses (create_tasks_bulk / get_tasks_for_entity / TaskChipRow).
--
-- This backfills association rows for the already auto-created tasks so their
-- artifacts correctly render as already-converted (and never offer a duplicate
-- Convert that would re-create the same tasks). User data is preserved — the
-- tasks and their settings are left intact; only the missing bridge rows are added.
--
-- Idempotent: re-running is a no-op (ON CONFLICT (task_id, entity_type, entity_id)).
-- migrate: data-only backfill (DML); safe to re-apply.

insert into public.ctx_task_associations (task_id, entity_type, entity_id, label, metadata, created_by)
select
  t.id,
  'artifact',
  (t.settings->>'source_artifact_id')::uuid,
  t.title,
  jsonb_build_object('backfilled', true, 'source', 'wave0_tasks_artifact_convergence'),
  t.user_id
from public.ctx_tasks t
where t.settings ? 'source_artifact_id'
  and t.settings->>'source_artifact_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (task_id, entity_type, entity_id) do nothing;
