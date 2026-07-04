-- iam_apply_rls_v2_soft_delete_select_fix.sql
--
-- CLASS FIX — soft-delete (and restore) were broken app-wide by canonical RLS.
--
-- ROOT CAUSE
-- The canonical RLS generator `iam.apply_rls` prefixed every AUTHENTICATED policy
-- (`std_select`, and the standard `std_update` USING) with `deleted_at IS NULL AND …`
-- via `v_delpfx`. PostgreSQL, on an UPDATE, RE-CHECKS the table's SELECT policy
-- against the NEW row. A soft-delete sets `deleted_at` to a non-null value, so the
-- new row fails `deleted_at IS NULL` in `std_select` → the whole UPDATE is rejected
-- with 42501 "new row violates row-level security policy". Symmetrically, the
-- `std_update` USING gate `deleted_at IS NULL` made RESTORE (un-delete) a silent
-- no-op (0 rows) — you cannot UPDATE an already-deleted row.
--
-- Proven empirically on workspace.war_rooms: relaxing ONLY std_select made the
-- soft-delete succeed; forcing std_update's WITH CHECK to true did NOT (the blocker
-- is the SELECT policy, re-evaluated on the new row).
--
-- BLAST RADIUS: ~107 tables across every schema (notes, files, tasks, threads,
-- conversations, agents, flashcards, podcasts, code, DMs, …) — every soft-deletable
-- entity produced by the generator.
--
-- THE INVARIANT (going forward)
--   `deleted_at IS NULL` belongs ONLY in the anon / public-visibility read policy
--   (`pub_read`, and hand-written `*_public_select`). AUTHENTICATED access policies
--   must NEVER gate on `deleted_at`: the application filters soft-deletes in its own
--   queries (e.g. `.is('deleted_at', null)`), and RLS handles AUTHORIZATION only.
--   The anon path keeps the filter so the public web never sees deleted content;
--   anon never UPDATEs, so it never conflicts with the new-row re-check.
--
-- This migration is idempotent and self-verifying (raises loudly if any authenticated
-- access policy still gates deleted_at after the strip).

-- migrate: idempotent

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Fix the generator. `v_delpfx` is now applied ONLY to the anon `pub_read`
--    policy. Every authenticated std_select variant and the standard std_update
--    USING drop the deleted_at gate.
-- ────────────────────────────────────────────────────────────────────────────
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
  -- deleted_at gate lives ONLY on the anon pub_read policy (see invariant above).
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

  IF v_is_component OR p_variant = 'component' THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships
    WHERE child_type = p_token AND kind = 'composition' LIMIT 1;
    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    END IF;

    -- Orphan-capable component (2026-07-03): nullable composition fk +
    -- created_by => a row without a parent belongs to its creator.
    SELECT (c.is_nullable = 'YES') INTO v_parent_optional
    FROM information_schema.columns c
    WHERE c.table_schema=p_schema AND c.table_name=p_table AND c.column_name=v_parent_col;
    v_parent_optional := COALESCE(v_parent_optional, false) AND v_has_created;

    IF v_parent_optional THEN
      EXECUTE format(
        'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (((%I IS NOT NULL AND iam.has_access(%L, %I, ''viewer'')) OR (%I IS NULL AND created_by = (select auth.uid()))))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid()))) WITH CHECK ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col,
        v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      RETURN;
    END IF;

    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (iam.has_access(%L, %I, ''viewer''))',
      v_tbl, v_parent_type, v_parent_col);
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Strip the deleted_at gate from every EXISTING authenticated access policy
--    (SELECT + UPDATE USING). Targets only policies that reference an access
--    predicate (created_by / has_access / has_permission / has_org_access) — this
--    excludes anon pub_read / *_public_select (which reference only `visibility`),
--    so the public-web deleted-row filter is preserved. Idempotent.
-- ────────────────────────────────────────────────────────────────────────────
DO $strip$
DECLARE r record; new_expr text; n int := 0;
BEGIN
  FOR r IN
    SELECT pol.polname AS polname, ns.nspname AS sch, c.relname AS tbl,
           pg_get_expr(pol.polqual, pol.polrelid) AS ue
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE pol.polcmd IN ('r','w')  -- SELECT + UPDATE (USING)
      AND pg_get_expr(pol.polqual, pol.polrelid) LIKE '%deleted_at IS NULL%'
      AND pg_get_expr(pol.polqual, pol.polrelid) ~ '(created_by|has_access|has_permission|has_org_access)'
  LOOP
    new_expr := regexp_replace(r.ue, '\(deleted_at IS NULL\) AND ', '');
    IF new_expr <> r.ue AND new_expr NOT LIKE '%deleted_at%' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.polname, r.sch, r.tbl, new_expr);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'apply_rls soft-delete fix: stripped deleted_at gate from % authenticated access USING clauses', n;
