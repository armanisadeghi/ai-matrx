-- chair-step: emergency RC-A2 containment keeps parent ACLs and D347 intact while disabling client comment reads and RPCs; no data or function body is rolled back.
-- Explicit-only post-commit abort path. This is deliberately NOT the old inverse: an
-- inverse restoring organization-only comment access would re-open personal records.
-- Existing comments and the RC-A2 detail/parent rules remain. service_role keeps its
-- grants; authenticated and anon clients lose direct reads and all five public doors.
-- This closes the current client grants without policy DDL's 23-relation Supabase
-- auth/storage/realtime lock footprint. A later iam.apply_rls can regenerate the
-- table SELECT grant; it cannot undo RC-A2's parent ACL, which stays in force.
-- Operators must use a separately reviewed forward migration to re-enable RPCs.

SET LOCAL lock_timeout = '2s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.entity_types
     WHERE token = 'comment' AND rls_variant = 'detail' AND type = 'detail'
  ) OR to_regprocedure('public.cmt_resolve(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'RC-A2 containment requires the parent-following comment migration first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.entity_types
     WHERE token = 'pc_article' AND anonymous_read_status = 'published'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'podcast.pc_articles'::regclass
       AND polname = 'anon_status_gate' AND NOT polpermissive AND polcmd = 'r'
       AND polroles = ARRAY['anon'::regrole::oid]
       AND polwithcheck IS NULL
       AND pg_get_expr(polqual,polrelid) = '(status = ''published''::text)'
  ) THEN
    RAISE EXCEPTION 'RC-A2 containment requires D347 published-only anonymous access to remain active';
  END IF;
END
$preflight$;

-- The declared-door guard otherwise reopens each signed-in grant in the same
-- REVOKE statement. Close all five register rows first, and refuse a partial set.
DO $close_doors$
DECLARE changed integer;
BEGIN
  UPDATE platform.client_callable_door
     SET signed_in_callers = false,
         non_client_lane = 'closed by rca2_comments_follow_the_parent_contain.sql: emergency post-commit comment containment; service_role remains available'
   WHERE schema_name = 'public'
     AND function_name IN ('cmt_add','cmt_list','cmt_edit','cmt_delete','cmt_resolve')
     AND signed_in_callers = true AND anonymous_callers = false
     AND non_client_lane IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 5 THEN
    RAISE EXCEPTION 'RC-A2 containment expected 5 open signed-in comment doors, closed %', changed;
  END IF;
END
$close_doors$;

REVOKE EXECUTE ON FUNCTION public.cmt_add(text,uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cmt_list(text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cmt_edit(uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cmt_delete(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cmt_resolve(uuid,boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE SELECT ON TABLE platform.comments FROM PUBLIC, anon, authenticated;
