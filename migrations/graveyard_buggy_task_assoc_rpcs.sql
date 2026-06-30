-- graveyard_buggy_task_assoc_rpcs.sql
--
-- Retires the two redundant + BROKEN per-entity task-association RPCs. Both
-- hand-rolled an insert into platform.associations with a 4-column
--   ON CONFLICT (source_type, source_id, target_type, target_id)
-- that matches NO unique index — the real constraint is the 5-tuple incl. `role`
-- (associations_unique) — so every entity-branch call threw 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT specification").
--
-- They are superseded by the generic `assoc_add` primitive composed in typed
-- app helpers (features/scopes/service/associationsService + associationHelpers,
-- and features/tasks/redux/taskAssociationsSlice). No code calls these RPCs after
-- this migration. The denormalized reader `get_task_associations` is KEPT (it
-- joins edges to entity tables for previews — not redundant).
--
-- Idempotent (DROP ... IF EXISTS). Reversible from git history if ever needed.

drop function if exists public.create_task_with_association(
  text, text, uuid, uuid, text, date, uuid[], text, uuid, text, jsonb
);

drop function if exists public.associate_with_task(
  uuid, text, uuid, text, jsonb
);
