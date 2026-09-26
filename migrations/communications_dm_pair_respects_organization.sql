-- A direct conversation is keyed by pair AND organization. Authenticate the
-- requested organization before returning an existing conversation ID.
-- based-on: public.dm_get_or_create_direct_conversation(uuid, uuid, uuid) 485c921bacacfd103397a5421e0e701e3f5b3d40b72fdfa1f18c71fe4886c23f
set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.dm_get_or_create_direct_conversation(p_user1_id uuid, p_user2_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
DECLARE
  v_conv uuid;
  v_org  uuid;
BEGIN
  IF p_user1_id IS NULL OR p_user2_id IS NULL THEN
    RAISE EXCEPTION 'both user ids are required';
  END IF;
  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'cannot create a direct conversation with oneself';
  END IF;

  IF ( SELECT auth.uid()) IS NOT NULL AND p_user1_id <> ( SELECT auth.uid()) THEN
    RAISE EXCEPTION 'p_user1_id must be the calling user';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_user1_id, p_user2_id)::text || ':' ||
      greatest(p_user1_id, p_user2_id)::text,
      0
    )
  );

  -- Resolve and authorize the requested tenant before considering any prior
  -- thread. Otherwise a caller can receive another tenant's conversation ID.
  v_org := p_organization_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Name the organization this conversation belongs to.'
      USING ERRCODE = '23502',
            HINT = 'Pass p_organization_id: the organization the sender is acting in.';
  END IF;
  IF iam.is_client_lane() AND NOT iam.has_org_access(v_org) THEN
    RAISE EXCEPTION 'dm_organization_denied: no access to that organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.id
    INTO v_conv
  FROM communication.dm_conversations c
  WHERE c.type = 'direct'
    AND c.organization_id = v_org
    AND c.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id AND p.user_id = p_user1_id
    )
    AND EXISTS (
      SELECT 1 FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id AND p.user_id = p_user2_id
    )
    AND (
      SELECT count(*) FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id
    ) = 2
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO communication.dm_conversations (type, created_by, organization_id)
  VALUES ('direct', p_user1_id, v_org)
  RETURNING id INTO v_conv;

  INSERT INTO communication.dm_conversation_participants
    (conversation_id, user_id, role, organization_id)
  VALUES
    (v_conv, p_user1_id, 'owner',  v_org),
    (v_conv, p_user2_id, 'member', v_org);

  RETURN v_conv;
END;
$function$;
