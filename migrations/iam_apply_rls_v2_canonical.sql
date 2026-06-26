-- iam_apply_rls_v2_canonical.sql
-- ---------------------------------------------------------------------------
-- THE single canonical RLS generator. No table hand-writes its own policies.
--
-- Why this exists (the War Room INSERT bug, generalized):
--   The previous apply_rls (v1) predated iam.has_access and could not express
--   containment, so War Room + runtime.* hand-wrote `*_select` policies of the
--   form `iam.has_access(token, id, 'viewer')`. has_access re-reads the row BY
--   ID; during `INSERT ... RETURNING` (every supabase-js `.insert().select()`)
--   the SELECT policy runs against the still-in-flight row, the self-read finds
--   nothing, has_access returns false -> 42501 "new row violates RLS".
--
-- The canonical fix (rulebook db-canonical-access-model.md sec.4 step 3 / sec.5):
--   the OWNER is a DIRECT policy branch (`created_by = (select auth.uid())`),
--   read straight off the row -> available during RETURNING -> owner inserts
--   always pass. Everything non-owner delegates to the ONE resolver,
--   iam.has_access. Components carry no owner; they gate entirely on their
--   composition parent, whose id lives on the NEW row (also RETURNING-safe).
--
-- One generator, one resolver, zero hand-written RLS. Calling this on a table
-- DROPS every existing policy and recreates the canonical set, so it is the
-- only thing that ever governs a governed entity.
--
-- Idempotent: CREATE OR REPLACE + drop-all-then-recreate. Safe to re-run.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION iam.apply_rls(
  p_schema  text,
  p_table   text,
  p_token   text,
  p_variant text DEFAULT 'entity'   -- 'entity' (governed) | 'component' (auto from registry) | 'ledger'
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
  v_delpfx := CASE WHEN v_has_del THEN 'deleted_at IS NULL AND ' ELSE '' END;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_tbl);

  -- One canonical way: wipe every existing policy, recreate the canonical set.
  FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = v_tbl::regclass LOOP
    EXECUTE format('DROP POLICY %I ON %s', pol.polname, v_tbl);
  END LOOP;

  -- Backend (service role) always has full access.
  EXECUTE format(
    'CREATE POLICY svc_all ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)', v_tbl);

  -- ── ledger: org-scoped read; writes are service-role only ──────────────
  IF p_variant = 'ledger' THEN
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s iam.has_org_access(organization_id))',
      v_tbl, v_delpfx);
    RETURN;
  END IF;

  -- ── component: no own owner/visibility; gate entirely on composition parent ──
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

  -- ── standard governed entity: owner short-circuit + the one resolver ──
  -- Loud guard: a standard entity MUST carry the canonical owner/org columns.
  -- If it doesn't, it has not been base-retrofitted yet — refuse, don't silently
  -- emit a broken policy.
  IF NOT v_has_created THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;
  IF NOT v_has_org THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;

  -- SELECT: owner is a DIRECT branch (RETURNING-safe); everything else -> resolver.
  EXECUTE format(
    'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
    v_tbl, v_delpfx, p_token);

  -- INSERT: you may only create rows you own, in an org you belong to.
  -- (null org = personal / member-less context, allowed.)
  EXECUTE format(
    'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id)))',
    v_tbl);

  -- UPDATE: owner or editor (via resolver).
  EXECUTE format(
    'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))) WITH CHECK (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))',
    v_tbl, v_delpfx, p_token, p_token);

  -- DELETE: owner or admin (via resolver).
  EXECUTE format(
    'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);
END
$function$;

-- ── Apply to the tables broken by the v1/hand-written divergence ───────────
-- War Room (the reported break). Stable feature, safe to regenerate now.
SELECT iam.apply_rls('public', 'wr_sessions', 'war_room', 'entity');
SELECT iam.apply_rls('public', 'wr_threads',  'thread',   'entity');
