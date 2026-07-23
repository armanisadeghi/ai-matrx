-- Agent tool assignments must degrade safely when a tool is retired, deleted,
-- mistyped, or imported from another environment.
--
-- The old agent.enforce_definition_tool_references trigger raised 23503 for any
-- missing UUID. That made every agent writer capable of crashing its surrounding
-- UI: manual creation, imports, template use, duplication, version promotion,
-- browser saves, and server/admin inserts.
--
-- This trigger is the shared database boundary for every writer. It retains only
-- live, active tool.definition rows, preserves request order, and emits a WARNING
-- whenever it repairs an assignment. The trigger name intentionally sorts before
-- trg_agx_agent_snapshot_version so repaired tools, never rejected tools, enter a
-- new version snapshot.
--
-- This migration also removes the forbidden project/task FK-mirroring triggers
-- discovered on the focused agent.definition table. Existing relationships were
-- already mirrored into platform.associations; the idempotent backfill below
-- closes any gap before the triggers are removed. project_id remains temporarily
-- as a non-authoritative compatibility column, but it no longer has a project FK.

CREATE OR REPLACE FUNCTION agent.sanitize_definition_tool_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  requested_tool_ids uuid[] := coalesce(NEW.tools, ARRAY[]::uuid[]);
  accepted_tool_ids uuid[];
  rejected_tool_ids uuid[];
  duplicate_tool_ids uuid[];
BEGIN
  -- Lock accepted rows against a concurrent hard delete until this write commits.
  PERFORM 1
  FROM tool.definition AS tool_definition
  WHERE tool_definition.id = ANY(requested_tool_ids)
    AND tool_definition.is_active
    AND tool_definition.deleted_at IS NULL
  FOR KEY SHARE;

  WITH requested AS (
    SELECT
      expanded.tool_id,
      min(expanded.ordinality) AS ordinality,
      count(*) AS occurrences
    FROM unnest(requested_tool_ids) WITH ORDINALITY
      AS expanded(tool_id, ordinality)
    GROUP BY expanded.tool_id
  )
  SELECT
    coalesce(
      array_agg(requested.tool_id ORDER BY requested.ordinality)
        FILTER (WHERE tool_definition.id IS NOT NULL),
      ARRAY[]::uuid[]
    ),
    array_agg(requested.tool_id ORDER BY requested.ordinality)
      FILTER (WHERE tool_definition.id IS NULL),
    array_agg(requested.tool_id ORDER BY requested.ordinality)
      FILTER (WHERE requested.occurrences > 1)
  INTO accepted_tool_ids, rejected_tool_ids, duplicate_tool_ids
  FROM requested
  LEFT JOIN tool.definition AS tool_definition
    ON tool_definition.id = requested.tool_id
   AND tool_definition.is_active
   AND tool_definition.deleted_at IS NULL;

  IF rejected_tool_ids IS NOT NULL OR duplicate_tool_ids IS NOT NULL THEN
    RAISE WARNING
      '[agent-tool-sanitizer] agent % referenced unavailable tool ids % or duplicate tool ids %; repaired the assignment',
      NEW.id,
      rejected_tool_ids,
      duplicate_tool_ids;
  END IF;

  NEW.tools := accepted_tool_ids;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_definition_tool_references
  ON agent.definition;
DROP TRIGGER IF EXISTS _sanitize_definition_tool_references
  ON agent.definition;

CREATE TRIGGER _sanitize_definition_tool_references
  BEFORE INSERT OR UPDATE OF tools ON agent.definition
  FOR EACH ROW
  EXECUTE FUNCTION agent.sanitize_definition_tool_references();

DROP FUNCTION IF EXISTS agent.enforce_definition_tool_references();

-- Backfill the optional canonical edges before retiring the legacy mirrors.
INSERT INTO platform.associations (
  source_type,
  source_id,
  target_type,
  target_id,
  organization_id,
  role,
  created_by
)
SELECT
  'agent',
  definition.id,
  'project',
  definition.project_id,
  definition.organization_id,
  NULL,
  definition.created_by
FROM agent.definition AS definition
WHERE definition.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform.associations AS association
    WHERE association.source_type = 'agent'
      AND association.source_id = definition.id
      AND association.target_type = 'project'
      AND association.target_id = definition.project_id
      AND association.role IS NULL
  );

INSERT INTO platform.associations (
  source_type,
  source_id,
  target_type,
  target_id,
  organization_id,
  role,
  created_by
)
SELECT
  'agent',
  definition.id,
  'task',
  definition.task_id,
  definition.organization_id,
  NULL,
  definition.created_by
FROM agent.definition AS definition
WHERE definition.task_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform.associations AS association
    WHERE association.source_type = 'agent'
      AND association.source_id = definition.id
      AND association.target_type = 'task'
      AND association.target_id = definition.task_id
      AND association.role IS NULL
  );

DROP TRIGGER IF EXISTS _mirror_proj ON agent.definition;
DROP TRIGGER IF EXISTS _mirror_task ON agent.definition;
ALTER TABLE agent.definition
  DROP CONSTRAINT IF EXISTS agx_agent_project_fk;
