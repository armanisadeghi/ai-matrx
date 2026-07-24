-- access_matrix_probe_helpers.sql  (P4 / acceptance matrix + drift guards)
--
-- Three service-role-ONLY probe RPCs that power `pnpm check:access-matrix`
-- and `pnpm check:access-drift` (scripts/access-matrix/). They are test
-- instruments, not a new security layer: read-only, EXECUTE revoked from
-- anon/authenticated, and every access decision they report is made by the
-- existing kernel/RLS — never by logic of their own.
--
--   public.rls_count_as(user, schema, table, col, val)
--       True RLS evaluation: switches the transaction-local role to
--       `authenticated` with request.jwt claims for p_user, counts visible
--       rows, and lets the transaction end revert everything. This is what
--       catches judge-yes/RLS-zero-rows contradictions (the rag.data_stores
--       bug of 2026-07-23). Returns -1 (with a WARNING) when the count
--       itself errors (e.g. missing schema USAGE — itself a finding).
--
--   public.access_matrix_tree(store)
--       Enumerates the knowledge tree under a store (members, files, docs,
--       page/image/chunk/extraction ids + counts) so the matrix script can
--       probe every level without N ad-hoc queries against unexposed schemas.
--
--   public.access_drift_report()
--       SQL-side drift guards: edge coverage (member -> edge -> reachability),
--       unruled member kinds, dead policies (policy present, privilege
--       absent), entity_relationships registry cycles, orphan members.
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. rls_count_as — count rows visible to p_user under real RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_count_as(
  p_user uuid,
  p_schema text,
  p_table text,
  p_where_col text DEFAULT NULL,
  p_where_val text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose: Postgres forbids SET ROLE inside a
-- SECURITY DEFINER function (42501). Callable only by superuser-ish admin
-- paths (Supabase MCP execute_sql / db owner) which may SET ROLE; the TS
-- guard scripts probe RLS with REAL user JWTs over PostgREST instead.
SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_sql text;
BEGIN
  IF p_user IS NULL OR p_schema IS NULL OR p_table IS NULL THEN
    RETURN -1;
  END IF;
  -- Impersonate p_user for THIS TRANSACTION only. set_config(..., is_local
  -- => true) has SET LOCAL semantics: it reverts at transaction end whether
  -- COMMIT or ROLLBACK, so nothing can leak into a pooled connection.
  -- Callers embedding this in a larger multi-statement transaction inherit
  -- the switched role for the REST OF THAT TRANSACTION — service_role-only
  -- EXECUTE plus single-statement PostgREST/MCP calls is the operating mode.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
                     true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_sql := format('SELECT count(*) FROM %I.%I', p_schema, p_table);
  IF p_where_col IS NOT NULL THEN
    v_sql := v_sql || format(' WHERE %I::text = $1', p_where_col);
  END IF;

  BEGIN
    IF p_where_col IS NOT NULL THEN
      EXECUTE v_sql INTO v_count USING p_where_val;
    ELSE
      EXECUTE v_sql INTO v_count;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[rls_count_as] % on %.% as % -> ERROR %: %',
      v_sql, p_schema, p_table, p_user, SQLSTATE, SQLERRM;
    RETURN -1;
  END;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rls_count_as(uuid, text, text, text, text) IS
  'TEST PROBE (admin/MCP only — SECURITY INVOKER, needs SET ROLE privilege): rows of schema.table visible to p_user under real RLS (transaction-local role/claims switch). -1 = the read itself errored (often missing schema USAGE — a finding).';

REVOKE ALL ON FUNCTION public.rls_count_as(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_count_as(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rls_count_as(uuid, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.rls_count_as(uuid, text, text, text, text) FROM service_role;

-- ---------------------------------------------------------------------------
-- 2. access_matrix_tree — enumerate the knowledge tree under a store
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.access_matrix_tree(p_store uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, rag, docproc, files, platform
AS $$
  SELECT jsonb_build_object(
    'store', (SELECT jsonb_build_object('id', ds.id, 'name', ds.name, 'kind', ds.kind,
                                        'organization_id', ds.organization_id)
              FROM rag.data_stores ds WHERE ds.id = p_store),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source_kind', dm.source_kind, 'source_id', dm.source_id))
      FROM rag.data_store_members dm
      WHERE dm.data_store_id = p_store AND dm.deleted_at IS NULL), '[]'::jsonb),
    'files', COALESCE((
      SELECT jsonb_agg(DISTINCT dm.source_id)
      FROM rag.data_store_members dm
      WHERE dm.data_store_id = p_store AND dm.deleted_at IS NULL
        AND dm.source_kind = 'cld_file'
        AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb),
    'docs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pd.id, 'archived', pd.archived_at IS NOT NULL))
      FROM docproc.processed_documents pd
      JOIN rag.data_store_members dm
        ON dm.data_store_id = p_store AND dm.deleted_at IS NULL
       AND dm.source_kind = pd.source_kind AND dm.source_id = pd.source_id::text
      WHERE pd.deleted_at IS NULL), '[]'::jsonb),
    'page_image_files', COALESCE((
      SELECT jsonb_agg(x.image_cld_file_id)
      FROM (
        SELECT DISTINCT pp.image_cld_file_id
        FROM docproc.processed_document_pages pp
        JOIN docproc.processed_documents pd ON pd.id = pp.processed_document_id AND pd.deleted_at IS NULL
        JOIN rag.data_store_members dm
          ON dm.data_store_id = p_store AND dm.deleted_at IS NULL
         AND dm.source_kind = pd.source_kind AND dm.source_id = pd.source_id::text
        WHERE pp.image_cld_file_id IS NOT NULL
        LIMIT 3
      ) x), '[]'::jsonb),
    'extraction_jobs', COALESCE((
      SELECT jsonb_agg(DISTINCT j.id)
      FROM docproc.page_extraction_jobs j
      JOIN rag.data_store_members dm
        ON dm.data_store_id = p_store AND dm.deleted_at IS NULL
       AND dm.source_kind = 'cld_file'
      WHERE (j.file_id::text = dm.source_id
             OR j.processed_document_id IN (
                  SELECT pd.id FROM docproc.processed_documents pd
                  WHERE pd.source_kind = dm.source_kind AND pd.source_id = dm.source_id
                    AND pd.deleted_at IS NULL))), '[]'::jsonb),
    'chunk_count', (
      SELECT count(*)
      FROM rag.kg_chunks c
      JOIN rag.data_store_members dm
        ON dm.data_store_id = p_store AND dm.deleted_at IS NULL
       AND c.source_kind = dm.source_kind AND c.source_id = dm.source_id
    )
  );
$$;

COMMENT ON FUNCTION public.access_matrix_tree(uuid) IS
  'TEST PROBE (service_role only): enumerate ids/counts of the knowledge tree under a data store for the acceptance matrix script.';

REVOKE ALL ON FUNCTION public.access_matrix_tree(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.access_matrix_tree(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.access_matrix_tree(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.access_matrix_tree(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. access_drift_report — the SQL-side drift guards
-- ---------------------------------------------------------------------------
-- Row-level cycle detector for self-referencing containment registrations
-- (child_type = parent_type in platform.entity_relationships). A row whose
-- parent chain loops (A -> B -> A) would infinitely recurse the kernel's
-- containment walk at RLS time.
CREATE OR REPLACE FUNCTION public.detect_self_containment_row_cycles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, platform
AS $$
DECLARE
  rec record;
  v_schema text; v_table text;
  v_found jsonb := '[]'::jsonb;
  v_batch jsonb;
BEGIN
  FOR rec IN
    SELECT er.child_type, er.fk_column
    FROM platform.entity_relationships er
    WHERE er.child_type = er.parent_type
  LOOP
    SELECT et.schema_name, et.table_name INTO v_schema, v_table
    FROM platform.entity_types et WHERE et.token = rec.child_type;
    CONTINUE WHEN v_schema IS NULL;
    BEGIN
      EXECUTE format($q$
        WITH RECURSIVE chain AS (
          SELECT t.id AS start_id, t.%1$I AS parent, 1 AS depth, false AS cycle
          FROM %2$I.%3$I t
          WHERE t.%1$I IS NOT NULL
          UNION ALL
          SELECT c.start_id, t.%1$I, c.depth + 1, t.id = c.start_id
          FROM chain c
          JOIN %2$I.%3$I t ON t.id = c.parent
          WHERE NOT c.cycle AND c.depth < 50
        )
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                 'type', %4$L, 'id', start_id)), '[]'::jsonb)
        FROM chain WHERE cycle
      $q$, rec.fk_column, v_schema, v_table, rec.child_type)
      INTO v_batch;
      v_found := v_found || COALESCE(v_batch, '[]'::jsonb);
    EXCEPTION WHEN others THEN
      v_found := v_found || jsonb_build_array(jsonb_build_object(
        'type', rec.child_type, 'error', SQLERRM));
    END;
  END LOOP;
  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_self_containment_row_cycles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detect_self_containment_row_cycles() FROM anon;
REVOKE ALL ON FUNCTION public.detect_self_containment_row_cycles() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.detect_self_containment_row_cycles() TO service_role;

CREATE OR REPLACE FUNCTION public.access_drift_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, rag, platform, iam
AS $$
  SELECT jsonb_build_object(
    -- (1a) live members whose kind HAS a registered conveying rule but NO edge
    'members_missing_edge', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('store', dm.data_store_id,
                                          'source_kind', dm.source_kind,
                                          'source_id', dm.source_id))
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL
        AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM platform.association_types r
          WHERE r.source_type = rag.member_source_entity_token(dm.source_kind)
            AND r.target_type = 'data_store' AND r.is_active)
        AND NOT EXISTS (
          SELECT 1 FROM platform.associations a
          WHERE a.source_type = rag.member_source_entity_token(dm.source_kind)
            AND a.source_id = dm.source_id::uuid
            AND a.target_type = 'data_store' AND a.target_id = dm.data_store_id
            AND a.role IS NOT DISTINCT FROM 'library_member')), '[]'::jsonb),
    -- (1b) member kinds with NO registered rule (deliberate kinds are listed
    --      in features/rag/FEATURE.md; anything NOT documented there is drift)
    'unruled_member_kinds', COALESCE((
      SELECT jsonb_agg(DISTINCT dm.source_kind)
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM platform.association_types r
          WHERE r.source_type = rag.member_source_entity_token(dm.source_kind)
            AND r.target_type = 'data_store' AND r.is_active)), '[]'::jsonb),
    -- (1c) conveying edges with no reachability row (closure went stale)
    'edges_missing_reachability', (
      SELECT count(*)
      FROM platform.associations a
      JOIN platform.association_types r
        ON r.source_type = a.source_type AND r.target_type = a.target_type
       AND r.is_active AND r.conveys_max IS NOT NULL AND r.container_side = 'target'
      WHERE NOT EXISTS (
        SELECT 1 FROM platform.reachability rr
        WHERE rr.item_type = a.source_type AND rr.item_id = a.source_id
          AND rr.container_type = a.target_type AND rr.container_id = a.target_id)),
    -- (2) dead policies: SELECT-ish policy for authenticated on a table where
    --     authenticated lacks schema USAGE or any SELECT privilege
    'dead_policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('schema', p.schemaname, 'table', p.tablename,
                                          'policy', p.policyname, 'cmd', p.cmd,
                                          'missing', CASE
                                            WHEN NOT has_schema_privilege('authenticated', p.schemaname, 'USAGE')
                                              THEN 'schema USAGE'
                                            ELSE 'table/column SELECT' END))
      FROM pg_policies p
      WHERE p.cmd IN ('SELECT', 'ALL')
        AND (p.roles::text LIKE '%authenticated%' OR p.roles::text = '{public}')
        AND p.schemaname NOT IN ('storage', 'realtime', 'graveyard')
        AND (
          NOT has_schema_privilege('authenticated', p.schemaname, 'USAGE')
          OR (
            NOT has_table_privilege('authenticated',
                  format('%I.%I', p.schemaname, p.tablename), 'SELECT')
            AND NOT has_any_column_privilege('authenticated',
                  format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT')))), '[]'::jsonb),
    -- (3) registry cycles (would stack-overflow has_access_for_base).
    --     TYPE-level: a loop across DIFFERENT types (A->B->A). A direct
    --     self-edge (folder->folder) is legitimate hierarchy, so the real
    --     danger there is ROW-level loops — checked separately below.
    'registry_cycles', COALESCE((
      WITH RECURSIVE walk AS (
        SELECT er.child_type, er.parent_type, ARRAY[er.child_type] AS path,
               false AS cycle
        FROM platform.entity_relationships er
        WHERE er.child_type <> er.parent_type
        UNION ALL
        SELECT w.child_type, er.parent_type, w.path || er.child_type,
               er.parent_type = ANY(w.path)
        FROM walk w
        JOIN platform.entity_relationships er
          ON er.child_type = w.parent_type AND er.child_type <> er.parent_type
        WHERE NOT w.cycle AND array_length(w.path, 1) < 20
      )
      SELECT jsonb_agg(DISTINCT to_jsonb(w.path || w.parent_type))
      FROM walk w WHERE w.cycle), '[]'::jsonb),
    -- (3b) ROW-level cycles inside each self-referencing containment table
    --      (e.g. a folder whose parent chain loops back to itself)
    'row_cycles', COALESCE(public.detect_self_containment_row_cycles(), '[]'::jsonb),
    -- (4) orphan members (should stay 0 after D-F)
    'orphan_members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('store', dm.data_store_id, 'source_id', dm.source_id))
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL AND dm.source_kind = 'cld_file'
        AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
          SELECT 1 FROM files.files f
          WHERE f.id = dm.source_id::uuid AND f.deleted_at IS NULL)), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.access_drift_report() IS
  'TEST PROBE (service_role only): SQL-side access drift guards for pnpm check:access-drift — edge coverage, unruled member kinds, stale reachability, dead policies, registry cycles, orphan members.';

REVOKE ALL ON FUNCTION public.access_drift_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.access_drift_report() FROM anon;
REVOKE ALL ON FUNCTION public.access_drift_report() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.access_drift_report() TO service_role;
