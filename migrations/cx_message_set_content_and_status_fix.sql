-- Artifact materialization: status-preserving message content rewrite + edit fix
--
-- Two changes, both required for the artifact materialization pipeline and a
-- latent bug it surfaced:
--
-- 1) cx_message_set_content(message_id, content): a SECURITY DEFINER, owner-checked
--    RPC that replaces cx_message.content WITHOUT changing status (it stays
--    'active') and archives the prior content into content_history so the
--    rewrite is fully reversible. Materialization is a system rewrite, not a
--    user edit — it must not mark the message 'edited' or trip status logic.
--
-- 2) Allow 'edited' in cx_message_status_check. The existing cx_message_edit RPC
--    sets status='edited', but the CHECK constraint omitted it — so EVERY user
--    edit, inline-decision resolve, and quiz/flashcard state persistence call
--    has been failing at the DB with cx_message_status_check violations. Adding
--    'edited' repairs that path. (No existing rows use it; safe to widen.)

ALTER TABLE public.cx_message DROP CONSTRAINT IF EXISTS cx_message_status_check;
ALTER TABLE public.cx_message
  ADD CONSTRAINT cx_message_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'active'::text,
        'condensed'::text,
        'summary'::text,
        'deleted'::text,
        'pending'::text,
        'abandoned'::text,
        'failed'::text,
        'edited'::text
      ]
    )
  );

CREATE OR REPLACE FUNCTION public.cx_message_set_content(
  p_message_id uuid,
  p_new_content jsonb
)
RETURNS public.cx_message
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_row        public.cx_message;
  v_conv_owner uuid;
  v_now        timestamptz := now();
  v_history    jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
  END IF;

  SELECT m.* INTO v_row FROM public.cx_message m WHERE m.id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.user_id INTO v_conv_owner
    FROM public.cx_conversation c
   WHERE c.id = v_row.conversation_id;

  IF v_conv_owner IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- Archive the original so materialization is reversible.
  v_history := COALESCE(v_row.content_history, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
                 'content',  v_row.content,
                 'saved_at', v_now,
                 'reason',   'artifact_materialization'
               ));

  UPDATE public.cx_message
     SET content         = p_new_content,
         content_history = v_history
   WHERE id = p_message_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cx_message_set_content(uuid, jsonb) TO authenticated;
