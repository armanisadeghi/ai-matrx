-- Reachability standing guards — 2026-08-21
--
-- Closes risks (1) and (2) of the 2026-08-15 architecture drift audit, finding 8
-- (common-docs/projects/archive/db-changeover-2026-08/architecture-drift-audit-2026-08-15.md),
-- adjudicated 2026-08-21.
--
-- `platform.reachability` is a trigger-maintained closure cache and is now
-- load-bearing for access decisions (iam.has_access / has_access_for). Two
-- structural risks had no guard:
--
--   1. The reachability trigger's `UPDATE OF` column list matches the columns
--      `platform.containment_edges` actually reads off `platform.associations`
--      only by MANUAL synchronization. One forgotten column = silent staleness.
--      -> platform.reachability_definition_parity()
--
--   2. Nothing ever proves the cache still equals what the walk would derive.
--      -> platform.reachability_drift()
--
-- Both are read-only. Neither is scheduled here: recurring execution requires
-- Arman's approval by name and interval (common-docs/policies/no-unapproved-schedules.md);
-- the proposal sits on the attention board. Invocation today is manual /
-- release-gate, via scripts/access-matrix/check-reachability-guards.ts.

-- ---------------------------------------------------------------------------
-- 1. Definition parity: view dependencies vs trigger UPDATE OF list
-- ---------------------------------------------------------------------------
-- Returns one row per `platform.associations` column that `containment_edges`
-- depends on but the reachability trigger does NOT watch. Empty = in parity.
--
-- The view's true dependencies come from pg_depend (the columns the planner
-- recorded when the view was created) rather than from re-parsing
-- pg_get_viewdef() text — same set, but exact rather than regex-approximate.
-- The trigger's watched set is pg_trigger.tgattr.
CREATE OR REPLACE FUNCTION platform.reachability_definition_parity()
RETURNS TABLE(missing_column text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH view_cols AS (
    SELECT DISTINCT att.attname::text AS col
    FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_catalog.pg_attribute att
      ON att.attrelid = d.refobjid AND att.attnum = d.refobjsubid
    WHERE rw.ev_class    = 'platform.containment_edges'::regclass
      AND d.refobjid     = 'platform.associations'::regclass
      AND d.refobjsubid  > 0
  ),
  trigger_cols AS (
    SELECT att.attname::text AS col
    FROM pg_catalog.pg_trigger t
    CROSS JOIN LATERAL unnest(t.tgattr) AS u(attnum)
    JOIN pg_catalog.pg_attribute att
      ON att.attrelid = t.tgrelid AND att.attnum = u.attnum
    WHERE t.tgrelid = 'platform.associations'::regclass
      AND t.tgname  = 'trg_associations_reachability'
  )
  SELECT v.col FROM view_cols v
  WHERE NOT EXISTS (SELECT 1 FROM trigger_cols tc WHERE tc.col = v.col)
  ORDER BY 1;
$function$;

COMMENT ON FUNCTION platform.reachability_definition_parity() IS
  'Standing guard (2026-08-21): every platform.associations column containment_edges reads must appear in trg_associations_reachability UPDATE OF. Non-empty result = silent-staleness risk.';

REVOKE ALL ON FUNCTION platform.reachability_definition_parity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.reachability_definition_parity() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Drift: cache vs a fresh derivation, both directions, all depths
-- ---------------------------------------------------------------------------
-- FULL OUTER JOIN of platform.reachability against a fresh walk of every
-- container currently present in containment_edges. Returns ONLY the
-- disagreeing rows; empty result = the cache is exactly what the walk derives.
--
-- Covers all four failure shapes the old advisory check could not see:
--   missing_in_cache  — the trigger never wrote it (or a write bypassed it)
--   extra_in_cache    — a container/edge died and the row survived
--   depth_mismatch    — the shortest path changed
--   level_mismatch    — conveys_max changed along the path
--
-- Cost note: this is a full re-derivation. Measured 2026-08-21 at 468 distinct
-- containers / 3,734 edges / 4,476 cached rows -> a few seconds. Run it under a
-- generous statement_timeout, and re-measure before scheduling it as the graph
-- grows.
CREATE OR REPLACE FUNCTION platform.reachability_drift()
RETURNS TABLE(
  container_type    text,
  container_id      uuid,
  item_type         text,
  item_id           uuid,
  disagreement      text,
  cached_depth      integer,
  derived_depth     integer,
  cached_max_level  public.permission_level,
  derived_max_level public.permission_level
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH derived AS (
    SELECT c.container_type, c.container_id,
           d.item_type, d.item_id, d.depth, d.max_level
    FROM (SELECT DISTINCT ce.container_type, ce.container_id
          FROM platform.containment_edges ce) c
    CROSS JOIN LATERAL platform.derive_reachability(c.container_type, c.container_id) d
  )
  SELECT
    COALESCE(r.container_type, d.container_type) AS container_type,
    COALESCE(r.container_id,   d.container_id)   AS container_id,
    COALESCE(r.item_type,      d.item_type)      AS item_type,
    COALESCE(r.item_id,        d.item_id)        AS item_id,
    CASE
      WHEN d.item_id IS NULL THEN 'extra_in_cache'
      WHEN r.item_id IS NULL THEN 'missing_in_cache'
      WHEN r.depth IS DISTINCT FROM d.depth
       AND r.max_level IS DISTINCT FROM d.max_level THEN 'depth_and_level_mismatch'
      WHEN r.depth IS DISTINCT FROM d.depth THEN 'depth_mismatch'
      ELSE 'level_mismatch'
    END AS disagreement,
    r.depth     AS cached_depth,
    d.depth     AS derived_depth,
    r.max_level AS cached_max_level,
    d.max_level AS derived_max_level
  FROM platform.reachability r
  FULL OUTER JOIN derived d
    ON  d.container_type = r.container_type
    AND d.container_id   = r.container_id
    AND d.item_type      = r.item_type
    AND d.item_id        = r.item_id
  WHERE r.item_id IS NULL
     OR d.item_id IS NULL
     OR r.depth     IS DISTINCT FROM d.depth
     OR r.max_level IS DISTINCT FROM d.max_level;
$function$;

COMMENT ON FUNCTION platform.reachability_drift() IS
  'Standing guard (2026-08-21): FULL OUTER JOIN of platform.reachability vs a fresh derive_reachability() walk. Empty = consistent. Non-zero = a defect; heal with platform.rebuild_reachability() and file the firing.';

REVOKE ALL ON FUNCTION platform.reachability_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.reachability_drift() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. PostgREST-facing report (service-role channel, like access_drift_report)
-- ---------------------------------------------------------------------------
-- One round trip for the release gate: parity verdict + drift counts + a
-- bounded sample of disagreeing rows.
CREATE OR REPLACE FUNCTION public.reachability_guard_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH drift AS (SELECT * FROM platform.reachability_drift())
  SELECT jsonb_build_object(
    'parity_missing_columns',
      COALESCE((SELECT jsonb_agg(p.missing_column ORDER BY p.missing_column)
                FROM platform.reachability_definition_parity() p), '[]'::jsonb),
    'drift_total',      (SELECT count(*) FROM drift),
    'drift_by_kind',
      COALESCE((SELECT jsonb_object_agg(k.disagreement, k.n)
                FROM (SELECT disagreement, count(*) AS n FROM drift GROUP BY 1) k),
               '{}'::jsonb),
    'drift_sample',
      COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM drift LIMIT 25) s),
               '[]'::jsonb),
    'cached_rows',      (SELECT count(*) FROM platform.reachability),
    'containers',       (SELECT count(*) FROM (SELECT DISTINCT ce.container_type, ce.container_id
                                               FROM platform.containment_edges ce) c),
    'checked_at',       now()
  );
$function$;

COMMENT ON FUNCTION public.reachability_guard_report() IS
  'Standing guard report (2026-08-21) for scripts/access-matrix/check-reachability-guards.ts: definition parity + reachability drift in one call.';

REVOKE ALL ON FUNCTION public.reachability_guard_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reachability_guard_report() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Super-admin path, mirroring public.admin_rebuild_reachability()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reachability_guard_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.reachability_guard_report();
END $function$;

REVOKE ALL ON FUNCTION public.admin_reachability_guard_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reachability_guard_report() TO authenticated, service_role;
