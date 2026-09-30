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
GRANT SELECT ON dm_preference_probe TO authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated')::text,true) FROM dm_preference_probe;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_id uuid := (SELECT id FROM dm_preference_probe); v_at timestamptz := statement_timestamp()-interval '1 minute'; BEGIN
 UPDATE communication.dm_conversation_participants SET last_read_at=v_at WHERE id=v_id RETURNING last_read_at INTO v_at;
 UPDATE communication.dm_conversation_participants SET last_read_at=v_at-interval '10 minutes' WHERE id=v_id;
 IF NOT EXISTS(SELECT 1 FROM communication.dm_conversation_participants WHERE id=v_id AND last_read_at=v_at) THEN
   RAISE EXCEPTION 'A stale receipt moved the durable boundary backwards';
 END IF;
 UPDATE communication.dm_conversation_participants SET last_read_at=NULL WHERE id=v_id;
 IF NOT EXISTS(SELECT 1 FROM communication.dm_conversation_participants WHERE id=v_id AND last_read_at=v_at) THEN
   RAISE EXCEPTION 'A NULL receipt erased the durable boundary';
 END IF;
 UPDATE communication.dm_conversation_participants SET last_read_at='2099-01-01' WHERE id=v_id;
 IF NOT EXISTS(SELECT 1 FROM communication.dm_conversation_participants WHERE id=v_id AND last_read_at BETWEEN statement_timestamp() AND clock_timestamp()) THEN
   RAISE EXCEPTION 'A future device clock marked unseen future messages read';
 END IF;
END $$;
RESET ROLE;
CREATE TEMP TABLE dm_initial_receipt_probe AS
SELECT c.id AS conversation_id, c.created_by AS owner_id, p.organization_id,
 (SELECT u.id FROM auth.users u WHERE NOT EXISTS
   (SELECT 1 FROM communication.dm_conversation_participants existing
     WHERE existing.conversation_id=c.id AND existing.user_id=u.id)
  ORDER BY u.id LIMIT 1) AS recipient_id
FROM dm_preference_probe probe
JOIN communication.dm_conversations c ON c.id=probe.conversation_id
JOIN communication.dm_conversation_participants p ON p.id=probe.id;
GRANT SELECT ON dm_initial_receipt_probe TO authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true)
FROM dm_initial_receipt_probe;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_at timestamptz; BEGIN
 INSERT INTO communication.dm_conversation_participants
 (conversation_id,user_id,organization_id,created_by,role,last_read_at)
 SELECT conversation_id,recipient_id,organization_id,owner_id,'member','2099-01-01'::timestamptz
 FROM dm_initial_receipt_probe RETURNING last_read_at INTO v_at;
 IF v_at IS NULL OR v_at < statement_timestamp() OR v_at > clock_timestamp() THEN
   RAISE EXCEPTION 'An initial receipt marked unseen future messages read';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
