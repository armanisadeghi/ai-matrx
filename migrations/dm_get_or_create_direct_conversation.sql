-- dm_get_or_create_direct_conversation.sql
--
-- The 1:1 DM "find or create" was a NON-ATOMIC select(RPC)-then-insert spread
-- across ~4 callsites: `find_dm_direct_conversation(a,b)` → if null, INSERT a
-- dm_conversations row + two dm_conversation_participants rows. Under concurrency
-- (two tabs / a double-click / batched system notifications to the same pair),
-- both callers miss the find and both create — silently minting DUPLICATE direct
-- conversations for the same pair (the identity lives in the participants join
-- table, so there is no unique constraint to catch it).
--
-- Fix: ONE canonical, atomic get-or-create RPC. A transaction-scoped advisory
-- lock on the UNORDERED pair serializes concurrent callers, so the find-then-
-- create can't interleave — no duplicate, no 23505 (there's no constraint to
-- violate; the lock is the serialization point). SECURITY DEFINER + explicit
-- user ids so it works from BOTH the browser (`authenticated`) and the
-- service-role notifier (`createAdminClient`, no auth.uid()). Lives in `public`
-- (PostgREST-exposed) and reaches `communication.*` via search_path — exactly
-- like the existing `find_dm_direct_conversation`.
--
-- Idempotent DDL: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.dm_get_or_create_direct_conversation(
  p_user1_id uuid,
  p_user2_id uuid,
  p_organization_id uuid DEFAULT NULL
)
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

  -- A browser caller (authenticated) may only create a DM where they are user1;
  -- a service-role caller (auth.uid() IS NULL, e.g. the assignment notifier) may
  -- pass any pair. This is stricter than find_dm_direct_conversation, which is
  -- read-only and unguarded.
  IF auth.uid() IS NOT NULL AND p_user1_id <> auth.uid() THEN
    RAISE EXCEPTION 'p_user1_id must be the calling user';
  END IF;

  -- Serialize concurrent get-or-create for THIS unordered pair. Transaction-
  -- scoped: released at commit. Two concurrent calls for the same pair run one
  -- after the other, so the second sees the first's committed conversation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_user1_id, p_user2_id)::text || ':' ||
      greatest(p_user1_id, p_user2_id)::text,
      0
    )
  );

  -- Existing 2-person direct conversation? (parity with find_dm_direct_conversation,
  -- plus skip soft-deleted so a deleted thread isn't resurrected).
  SELECT c.id
    INTO v_conv
  FROM communication.dm_conversations c
  WHERE c.type = 'direct'
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

  -- Resolve the org for the new conversation (creator's personal org by default).
  v_org := COALESCE(p_organization_id, public.ensure_personal_organization(p_user1_id));
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'could not resolve an organization for the conversation';
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

-- Supabase's default privileges grant EXECUTE to `anon` explicitly on new public
-- functions. A SECURITY DEFINER writer must NOT be anon-callable (the caller
-- guard treats a null auth.uid() as trusted service context), so revoke it —
-- REVOKE FROM PUBLIC alone is NOT enough because the anon grant is explicit.
REVOKE EXECUTE ON FUNCTION public.dm_get_or_create_direct_conversation(uuid, uuid, uuid)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dm_get_or_create_direct_conversation(uuid, uuid, uuid)
  TO authenticated, service_role;
