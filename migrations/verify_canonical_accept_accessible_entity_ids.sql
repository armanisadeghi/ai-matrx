-- iam.verify_canonical: accept BOTH parent-deferral forms for components.
--
-- THE BUG: the `policy_defers_parent` check pattern-matched only
--   has_access('<parent>', ...)
-- but `iam.apply_rls(schema, table, token, 'component')` — the platform's OWN
-- canonical policy generator — emits the set-based form:
--   <fk> IN (SELECT unnest(iam.accessible_entity_ids('<parent>', '<level>')))
-- described in component_access_precedent_helper.sql as "the STABLE once-per-query
-- parent resolver". So the generator produced policies its own checker called FAIL.
--
-- BLAST RADIUS (measured 2026-08-12, before the fix): 115 component FAILs on this
-- check, of which 95 were correct tables the checker misread. Only 16 genuinely
-- lacked a std_select and 2 used another shape. Anyone working that list top-down
-- would have "fixed" 95 already-correct tables.
--
-- Patched programmatically from pg_get_functiondef rather than by re-pasting the
-- 12KB body, so no other check can drift by transcription. Aborts unless exactly
-- 2 sites are patched (the status line and the detail line).
DO $mig$
DECLARE v_def text; v_new text; v_cnt int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'iam' AND p.proname = 'verify_canonical';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'iam.verify_canonical not found';
  END IF;

  IF v_def LIKE '%accessible_entity_ids%' THEN
    RAISE NOTICE 'iam.verify_canonical already accepts accessible_entity_ids; nothing to do';
    RETURN;
  END IF;

  v_new := replace(
    v_def,
    $old$v_sel LIKE '%has_access('''||v_parent_type||'''%'$old$,
    $new$(v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%')$new$
  );

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, 'accessible_entity_ids', 'g');
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'expected exactly 2 patched sites, found % — aborting rather than corrupting the gate', v_cnt;
  END IF;

  EXECUTE v_new;
END
$mig$;
