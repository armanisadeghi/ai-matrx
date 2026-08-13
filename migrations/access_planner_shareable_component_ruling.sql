-- access_planner_shareable_component_ruling.sql
--
-- KILL THE FAKE BLOCKER: `component_directly_shareable` ("Choose one model").
--
-- The planner flagged every component that is also in the shareable registry
-- as a decision blocker. That combination is not a conflict -- it is the
-- RATIFIED sharing model (SHARING_MODEL.md par.3, proven live 2026-08-12):
-- "A share point that is also a component keeps BOTH identities: its explicit
-- grant works (direct lanes apply to every registered row) AND it inherits
-- from its parents." web_page / web_property / web_screenshot / web_snapshot
-- are exactly this, and the proof matrix passed WITH them in this state.
--
-- Two changes to public.admin_access_planner_snapshot:
--   1. Disposition: is_component AND is_shareable => 'nested_entity'
--      ("Inherits from a parent and can still be granted directly") instead of
--      'component' ("has no independent access opinion" -- false for them).
--   2. The component_directly_shareable issue CASE is removed. Real drift is
--      still caught by the remaining checks: component_without_parent,
--      component_rls_mismatch, sharing_not_enforced_by_rls.
--
-- Base: the LIVE function body (includes the relkind guard), not the
-- 20260812000004 file.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_access_planner_snapshot(p_schema text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = p_schema) THEN
    RAISE EXCEPTION 'schema "%" does not exist', p_schema;
  END IF;

  WITH relations AS (
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.oid,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
      END AS relation_kind,
      GREATEST(c.reltuples::bigint, 0) AS estimated_rows,
      c.relrowsecurity AS rls_enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema
      AND c.relkind IN ('r', 'p', 'v', 'm')
  ), columns_by_relation AS (
    SELECT
      r.oid,
      jsonb_agg(
        jsonb_build_object(
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'nullable', NOT a.attnotnull,
          'primary', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index i
            WHERE i.indrelid = r.oid
              AND i.indisprimary
              AND a.attnum = ANY(i.indkey)
          )
        ) ORDER BY a.attnum
      ) AS columns,
      array_agg(a.attname ORDER BY a.attnum) AS column_names
    FROM relations r
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = r.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
    GROUP BY r.oid
  ), configured_relationships AS (
    SELECT
      er.child_type,
      er.parent_type,
      er.fk_column,
      er.kind,
      er.note,
      child.schema_name AS child_schema,
      child.table_name AS child_table,
      parent.schema_name AS parent_schema,
      parent.table_name AS parent_table
    FROM platform.entity_relationships er
    JOIN platform.entity_types child ON child.token = er.child_type
    JOIN platform.entity_types parent ON parent.token = er.parent_type
    WHERE child.is_active AND parent.is_active
      AND (child.schema_name = p_schema OR parent.schema_name = p_schema)
  ), table_state AS (
    SELECT
      r.*,
      et.token,
      et.label,
      et.is_component,
      et.rls_variant,
      et.default_visibility::text,
      et.content_role,
      sr.resource_type IS NOT NULL AS is_shareable,
      COALESCE(sr.rls_uses_has_permission, false) AS direct_grants,
      COALESCE(sr.is_link_shareable, false) AS link_shareable,
      COALESCE(sr.is_scopeable, false) AS scopeable,
      ex.reason AS exclusion_reason,
      COALESCE(cb.columns, '[]'::jsonb) AS columns,
      COALESCE(cb.column_names, ARRAY[]::text[]) AS column_names,
      (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid = r.oid) AS policy_count,
      COALESCE((
        SELECT array_agg(p.polname ORDER BY p.polname)
        FROM pg_catalog.pg_policy p WHERE p.polrelid = r.oid
      ), ARRAY[]::text[]) AS policy_names,
      EXISTS (
        SELECT 1 FROM configured_relationships cr
        WHERE cr.child_type = et.token AND cr.kind = 'composition'
      ) AS has_composition_parent,
      EXISTS (
        SELECT 1 FROM configured_relationships cr
        WHERE cr.child_type = et.token AND cr.kind = 'containment'
      ) AS has_containment_parent,
      (
        SELECT count(*) FROM configured_relationships cr
        WHERE cr.parent_type = et.token
      ) AS child_count,
      EXISTS (
        SELECT 1 FROM audit.m2m_candidates m
        WHERE m.schema_name = r.schema_name AND m.table_name = r.table_name
      ) AS is_many_to_many
    FROM relations r
    LEFT JOIN columns_by_relation cb ON cb.oid = r.oid
    LEFT JOIN platform.entity_types et
      ON et.schema_name = r.schema_name
     AND et.table_name = r.table_name
     AND et.is_active
    LEFT JOIN platform.shareable_resource_registry sr
      ON sr.resource_type = et.token
     AND sr.is_active
    LEFT JOIN meta.audit_exemption ex
      ON ex.check_name = 'access_planner_non_entity'
     AND ex.schema_name = r.schema_name
     AND ex.table_name = r.table_name
  ), table_output AS (
    SELECT
      ts.*,
      CASE
        WHEN ts.relation_kind IN ('view', 'materialized_view') THEN 'derived'
        WHEN ts.exclusion_reason IS NOT NULL THEN 'infrastructure'
        WHEN ts.token IS NULL THEN 'unplanned'
        -- THE DUAL-IDENTITY RULING (SHARING_MODEL.md par.3, Arman 2026-08-12): a
        -- component registered as a share point keeps BOTH identities -- its
        -- explicit grants work AND it inherits from its parents. That is the
        -- nested_entity disposition, not a conflict.
        WHEN ts.is_component AND ts.is_shareable THEN 'nested_entity'
        WHEN ts.is_component THEN 'component'
        WHEN ts.has_containment_parent THEN 'nested_entity'
        ELSE 'entity'
      END AS disposition,
      array_remove(ARRAY[
        CASE WHEN ts.relation_kind IN ('table', 'partitioned_table')
               AND ts.token IS NULL AND ts.exclusion_reason IS NULL
          THEN 'unplanned_table' END,
        CASE WHEN ts.token IS NOT NULL AND NOT ts.rls_enabled
          THEN 'rls_disabled' END,
        CASE WHEN ts.token IS NOT NULL AND ts.policy_count = 0
          THEN 'no_policies' END,
        CASE WHEN ts.is_component AND NOT ts.has_composition_parent
          THEN 'component_without_parent' END,
        CASE WHEN ts.is_component AND COALESCE(ts.rls_variant, '') <> 'component'
          THEN 'component_rls_mismatch' END,
        CASE WHEN ts.token IS NOT NULL AND NOT ts.is_component
               AND ts.rls_variant = 'component'
          THEN 'entity_rls_mismatch' END,
        CASE WHEN ts.has_containment_parent AND NOT ('visibility' = ANY(ts.column_names))
          THEN 'containment_without_visibility' END,
        CASE WHEN ts.is_shareable AND NOT ts.direct_grants
          THEN 'sharing_not_enforced_by_rls' END
      ], NULL)::text[] AS issue_codes,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'check', f.check_name,
          'status', f.status,
          'detail', f.detail
        ) ORDER BY f.status, f.check_name)
        FROM audit.canonical_findings f
        WHERE f.schema_name = ts.schema_name
          AND f.table_name = ts.table_name
          AND f.status IN ('FAIL', 'WARN')
      ), '[]'::jsonb) AS canonical_findings
    FROM table_state ts
  ), fk_parts AS (
    SELECT
      con.oid,
      con.conname,
      src_ns.nspname AS source_schema,
      src.relname AS source_table,
      tgt_ns.nspname AS target_schema,
      tgt.relname AS target_table,
      array_agg(src_a.attname::text ORDER BY pair.ordinality) AS source_columns,
      array_agg(tgt_a.attname::text ORDER BY pair.ordinality) AS target_columns
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
    JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_catalog.pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_catalog.pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
      AS pair(source_attnum, target_attnum, ordinality) ON true
    JOIN pg_catalog.pg_attribute src_a
      ON src_a.attrelid = src.oid AND src_a.attnum = pair.source_attnum
    JOIN pg_catalog.pg_attribute tgt_a
      ON tgt_a.attrelid = tgt.oid AND tgt_a.attnum = pair.target_attnum
    WHERE con.contype = 'f'
      AND (src_ns.nspname = p_schema OR tgt_ns.nspname = p_schema)
    GROUP BY con.oid, con.conname, src_ns.nspname, src.relname,
             tgt_ns.nspname, tgt.relname
  ), foreign_keys AS (
    SELECT
      fk.*,
      source_et.token AS source_token,
      source_et.label AS source_label,
      target_et.token AS target_token,
      target_et.label AS target_label,
      COALESCE(cr.kind, 'none') AS access_effect,
      cr.note AS access_note,
      (
        fk.source_schema IN ('auth','iam','platform','meta','audit','history','graveyard')
        OR fk.target_schema IN ('auth','iam','platform','meta','audit','history','graveyard')
        OR fk.source_columns && ARRAY['organization_id','created_by','updated_by']::text[]
      ) AS is_plumbing
    FROM fk_parts fk
    LEFT JOIN platform.entity_types source_et
      ON source_et.schema_name = fk.source_schema
     AND source_et.table_name = fk.source_table
     AND source_et.is_active
    LEFT JOIN platform.entity_types target_et
      ON target_et.schema_name = fk.target_schema
     AND target_et.table_name = fk.target_table
     AND target_et.is_active
    LEFT JOIN configured_relationships cr
      ON cr.child_type = source_et.token
     AND cr.parent_type = target_et.token
     AND cr.fk_column = fk.source_columns[1]
    WHERE fk.source_schema = p_schema
       OR fk.target_schema = p_schema
  ), schema_stats AS (
    SELECT
      n.nspname AS schema_name,
      count(*) FILTER (WHERE c.relkind IN ('r','p')) AS table_count,
      count(*) FILTER (
        WHERE c.relkind IN ('r','p')
          AND (et.token IS NOT NULL OR ex.reason IS NOT NULL)
      ) AS planned_count
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
    LEFT JOIN platform.entity_types et
      ON et.schema_name = n.nspname AND et.table_name = c.relname AND et.is_active
    LEFT JOIN meta.audit_exemption ex
      ON ex.check_name = 'access_planner_non_entity'
     AND ex.schema_name = n.nspname AND ex.table_name = c.relname
    WHERE c.relkind IN ('r','p')
      AND n.nspname NOT IN (
        'pg_catalog','information_schema','pg_toast','auth','storage','realtime',
        'extensions','graphql','graphql_public','supabase_functions','vault',
        'graveyard','audit','meta','history','platform'
      )
      AND n.nspname NOT LIKE 'pg_temp%'
      AND n.nspname NOT LIKE 'pg_toast_temp%'
    GROUP BY n.nspname
  )
  SELECT jsonb_build_object(
    'schema', p_schema,
    'generated_at', clock_timestamp(),
    'schemas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schema_name', s.schema_name,
        'table_count', s.table_count,
        'planned_count', s.planned_count
      ) ORDER BY s.schema_name)
      FROM schema_stats s
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg((to_jsonb(t) - 'oid') ORDER BY t.table_name)
      FROM table_output t
    ), '[]'::jsonb),
    'foreign_keys', COALESCE((
      SELECT jsonb_agg((to_jsonb(f) - 'oid') ORDER BY f.source_schema, f.source_table, f.conname)
      FROM foreign_keys f
    ), '[]'::jsonb),
    'access_relationships', COALESCE((
      SELECT jsonb_agg(to_jsonb(cr) ORDER BY cr.child_schema, cr.child_table, cr.kind)
      FROM configured_relationships cr
    ), '[]'::jsonb),
    'association_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'source_type', ar.source_type,
        'target_type', ar.target_type,
        'label', ar.label,
        'container_side', ar.container_side,
        'conveys_max', ar.conveys_max::text,
        'is_active', ar.is_active,
        'notes', ar.notes,
        'source_schema', source_et.schema_name,
        'source_table', source_et.table_name,
        'source_label', source_et.label,
        'target_schema', target_et.schema_name,
        'target_table', target_et.table_name,
        'target_label', target_et.label
      ) ORDER BY ar.source_type, ar.target_type, ar.label)
      FROM platform.association_types ar
      JOIN platform.entity_types source_et ON source_et.token = ar.source_type
      JOIN platform.entity_types target_et ON target_et.token = ar.target_type
      WHERE ar.is_active
        AND (source_et.schema_name = p_schema OR target_et.schema_name = p_schema)
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END
$function$
;

COMMIT;
