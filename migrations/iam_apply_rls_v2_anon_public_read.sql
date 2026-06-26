-- iam_apply_rls_v2_anon_public_read.sql
-- ---------------------------------------------------------------------------
-- apply_rls v2.1 — add the canonical anon public-read policy (checklist #5).
--
-- Every standard governed entity that carries a `visibility` column gets a
-- SELECT policy `TO anon USING (visibility = 'public')` so unauthenticated
-- readers can see truly-public rows — the canonical replacement for the old
-- per-table `is_public = true` anon policies. `visibility` is the access
-- driver; `is_public` booleans are retired (the sharing RPC make_resource_public
-- reconciliation to drive `visibility` is tracked separately).
--
-- Only `public` visibility is anon-readable here — `link` requires token
-- validation (a separate mechanism), `internal`/`private` never anon.
-- Authenticated users already get public rows via std_select's has_access branch.
--
-- Idempotent. Re-applies to the tables already on v2.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION iam.apply_rls(
  p_schema  text,
  p_table   text,
  p_token   text,
  p_variant text DEFAULT 'entity'
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tbl         text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_created  boolean;
  v_has_org      boolean;
  v_has_del      boolean;
  v_has_vis      boolean;
  v_delpfx       text := '';
  v_parent_type  text;
  v_parent_col   text;
  pol            record;
BEGIN
  SELECT COALESCE(is_component, false) INTO v_is_component
  FROM platform.entity_types WHERE token = p_token;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='created_by')      INTO v_has_created;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='organization_id') INTO v_has_org;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='deleted_at')       INTO v_has_del;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='visibility')       INTO v_has_vis;
  v_delpfx := CASE WHEN v_has_del THEN 'deleted_at IS NULL AND ' ELSE '' END;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_tbl);

  FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = v_tbl::regclass LOOP
    EXECUTE format('DROP POLICY %I ON %s', pol.polname, v_tbl);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY svc_all ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)', v_tbl);

  IF p_variant = 'ledger' THEN
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s iam.has_org_access(organization_id))',
      v_tbl, v_delpfx);
    RETURN;
  END IF;

  IF v_is_component OR p_variant = 'component' THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships
    WHERE child_type = p_token AND kind = 'composition' LIMIT 1;
    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    END IF;

    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s iam.has_access(%L, %I, ''viewer''))',
      v_tbl, v_delpfx, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (iam.has_access(%L, %I, ''editor'')) WITH CHECK (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col);
    RETURN;
  END IF;

  IF NOT v_has_created THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;
  IF NOT v_has_org THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;

  EXECUTE format(
    'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
    v_tbl, v_delpfx, p_token);

  -- canonical anon public-read (checklist #5): visibility drives it, not is_public
  IF v_has_vis THEN
    EXECUTE format(
      'CREATE POLICY pub_read ON %s FOR SELECT TO anon USING (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  END IF;

  EXECUTE format(
    'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id)))',
    v_tbl);

  EXECUTE format(
    'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))) WITH CHECK (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))',
    v_tbl, v_delpfx, p_token, p_token);

  EXECUTE format(
    'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);
END
$function$;

-- re-apply to the tables already on v2 (adds pub_read where visibility exists)
SELECT iam.apply_rls('public', 'wr_sessions', 'war_room', 'entity');
SELECT iam.apply_rls('public', 'wr_threads',  'thread',   'entity');
SELECT iam.apply_rls('public', 'notes',       'note',     'entity');
