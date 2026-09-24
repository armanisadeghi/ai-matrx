-- target: branch
-- Reopen only the synthetic rehearsal branch after RC-A2 emergency-containment proof.
-- NEVER run on production. The prior branch ACL has authenticated SELECT on
-- platform.comments and authenticated EXECUTE on all five public cmt_* doors;
-- anon has neither. RC-A2's parent RLS and D347 are not changed.
SET LOCAL lock_timeout = '2s';

DO $reopen_doors$
DECLARE changed integer;
BEGIN
  UPDATE platform.client_callable_door
     SET signed_in_callers = true, non_client_lane = NULL
   WHERE schema_name = 'public'
     AND function_name IN ('cmt_add','cmt_list','cmt_edit','cmt_delete','cmt_resolve')
     AND signed_in_callers = false
     AND non_client_lane = 'closed by rca2_comments_follow_the_parent_contain.sql: emergency post-commit comment containment; service_role remains available';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 5 THEN
    RAISE EXCEPTION 'RC-A2 branch release expected 5 contained comment doors, reopened %', changed;
  END IF;
END
$reopen_doors$;

GRANT SELECT ON TABLE platform.comments TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmt_add(text,uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmt_list(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmt_edit(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmt_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cmt_resolve(uuid,boolean) TO authenticated;
