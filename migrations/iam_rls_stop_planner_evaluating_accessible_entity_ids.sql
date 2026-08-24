-- ─────────────────────────────────────────────────────────────────────────────
-- THE PLANNER WAS RUNNING THE ACCESS WALK ON EVERY QUERY.
--
-- iam.entity_read_expr / iam._apply_rls_unchecked emitted parent-cascade arms as
--     <fk> in (select unnest(iam.accessible_entity_ids('<type>', 'viewer', 0, ...)))
--
-- `unnest` carries a planner SUPPORT FUNCTION (array_unnest_support). To size the
-- set it calls estimate_array_length() -> estimate_expression_value(), and THAT
-- helper deliberately const-folds STABLE functions. So Postgres EXECUTED the
-- recursive, SECURITY DEFINER access walk during PLANNING of every statement
-- against the table -- before a single row was read, and regardless of whether the
-- arm was ever needed at execution time (for a row's own owner it never is:
-- EXPLAIN ANALYZE showed those SubPlans "never executed").
--
-- Measured on files.folders for the user owning 32,697 folders:
--     bare EXPLAIN (plan only)                14,254 ms / 296,867 buffers
--     iam.accessible_entity_ids('folder',...) 12,660 ms / 259,338 buffers
--     actual Execution Time                        4.7 ms
-- PostgREST's statement timeout fired during planning -> SQLSTATE 57014, HTTP 500.
--
-- THE FIX: hand the array to a set-returning function that has NO support
-- function. Nothing else changes -- iam.unnest_uuids is `select unnest($1)` and
-- the emitted policy text still names iam.accessible_entity_ids('<type>' verbatim,
-- so iam.verify_canonical's composition-parent proof and the read-kernel
-- fingerprint are untouched. Plan time collapses to sub-millisecond; execution
-- semantics are byte-identical.
--
-- After applying, every table whose policies carry the old form must be re-run
-- through iam.apply_rls (198 tables / 743 policies on 2026-08-24).
--
-- 🚨 NEVER put `unnest(<stable function>)` in an RLS policy. The planner will run
--    it. Route every such array through iam.unnest_uuids.
--    Guard: pnpm check:db-guards (RLS planner traps detector).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION iam.unnest_uuids(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
ROWS 1000
SET search_path TO 'pg_catalog'
AS $fn$ SELECT unnest(p_ids) $fn$;

COMMENT ON FUNCTION iam.unnest_uuids(uuid[]) IS
  'Planner-opaque unnest for RLS policies. Identical to unnest(), but WITHOUT the '
  'array_unnest_support support function -- so the planner cannot const-fold and '
  'EXECUTE a STABLE argument (e.g. iam.accessible_entity_ids) during planning. '
  'This is pure plumbing: it holds no access logic and must never grow any. '
  'See the migration iam_rls_stop_planner_evaluating_accessible_entity_ids.';

GRANT EXECUTE ON FUNCTION iam.unnest_uuids(uuid[]) TO authenticated, anon, service_role;

-- Rewrite the two generators in place, from their own catalog definitions, so no
-- byte of the surrounding 28KB of generator logic can be lost in transcription.
DO $mig$
DECLARE
  v_fn      regprocedure;
  v_def     text;
  v_new     text;
  v_patched int := 0;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'iam.entity_read_expr(text,text,text)'::regprocedure,
    'iam._apply_rls_unchecked(text,text,text,text)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := replace(
      v_def,
      'select unnest(iam.accessible_entity_ids(',
      'select iam.unnest_uuids(iam.accessible_entity_ids('
    );
    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
      v_patched := v_patched + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'unnest_uuids rollout: % generator(s) rewritten', v_patched;
END
$mig$;

-- Fail the migration loudly if any generator still emits the planner-evaluated form.
DO $check$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc LIKE '%select unnest(iam.accessible_entity_ids(%';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'still % function(s) emitting unnest(iam.accessible_entity_ids(...)', v_left;
  END IF;
END
$check$;
