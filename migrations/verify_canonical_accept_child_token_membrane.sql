-- iam.verify_canonical: accept the CHILD-token component membrane in policy_defers_parent.
--
-- THE BUG (same class as verify_canonical_accept_accessible_entity_ids.sql, one
-- generation later): after the 2026-08-12 access-tree rewrite, the component
-- variant of `iam.apply_rls` emits std_select as
--   id IN (SELECT unnest(iam.accessible_entity_ids('<CHILD token>', 'viewer')))
-- — the once-per-statement resolver that walks EVERY composition parent
-- internally (see access-architecture FEATURE.md §5). The checker still PASSes
-- only when std_select names the PARENT token, so the gate fails its own
-- generator's current output.
--
-- BLAST RADIUS (measured live 2026-08-12): all 68 active rls_variant='component'
-- tables now carry the child-token std_select. The 02:33 audit snapshot predates
-- the regeneration sweep, so without this fix the next `audit.refresh()` would
-- flip up to ~66 correct tables to FAIL on policy_defers_parent.
--
-- Patched programmatically from pg_get_functiondef (the established pattern) so
-- no other check can drift by transcription. Aborts unless exactly 2 sites are
-- patched (the status line and the detail line).
DO $mig$
DECLARE v_def text; v_new text; v_cnt int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'iam' AND p.proname = 'verify_canonical';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'iam.verify_canonical not found';
  END IF;

  IF v_def LIKE $probe$%accessible_entity_ids('''||p_token||'''%$probe$ THEN
    RAISE NOTICE 'iam.verify_canonical already accepts the child-token membrane; nothing to do';
    RETURN;
  END IF;

  v_new := replace(
    v_def,
    $old$(v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%')$old$,
    $new$(v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%')$new$
  );

  v_cnt := (length(v_def) - length(replace(v_def,
    $old$(v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%')$old$,
    '')))
    / length($old$(v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%')$old$);

  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'expected exactly 2 patch sites in iam.verify_canonical, found % — refusing to patch', v_cnt;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'iam.verify_canonical patched: policy_defers_parent now accepts the child-token membrane';
END
$mig$;
