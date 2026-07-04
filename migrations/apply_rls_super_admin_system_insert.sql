-- iam.apply_rls's generated `std_insert` policy only ever allowed
-- `organization_id IS NULL OR iam.has_org_access(organization_id)`. For any
-- 'system'-variant table (ai.provider/service/offering/setting/model_definition,
-- and any other system-catalog table generated this way), the global system
-- org (iam.system_orgs) has ZERO members by design — so no admin can ever
-- INSERT a new row explicitly homed in the system org; RLS rejects it. This
-- is why every existing system-catalog row was seeded via service-role
-- migrations, never through the app.
--
-- iam.has_access() already has the correct bypass for UPDATE/DELETE/SELECT
-- (system-org row + is_super_admin() => allowed). This migration adds the
-- same bypass to the INSERT check, so a super-admin creating a new system
-- catalog row through the client actually works. Purely additive (widens who
-- passes; never narrows existing access) and self-documenting since it
-- mirrors iam.has_access's existing clause verbatim.
create or replace function iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text default 'entity'::text)
returns void
language plpgsql
as $function$
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

  IF p_variant = 'system' THEN
    IF NOT v_has_vis THEN
      RAISE EXCEPTION 'apply_rls: system variant on %.% requires a visibility column (public rows are the whole point)', p_schema, p_table;
    END IF;
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (visibility = ''public'' OR created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, v_delpfx, p_token);
  ELSE
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, v_delpfx, p_token);
  END IF;

  IF v_has_vis THEN
    EXECUTE format(
      'CREATE POLICY pub_read ON %s FOR SELECT TO anon USING (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  END IF;

  -- std_insert: own-row OR (member of the target org) OR (target org is a
  -- global-readable system tenant AND caller is a super-admin) — the last
  -- clause is new, mirroring iam.has_access's existing system-tenant bypass.
  EXECUTE format(
    'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id) OR (organization_id IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable) AND public.is_super_admin())))',
    v_tbl);

  EXECUTE format(
    'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))) WITH CHECK (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))',
    v_tbl, v_delpfx, p_token, p_token);

  EXECUTE format(
    'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);
END
$function$;

-- Re-apply RLS to the 5 tables affected by this session's work, picking up
-- the fixed std_insert. Idempotent (apply_rls always drops+recreates its
-- own policies) and safe to re-run.
select iam.apply_rls('ai', 'provider', 'ai_provider', 'system');
select iam.apply_rls('ai', 'service', 'ai_service', 'system');
select iam.apply_rls('ai', 'offering', 'ai_offering', 'system');
select iam.apply_rls('ai', 'setting', 'ai_setting', 'system');
select iam.apply_rls('ai', 'model_definition', 'ai_model', 'system');
