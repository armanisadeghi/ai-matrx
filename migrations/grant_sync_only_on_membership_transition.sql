-- Grant synchronization follows membership transitions, never preference writes.
-- Keeps canonical grant writers and the private-owner authorization guard intact.
-- based-on: public.dm_participant_sync_grant() 447c892642dfbdbc9648adaaf984c5303b637e92ea86ad14085310e5015698c7
-- based-on: workspace._sync_task_assignee_grant() 3a154b5ece649a8e55ae146ac241849fed1a75905edb120ffd325ff5c98838d4
CREATE OR REPLACE FUNCTION public.dm_participant_sync_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb;
BEGIN
  -- Preferences and receipts do not change membership or sharing.
  -- Compare values, rather than UPDATE OF: callers can re-send unchanged keys.
  IF TG_OP = 'UPDATE'
     AND OLD.conversation_id IS NOT DISTINCT FROM NEW.conversation_id
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND (OLD.deleted_at IS NULL) = (NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- A moved/reassigned participant must not leave the previous grant behind.
  IF TG_OP = 'UPDATE'
     AND (OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
          OR OLD.user_id IS DISTINCT FROM NEW.user_id)
     AND OLD.deleted_at IS NULL THEN
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=OLD.conversation_id
       AND p.granted_to_user_id=OLD.user_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=OLD.conversation_id
       AND p.granted_to_user_id=OLD.user_id;
    RETURN OLD;
  END IF;

  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    -- participant left/removed -> the grant's basis ended: archived (T-32e), never deleted
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=NEW.conversation_id
       AND p.granted_to_user_id=NEW.user_id;
  ELSE
    -- active participant -> an active editor grant, through the one writer
    v_res := iam.share_with_person('dm_conversation', NEW.conversation_id, NEW.user_id, 'editor',
                                   COALESCE(NEW.created_by, NEW.user_id), false, 'dm_participant', NULL, true, NULL);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION '%', v_res ->> 'error'
        USING errcode = '42501', hint = 'Their access to this conversation was removed; share it with them directly to give it back.';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION workspace._sync_task_assignee_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'workspace'
AS $function$
DECLARE
  v_res jsonb;
BEGIN
  -- Re-sending an unchanged assignee is not a new access-grant operation.
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN
    RETURN NEW;
  END IF;
  -- Drop the auto grant for a previous/cleared assignee.
  IF TG_OP='UPDATE' AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='task' AND p.resource_id=NEW.id AND p.review_note='auto:assignee'
       AND p.status <> 'archived'
       AND (NEW.assignee_id IS NULL OR p.granted_to_user_id IS DISTINCT FROM NEW.assignee_id);
  END IF;
  -- Ensure a grant for the current assignee (never the owner — they already own it).
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM NEW.created_by THEN
    -- through the one writer (T-32e): raise-only, so a hand-made share is never lowered, and an
    -- assignment never gives back access someone removed — it refuses, naming the remedy.
    v_res := iam.share_with_person('task', NEW.id, NEW.assignee_id, 'editor',
                                   COALESCE(NEW.updated_by, NEW.created_by), false, 'task_assignee',
                                   NULL, false, 'auto:assignee');
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'The person you assigned had their access to this task removed, so assigning it does not give it back.'
        USING errcode = '42501', hint = 'Share the task with them directly first, then assign it.';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;
