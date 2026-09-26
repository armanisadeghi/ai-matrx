-- chair-step: RC-B6 replaces the body of platform.clear_output_feedback — undoing a verdict archives the row (deleted_at) instead of deleting it; replaces an existing function body, so it is not additive-with-a-knob.
-- lane: RC-B6
-- lock: platform
-- based-on: platform.clear_output_feedback(text, uuid) 60d519f0e9ed63d829caa52a57a803942d3457dcd48f4d29fca11dde606407c1
--
-- SOFT-DELETE EVERYTHING IMPORTANT (Arman, 2026-09-20). A person's verdict on
-- an output is training signal (the judge-accuracy sweep, hindsight replay and
-- the regression cases read it). Undoing thumbs used to HARD-delete the row
-- (RC-B6 verify, round 2). It now archives it: `deleted_at` is set, every
-- reader already filters `deleted_at is null`, and rating again revives the
-- same row (upsert_output_feedback resets `deleted_at = null`).
-- Same door, same grant, same signature: only the caller's OWN live row.

CREATE OR REPLACE FUNCTION platform.clear_output_feedback(p_subject_type text, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Only the caller's OWN live row (created_by = auth.uid()); a NULL session
  -- matches nothing. Archived, never deleted.
  update platform.output_feedback
     set deleted_at = now()
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = (select auth.uid())
     and deleted_at is null
  returning true;
$function$;
