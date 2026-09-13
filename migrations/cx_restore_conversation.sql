-- cx_restore_conversation — the RESTORE half of `cx_soft_delete_conversation` (DD-179).
--
-- WHY: a conversation could be soft-deleted from the platform and never brought back.
-- `cx_soft_delete_conversation` stamps ONE timestamp (`v_now`) across the conversation and
-- every child row it owns, so the inverse is exact and unambiguous: un-stamp precisely the
-- rows carrying that conversation's own `deleted_at`. Rows that were already soft-deleted
-- BEFORE the conversation was deleted carry an earlier timestamp and stay deleted — a
-- restore must never resurrect a message the user had deleted on its own.
--
-- SECURITY INVOKER, exactly like the delete: RLS decides. `chat.conversation.std_select`
-- does not filter `deleted_at`, so an owner can still see (and therefore restore) their own
-- trashed row; `std_update` is owner-or-editor. A non-owner simply updates zero rows and
-- gets `false` back — never a silent success.

create or replace function public.cx_restore_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $function$
DECLARE v_stamp timestamptz;
BEGIN
    SELECT deleted_at INTO v_stamp
      FROM chat.conversation
     WHERE id = p_conversation_id AND deleted_at IS NOT NULL;

    -- Not found, not visible to this caller, or not deleted: nothing restored.
    IF v_stamp IS NULL THEN
        RETURN false;
    END IF;

    UPDATE chat.conversation SET deleted_at = NULL WHERE id = p_conversation_id;

    -- The conversation row must actually have moved. If RLS refused the update the
    -- statement affects zero rows; say so instead of reporting a restore that never was.
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE chat.message      SET deleted_at = NULL WHERE conversation_id = p_conversation_id AND deleted_at = v_stamp;
    UPDATE chat.tool_call    SET deleted_at = NULL WHERE conversation_id = p_conversation_id AND deleted_at = v_stamp;
    UPDATE chat.artifact     SET deleted_at = NULL WHERE conversation_id = p_conversation_id AND deleted_at = v_stamp;
    UPDATE chat.media        SET deleted_at = NULL WHERE conversation_id = p_conversation_id AND deleted_at = v_stamp;
    UPDATE chat.request      SET deleted_at = NULL WHERE conversation_id = p_conversation_id AND deleted_at = v_stamp;
    UPDATE chat.user_request ur SET deleted_at = NULL
     WHERE ur.deleted_at = v_stamp
       AND ur.id IN (SELECT DISTINCT user_request_id FROM chat.request WHERE conversation_id = p_conversation_id);

    PERFORM runtime.spine_restore_conversation_requests(p_conversation_id, v_stamp);
    RETURN true;
END; $function$;

comment on function public.cx_restore_conversation(uuid) is
  'DD-179 — restores a soft-deleted conversation and exactly the child rows the delete stamped (same deleted_at). SECURITY INVOKER: RLS decides. Returns false when the row is absent, not deleted, or not the caller''s to restore.';

-- The runtime spine's requests live outside the client's RLS reach, so the delete already
-- delegates them to a SECURITY DEFINER helper. The restore mirrors it one-for-one, bounded
-- to the window the delete opened: the spine stamps `now()` immediately after the
-- conversation''s own stamp, inside the same transaction.
create or replace function runtime.spine_restore_conversation_requests(
  p_conversation_id uuid,
  p_stamp timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'runtime', 'chat', 'pg_temp'
as $function$
BEGIN
  -- Only ever called for a conversation this transaction just un-deleted.
  IF NOT EXISTS (SELECT 1 FROM chat.conversation c WHERE c.id = p_conversation_id AND c.deleted_at IS NULL) THEN
    RETURN;
  END IF;
  UPDATE runtime.global_request gr
  SET deleted_at = NULL
  WHERE gr.deleted_at IS NOT NULL
    AND gr.deleted_at >= p_stamp
    AND gr.deleted_at < p_stamp + interval '1 minute'
    AND EXISTS (
      SELECT 1 FROM runtime.global_execution e
      WHERE e.request_id = gr.id
        AND e.link_kind IN ('conversation','cx_conversation')
        AND e.link_id = p_conversation_id::text);
END;
$function$;

comment on function runtime.spine_restore_conversation_requests(uuid, timestamptz) is
  'DD-179 — inverse of runtime.spine_soft_delete_conversation_requests: un-deletes the global_request rows that conversation delete stamped in the same transaction window.';

-- §6d-4: a SECURITY DEFINER function keeps a client EXECUTE grant only when the door is
-- declared FIRST, in this same migration. Declared before the grant, never after.
insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
select 'runtime', 'spine_restore_conversation_requests', 'p_conversation_id uuid, p_stamp timestamptz',
       'Restore half of the conversation soft-delete cascade; called by public.cx_restore_conversation (SECURITY INVOKER), which RLS-gates the conversation first. Mirrors the already-granted spine_soft_delete_conversation_requests door.'
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = 'runtime' and d.function_name = 'spine_restore_conversation_requests'
);

grant execute on function runtime.spine_restore_conversation_requests(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.cx_restore_conversation(uuid) to authenticated, service_role;
