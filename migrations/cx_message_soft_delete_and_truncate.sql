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
-- Style mirrors public.cx_soft_delete_conversation (migration 0090):
--   - plpgsql, SECURITY INVOKER (default) so RLS applies with the caller's
--     auth context — a user can only soft-delete rows they can already see.
--   - SET search_path TO 'public'.
--   - Cascade deleted_at to the message's cx_tool_call, cx_artifact, and
--     cx_media rows (matching the whole-conversation soft-delete cascade).
--   - position gaps are intentional and left untouched (fork-at-position relies
--     on stable positions).
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to re-apply.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Soft-delete ONE message + cascade.
--    Returns the message id on success, NULL when the row is absent or already
--    deleted (the thunk treats a non-string return as "use my optimistic id").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_message_soft_delete(p_message_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_now             timestamptz := now();
    v_conversation_id uuid;
BEGIN
    SELECT conversation_id INTO v_conversation_id
    FROM cx_message
    WHERE id = p_message_id AND deleted_at IS NULL;

    IF v_conversation_id IS NULL THEN
        RETURN NULL;  -- not found / already deleted / not visible under RLS
    END IF;

    UPDATE cx_message   SET deleted_at = v_now WHERE id = p_message_id;
    UPDATE cx_tool_call SET deleted_at = v_now WHERE message_id = p_message_id AND deleted_at IS NULL;
    UPDATE cx_artifact  SET deleted_at = v_now WHERE message_id = p_message_id AND deleted_at IS NULL;
    UPDATE cx_media     SET deleted_at = v_now
        WHERE conversation_id = v_conversation_id
          AND deleted_at IS NULL
          AND (metadata->>'message_id')::uuid = p_message_id;

    RETURN p_message_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 2. Soft-delete every message AFTER a position (atomic truncate).
--    Used by "Edit & Resubmit → Overwrite": the edited user message is kept,
--    everything after it is removed, then a fresh turn is fired.
--    Returns { deleted_message_ids: uuid[], count: int }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_truncate_conversation_after(
    p_conversation_id uuid,
    p_after_position  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_now     timestamptz := now();
    v_msg_ids uuid[];
    v_count   int;
BEGIN
    SELECT array_agg(id) INTO v_msg_ids
    FROM cx_message
    WHERE conversation_id = p_conversation_id
      AND deleted_at IS NULL
      AND position > p_after_position;

    IF v_msg_ids IS NULL OR array_length(v_msg_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('deleted_message_ids', '[]'::jsonb, 'count', 0);
    END IF;

    v_count := array_length(v_msg_ids, 1);

    UPDATE cx_message   SET deleted_at = v_now WHERE id = ANY(v_msg_ids);
    UPDATE cx_tool_call SET deleted_at = v_now WHERE message_id = ANY(v_msg_ids) AND deleted_at IS NULL;
    UPDATE cx_artifact  SET deleted_at = v_now WHERE message_id = ANY(v_msg_ids) AND deleted_at IS NULL;
    UPDATE cx_media     SET deleted_at = v_now
        WHERE conversation_id = p_conversation_id
          AND deleted_at IS NULL
          AND (metadata->>'message_id')::uuid = ANY(v_msg_ids);

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
