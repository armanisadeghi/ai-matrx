-- Conversation project membership is association-backed. The physical
-- chat.conversation.project_id column was removed, so the IAM structural
-- parent registry must not try to follow it during RLS evaluation.
DELETE FROM platform.entity_relationships
WHERE child_type = 'conversation'
  AND parent_type = 'project'
  AND fk_column = 'project_id'
  AND kind = 'containment';

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM platform.entity_relationships
    WHERE child_type = 'conversation'
      AND parent_type = 'project'
      AND fk_column = 'project_id'
  ) THEN
    RAISE EXCEPTION 'stale conversation.project_id relationship remains registered';
  END IF;
END
$migration$;
