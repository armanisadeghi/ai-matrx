-- Second form of the same defect, in the bespoke crawl-artifact lanes of
-- iam.entity_read_expr:  <col> = any(iam.accessible_entity_ids('<type>', ...))
--
-- `= ANY (<array expr>)` is costed by scalararraysel(), which likewise calls
-- estimate_expression_value() on the array argument -- and that helper folds
-- STABLE functions. So these four arms ALSO ran the access walk at plan time.
-- Measured on files.files after the unnest() form was fixed: still 1,768 ms of
-- planning / 73,331 buffers, with every one of those SubPlans "never executed".
--
-- Rewritten to the subquery form so the planner-opaque iam.unnest_uuids sits
-- between the planner and the walk. `x = ANY(arr)` and `x IN (SELECT unnest(arr))`
-- are equivalent in a boolean filter: both are false for an empty array and NULL
-- for a NULL x. Type token text is preserved verbatim for iam.verify_canonical.
--
-- Requires: iam_rls_stop_planner_evaluating_accessible_entity_ids.sql (creates
-- iam.unnest_uuids). After applying, re-run iam.apply_rls for files.files.

DO $mig$
DECLARE
  v_def text := pg_get_functiondef('iam.entity_read_expr(text,text,text)'::regprocedure);
  v_new text;
BEGIN
  v_new := regexp_replace(
    v_def,
    '= any\(iam\.accessible_entity_ids\(([^()]*)\)\)',
    'in (select iam.unnest_uuids(iam.accessible_entity_ids(\1)))',
    'g'
  );
  IF v_new IS DISTINCT FROM v_def THEN
    EXECUTE v_new;
  END IF;
END
$mig$;

DO $check$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc ~ 'any *\(iam\.accessible_entity_ids'
     OR p.prosrc LIKE '%select unnest(iam.accessible_entity_ids(%';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'planner-evaluated accessible_entity_ids form still present in % function(s)', v_left;
  END IF;
END
$check$;
