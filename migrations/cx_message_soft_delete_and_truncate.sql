-- cx_message_soft_delete_and_truncate.sql
--
-- Adds the two message-level soft-delete RPCs that the frontend message-CRUD
-- thunks have referenced for months but that were NEVER created in the DB:
--
--   • cx_message_soft_delete(p_message_id)            → delete-message.thunk.ts
--   • cx_truncate_conversation_after(conv, position)  → overwrite-and-resend.thunk.ts
--
-- Their absence is why "Delete message" failed at the DB step and why the
-- "Overwrite this turn" branch of Edit & Resubmit could not truncate the
-- downstream transcript (it fell back to the same missing soft-delete RPC).
--
-- SECURITY MODEL — mirrors the canonical cx_message-mutating RPCs in THIS repo
-- (`cx_message_set_content` here, `cx_message_edit` in aidream/0046): they are
-- SECURITY DEFINER + explicit `auth.uid()` ownership check against
-- `cx_conversation.user_id` + `GRANT EXECUTE ... TO authenticated`. We do NOT
-- copy `cx_soft_delete_conversation`'s SECURITY INVOKER model: defense for a
-- destructive mutation belongs at the function (an owner check that can't be
-- bypassed), not at four separate UPDATE RLS policies we'd have to trust exist
-- on cx_message / cx_tool_call / cx_artifact / cx_media (and cx_media is matched
-- by JSONB, not FK, so an UPDATE policy may not even cover it). This matches the
-- Protected-Resources doctrine: the fence is the DB, owner-checked.
--
-- Cascade mirrors cx_soft_delete_conversation (aidream/0090): deleted_at flows to
-- the message's cx_tool_call, cx_artifact, and cx_media rows. cx_media has no
-- message_id column — it's matched by `metadata->>'message_id'` (text compare,
-- guarded by `metadata ? 'message_id'` so a malformed/absent value can't crash
-- the cast, the way cx_fork_conversation guards it). position gaps are left
-- intentionally (fork-at-position relies on stable positions).
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to re-apply (re-run).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Soft-delete ONE message + cascade. Owner-checked.
--    Returns the message id on success, NULL when absent/already deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_message_soft_delete(p_message_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller          uuid := auth.uid();
    v_now             timestamptz := now();
    v_conversation_id uuid;
    v_conv_owner      uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
    END IF;

    SELECT conversation_id INTO v_conversation_id
    FROM cx_message
    WHERE id = p_message_id AND deleted_at IS NULL;

    IF v_conversation_id IS NULL THEN
        RETURN NULL;  -- not found / already deleted
    END IF;

    SELECT user_id INTO v_conv_owner
    FROM cx_conversation WHERE id = v_conversation_id;
    IF v_conv_owner IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
    END IF;

    UPDATE cx_message   SET deleted_at = v_now WHERE id = p_message_id;
    UPDATE cx_tool_call SET deleted_at = v_now WHERE message_id = p_message_id AND deleted_at IS NULL;
    UPDATE cx_artifact  SET deleted_at = v_now WHERE message_id = p_message_id AND deleted_at IS NULL;
    UPDATE cx_media     SET deleted_at = v_now
        WHERE conversation_id = v_conversation_id
          AND deleted_at IS NULL
          AND metadata ? 'message_id'
          AND (metadata->>'message_id') = p_message_id::text;

    RETURN p_message_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cx_message_soft_delete(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. Soft-delete every message AFTER a position (atomic truncate). Owner-checked.
--    Used by "Edit & Resubmit → Overwrite". Returns { deleted_message_ids, count }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_truncate_conversation_after(
    p_conversation_id uuid,
    p_after_position  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller       uuid := auth.uid();
    v_now          timestamptz := now();
    v_owner        uuid;
    v_msg_ids      uuid[];
    v_msg_ids_text text[];
    v_count        int;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
    END IF;

    SELECT user_id INTO v_owner
    FROM cx_conversation
    WHERE id = p_conversation_id AND deleted_at IS NULL;

    IF v_owner IS NULL THEN
        RETURN jsonb_build_object('deleted_message_ids', '[]'::jsonb, 'count', 0);
    END IF;
    IF v_owner IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(id) INTO v_msg_ids
    FROM cx_message
    WHERE conversation_id = p_conversation_id
      AND deleted_at IS NULL
      AND position > p_after_position;

    IF v_msg_ids IS NULL OR array_length(v_msg_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('deleted_message_ids', '[]'::jsonb, 'count', 0);
    END IF;

    v_count := array_length(v_msg_ids, 1);
    v_msg_ids_text := ARRAY(SELECT unnest(v_msg_ids)::text);

    UPDATE cx_message   SET deleted_at = v_now WHERE id = ANY(v_msg_ids);
    UPDATE cx_tool_call SET deleted_at = v_now WHERE message_id = ANY(v_msg_ids) AND deleted_at IS NULL;
    UPDATE cx_artifact  SET deleted_at = v_now WHERE message_id = ANY(v_msg_ids) AND deleted_at IS NULL;
    UPDATE cx_media     SET deleted_at = v_now
        WHERE conversation_id = p_conversation_id
          AND deleted_at IS NULL
          AND metadata ? 'message_id'
          AND (metadata->>'message_id') = ANY(v_msg_ids_text);

    -- Keep the denormalised counter roughly in sync (never below zero).
    UPDATE cx_conversation
       SET message_count = GREATEST(0, COALESCE(message_count, 0) - v_count)
     WHERE id = p_conversation_id;

    RETURN jsonb_build_object(
        'deleted_message_ids', to_jsonb(v_msg_ids),
        'count', v_count
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cx_truncate_conversation_after(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Verification: both functions must now exist.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'cx_message_soft_delete'
    ) THEN
        RAISE EXCEPTION 'cx_message_soft_delete missing after migration';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'cx_truncate_conversation_after'
    ) THEN
        RAISE EXCEPTION 'cx_truncate_conversation_after missing after migration';
    END IF;
END$$;

COMMIT;