END
$strip$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2b) Same for WITH CHECK clauses on authenticated INSERT/UPDATE policies. Some
--     hand-written policies (files.files/files.folders) put `deleted_at IS NULL`
--     directly in the UPDATE WITH CHECK — which OUTRIGHT forbids setting deleted_at
--     (soft-delete → 42501). A bare `(deleted_at IS NULL)` check is replaced by the
--     policy's own USING access predicate (canonical: USING = WITH CHECK); a
--     prefixed/suffixed one is just stripped. Idempotent.
-- ────────────────────────────────────────────────────────────────────────────
DO $stripcheck$
DECLARE r record; new_check text; n int := 0;
BEGIN
  FOR r IN
    SELECT pol.polname AS polname, ns.nspname AS sch, c.relname AS tbl,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS wc,
           pg_get_expr(pol.polqual, pol.polrelid) AS ue
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE pol.polcmd IN ('a','w')  -- INSERT + UPDATE (WITH CHECK)
      AND pol.polwithcheck IS NOT NULL
      AND pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%deleted_at IS NULL%'
      AND (0 = ANY(pol.polroles)  -- public
           OR EXISTS (SELECT 1 FROM pg_roles WHERE oid = ANY(pol.polroles) AND rolname = 'authenticated'))
  LOOP
    new_check := regexp_replace(r.wc, '\(deleted_at IS NULL\) AND ', '');
    new_check := regexp_replace(new_check, ' AND \(deleted_at IS NULL\)', '');
    IF new_check LIKE '%deleted_at%' THEN
      -- the WITH CHECK was (only) the deleted_at gate → use the access predicate instead
      new_check := COALESCE(NULLIF(r.ue, ''), 'true');
    END IF;
    IF new_check <> r.wc AND new_check NOT LIKE '%deleted_at%' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.polname, r.sch, r.tbl, new_check);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'apply_rls soft-delete fix: cleaned deleted_at from % authenticated WITH CHECK clauses', n;
END
$stripcheck$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Loud self-verification — fail the migration if ANY authenticated access
--    policy still gates deleted_at (a soft-delete on that table would still 42501).
-- ────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE leftover int; leftlist text;
BEGIN
  SELECT count(*), string_agg(ns.nspname||'.'||c.relname||'.'||pol.polname||' ['||where_clause||']', ', ')
    INTO leftover, leftlist
  FROM (
    -- USING gates on authenticated access SELECT/UPDATE policies
    SELECT pol.polrelid, pol.polname, 'USING' AS where_clause
    FROM pg_policy pol
    WHERE pol.polcmd IN ('r','w')
      AND pg_get_expr(pol.polqual, pol.polrelid) LIKE '%deleted_at IS NULL%'
      AND pg_get_expr(pol.polqual, pol.polrelid) ~ '(created_by|has_access|has_permission|has_org_access)'
    UNION ALL
    -- WITH CHECK gates on authenticated INSERT/UPDATE policies
    SELECT pol.polrelid, pol.polname, 'WITH CHECK' AS where_clause
    FROM pg_policy pol
    WHERE pol.polcmd IN ('a','w')
      AND pol.polwithcheck IS NOT NULL
      AND pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%deleted_at IS NULL%'
      AND (0 = ANY(pol.polroles)
           OR EXISTS (SELECT 1 FROM pg_roles WHERE oid = ANY(pol.polroles) AND rolname = 'authenticated'))
  ) bad
  JOIN pg_class c ON c.oid = bad.polrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'apply_rls soft-delete fix INCOMPLETE: % authenticated policy clauses still gate deleted_at: %', leftover, leftlist;
  END IF;
END
$verify$;
