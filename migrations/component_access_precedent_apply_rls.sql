-- THE COMPONENT-ACCESS PRECEDENT (owner ruling 2026-08-08) — part 2/3.
-- The `component` variant of iam.apply_rls now generates the thin membrane
--   parent_fk IN (SELECT unnest(iam.accessible_entity_ids('<parent_token>', level)))
-- (InitPlan — parent access evaluated ONCE per query) instead of a per-row
-- iam.has_access() call (measured: 4,020 identical evaluations / ~762ms to
-- show 25 rows; live statement timeouts on /marketing/.../pages, 2026-07-21).
-- Hand-written component policies remain banned; this function is the ONE
-- implementation. All other variants are unchanged.

CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tbl             text := format('%I.%I', p_schema, p_table);
  v_is_component    boolean;
  v_has_created     boolean;
  v_has_org         boolean;
  v_has_del         boolean;
  v_has_vis         boolean;
  v_delpfx          text := '';
  v_parent_type     text;
  v_parent_col      text;
  v_parent_optional boolean := false;
  pol               record;
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
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (iam.has_org_access(organization_id))',
      v_tbl);
    RETURN;
  END IF;

  -- COMPONENT MEMBRANE (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08):
  -- access is decided at the parent, exactly once per query. The scalar
  -- subselect around iam.accessible_entity_ids makes it an InitPlan, so the
  -- parent-visibility set is computed once per statement, never per row.
  IF v_is_component OR p_variant = 'component' THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships
    WHERE child_type = p_token AND kind = 'composition' LIMIT 1;
    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    END IF;

    SELECT (c.is_nullable = 'YES') INTO v_parent_optional
    FROM information_schema.columns c
    WHERE c.table_schema=p_schema AND c.table_name=p_table AND c.column_name=v_parent_col;
    v_parent_optional := COALESCE(v_parent_optional, false) AND v_has_created;

    IF v_parent_optional THEN
      EXECUTE format(
        'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING ((%I IS NOT NULL AND %I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_col, v_parent_type, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK ((%I IS NOT NULL AND %I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_col, v_parent_type, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING ((%I IS NOT NULL AND %I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) OR (%I IS NULL AND created_by = (select auth.uid()))) WITH CHECK ((%I IS NOT NULL AND %I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_col, v_parent_type, v_parent_col,
        v_parent_col, v_parent_col, v_parent_type, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING ((%I IS NOT NULL AND %I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_col, v_parent_type, v_parent_col);
      RETURN;
    END IF;

    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level))))',
      v_tbl, v_parent_col, v_parent_type);
    EXECUTE format(
      'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (%I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level))))',
      v_tbl, v_parent_col, v_parent_type);
    EXECUTE format(
      'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (%I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) WITH CHECK (%I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level))))',
      v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_type);
    EXECUTE format(
      'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (%I IN (SELECT unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level))))',
      v_tbl, v_parent_col, v_parent_type);
    RETURN;
  END IF;

  IF NOT v_has_created THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;
  IF NOT v_has_org THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;

  -- 'restricted' (ai_046): secret-bearing system tables (e.g. serving-vendor
  -- identity on ai.endpoint/ai.api/ai.offering). Reads and writes are OWNER or
  -- SUPER ADMIN only — deliberately NO iam.has_access path, because these rows
  -- live in a global_readable system org and has_access would grant every
  -- authenticated user viewer access (the exact leak this variant closes).
  IF p_variant = 'restricted' THEN
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s(created_by = (select auth.uid()) OR public.is_super_admin()))',
      v_tbl, v_delpfx);
    IF v_has_vis THEN
      EXECUTE format(
        'CREATE POLICY pub_read ON %s FOR SELECT TO anon USING (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    END IF;
    EXECUTE format(
      'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (public.is_super_admin() OR organization_id IS NULL OR iam.has_org_access(organization_id)))',
      v_tbl);
    EXECUTE format(
      'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (created_by = (select auth.uid()) OR public.is_super_admin()) WITH CHECK (created_by = (select auth.uid()) OR public.is_super_admin())',
      v_tbl);
    EXECUTE format(
      'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR public.is_super_admin())',
      v_tbl);
    RETURN;
  END IF;

  IF p_variant = 'system' THEN
    IF NOT v_has_vis THEN
      RAISE EXCEPTION 'apply_rls: system variant on %.% requires a visibility column (public rows are the whole point)', p_schema, p_table;
    END IF;
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING ((visibility = ''public'' OR created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token);
  ELSE
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING ((created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token);
  END IF;

  IF v_has_vis THEN
    EXECUTE format(
      'CREATE POLICY pub_read ON %s FOR SELECT TO anon USING (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  END IF;

  EXECUTE format(
    'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id) OR (organization_id IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable) AND public.is_super_admin())))',
    v_tbl);

  EXECUTE format(
    'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING ((created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))) WITH CHECK (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))',
    v_tbl, p_token, p_token);

  EXECUTE format(
    'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);
END
$function$;
