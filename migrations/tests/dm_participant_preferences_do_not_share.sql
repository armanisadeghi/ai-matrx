-- Run with an operator connection. Everything, including audit writes, rolls back.
-- Regression: broad participant sync makes a recipient's receipt throw 42501.
BEGIN;
CREATE TEMP TABLE dm_preference_probe AS
SELECT p.id, p.conversation_id, p.user_id
FROM communication.dm_conversation_participants p
JOIN communication.dm_conversations c ON c.id=p.conversation_id
WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
  AND p.user_id IS DISTINCT FROM c.created_by
  AND EXISTS (SELECT 1 FROM iam.permissions g WHERE g.resource_type='dm_conversation'
    AND g.resource_id=c.id AND g.granted_to_user_id=p.user_id
    AND g.status='active' AND g.permission_level >= 'editor')
ORDER BY p.id LIMIT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM dm_preference_probe) THEN
    RAISE EXCEPTION 'A live non-owner participant fixture is required; the guard did not run.';
  END IF;
END $$;
CREATE TEMP TABLE dm_grants_before AS
SELECT to_jsonb(g) AS row FROM iam.permissions g
WHERE g.resource_type='dm_conversation'
  AND g.resource_id=(SELECT conversation_id FROM dm_preference_probe);
GRANT SELECT ON dm_preference_probe, dm_grants_before TO authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated')::text,true)
FROM dm_preference_probe;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_id uuid; v_read timestamptz := statement_timestamp(); BEGIN
  UPDATE communication.dm_conversation_participants
  SET last_read_at=v_read, is_muted=true, is_archived=true
  WHERE id=(SELECT id FROM dm_preference_probe)
  RETURNING id INTO v_id;
  IF v_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM communication.dm_conversation_participants
    WHERE id=v_id AND last_read_at=v_read AND is_muted AND is_archived
  ) THEN RAISE EXCEPTION 'Recipient preferences did not persist'; END IF;
  -- Same membership values, including a role write, still must not share.
  UPDATE communication.dm_conversation_participants
  SET user_id=user_id, conversation_id=conversation_id, deleted_at=deleted_at, role=role,
      is_muted=false, is_archived=false
  WHERE id=v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unchanged membership write did not persist'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (
    (SELECT row FROM dm_grants_before EXCEPT
     SELECT to_jsonb(g) FROM iam.permissions g WHERE g.resource_type='dm_conversation'
       AND g.resource_id=(SELECT conversation_id FROM dm_preference_probe))
    UNION ALL
    (SELECT to_jsonb(g) FROM iam.permissions g WHERE g.resource_type='dm_conversation'
       AND g.resource_id=(SELECT conversation_id FROM dm_preference_probe)
     EXCEPT SELECT row FROM dm_grants_before)
  ) THEN RAISE EXCEPTION 'A preference write mutated access grants'; END IF;
END $$;
ROLLBACK;
