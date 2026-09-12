-- PREPARED ONLY — DO NOT MOVE TO migrations/ OR APPLY.
--
-- FD-T01 activation draft: retire the one legacy organization_id default on
-- admin.feature_docs after the explicit-organization sync client is deployed
-- and independently accepted. This draft changes no trigger, grant, RLS policy,
-- row, or constraint. It has one effect: DROP DEFAULT on organization_id.
--
-- Captured live, 2026-09-12 (Matrx Main brsgrqvjdzwihsvnfqkf):
--   table OID 1702063, owner postgres, organization default OID 1702067,
--   default hash 74188ac5336e8d3bf1a14eee28fc6297,
--   relacl hash c1e488b30589fa3c45d7d80fe02ddcad,
--   6,049 rows and every row in explicit system org
--   39c38960-d30c-4840-b0c1-c9960de95582.
--
-- Activation barrier: repeat the read-only catalog snapshot immediately before
-- promotion. This draft deliberately refuses if its captured OIDs, definitions,
-- grants, NOT NULL constraint, row inventory, or non-internal trigger set has
-- changed. Refresh and independently review a new draft rather than weakening a
-- failed precondition.
--
-- Required source proof before activation:
--   pnpm test:sync-feature-docs
--   pnpm sync:feature-docs -- --organization-id 39c38960-d30c-4840-b0c1-c9960de95582
--   --push  (only after a review confirms its intended repository delta)
--
-- Required live DML canary, after source acceptance and before promotion:
-- 1. Read a real markdown file from this repository and derive its normal
--    parseFeatureDocFile metadata.
-- 2. Insert exactly one row through the same Supabase admin client primitive as
--    sync-feature-docs, with a unique `__org_canary__/...` path and the explicit
--    system organization above. Verify its returned organization_id exactly.
-- 3. Attempt the same insert with organization_id omitted; it must fail after
--    this draft is applied. Attempt a malformed UUID at the CLI boundary; it
--    must make zero network/database calls.
-- 4. Delete only the returned canary id while also filtering by its captured
--    organization_id and unique path. Verify the delete affected one row. Never
--    use bulk sync deletion as cleanup.
--
-- No DML canary is authorized by this draft. The owner initiates it only after
-- reviewing the concrete plan and the independent Sol verdict.

DO $preflight$
DECLARE
  v_relation_oid constant oid := 1702063;
  v_default_oid constant oid := 1702067;
  v_expected_default_hash constant text := '74188ac5336e8d3bf1a14eee28fc6297';
  v_expected_acl_hash constant text := 'c1e488b30589fa3c45d7d80fe02ddcad';
  v_expected_trigger_hash constant text := 'b7dfbcbb53565d6e7de0ddf1d48169dc';
  v_expected_rows constant bigint := 6049;
  v_system_organization constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actual_rows bigint;
  v_non_system_rows bigint;
  v_trigger_hash text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Hold the catalog steady from its proof through DROP DEFAULT. This is a
  -- migration-time write lock only; it neither changes rows nor bypasses RLS.
  LOCK TABLE admin.feature_docs IN SHARE ROW EXCLUSIVE MODE;

  IF 'admin.feature_docs'::regclass::oid <> v_relation_oid THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: admin.feature_docs OID changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_relation_oid AND relrowsecurity AND NOT relforcerowsecurity) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: RLS enablement/force state changed';
  END IF;

  IF (SELECT count(*) FROM pg_policy WHERE polrelid = v_relation_oid) <> 7 THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: RLS policy set changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = v_relation_oid
      AND n.nspname = 'admin'
      AND c.relname = 'feature_docs'
      AND c.relowner = 'postgres'::regrole
      AND md5(coalesce(c.relacl::text, '')) = v_expected_acl_hash
  ) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: relation owner or grants changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = v_relation_oid
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped
      AND a.attnotnull
      AND d.oid = v_default_oid
      AND md5(pg_get_expr(d.adbin, d.adrelid)) = v_expected_default_hash
      AND pg_get_expr(d.adbin, d.adrelid) = quote_literal(v_system_organization::text) || '::uuid'
  ) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: organization_id NOT NULL/default identity changed';
  END IF;

  SELECT md5(string_agg(t.oid::text || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid))
  INTO v_trigger_hash
  FROM pg_trigger t
  WHERE t.tgrelid = v_relation_oid
    AND NOT t.tgisinternal;
  IF v_trigger_hash IS DISTINCT FROM v_expected_trigger_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: feature_docs trigger set changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t LEFT JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = v_relation_oid AND NOT t.tgisinternal
      AND p.oid IS NULL
  ) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: a required trigger function is absent';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE organization_id <> v_system_organization)
  INTO v_actual_rows, v_non_system_rows
  FROM admin.feature_docs;
  IF v_actual_rows <> v_expected_rows OR v_non_system_rows <> 0 THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: row provenance changed (rows %, non-system %)',
      v_actual_rows, v_non_system_rows;
  END IF;
END;
$preflight$;

ALTER TABLE admin.feature_docs ALTER COLUMN organization_id DROP DEFAULT;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'admin.feature_docs'::regclass
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'FD-T01 postcondition failed: organization_id still has a default';
  END IF;
END;
$postflight$;
