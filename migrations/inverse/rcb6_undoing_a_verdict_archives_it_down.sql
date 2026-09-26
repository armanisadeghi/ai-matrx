-- INVERSE of migrations/campaign/rcb6_undoing_a_verdict_archives_it.sql (lane RC-B6).
-- lane: RC-B6
-- lock: platform
-- based-on: platform.clear_output_feedback(text, uuid) a610df5001aac45f9eb4bbedd55a77968a8ddbe13c159bf222cbf08aaa816a9c
-- Restores the prior body (hard delete of the caller's own row).

CREATE OR REPLACE FUNCTION platform.clear_output_feedback(p_subject_type text, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Only the caller's OWN row (created_by = auth.uid()); a NULL session matches nothing.
  delete from platform.output_feedback
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = (select auth.uid())
  returning true;
$function$;
