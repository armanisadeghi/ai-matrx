-- PREPARED ONLY — DO NOT MOVE TO migrations/ OR APPLY.
--
-- FD-T01 activation draft: retire the one legacy organization_id default on
-- admin.feature_docs after the explicit-organization sync client is deployed
-- and independently accepted. This draft changes no trigger, grant, RLS policy,
-- row, or constraint. It has one effect: DROP DEFAULT on organization_id.
--
-- Canonical capture contract: scripts/feature-docs-canonical-preflight-capture.sql.
-- Both paths pin search_path to empty, then hash ordered semantic JSON. Catalog
-- OIDs are observations except for this table and organization_id default, whose
-- identities are deliberate activation guards. A same-definition policy/trigger
-- recreation therefore remains accepted; a semantic change remains a refusal.
--
-- Captured live after DD-165 reached its ledger gate, 2026-09-12:
--   table OID 1702063; organization default OID 1702067; 6,049 rows, all in
--   system organization 39c38960-d30c-4840-b0c1-c9960de95582.
--
-- Activation barrier: repeat the read-only capture immediately before promotion.
-- Refresh and independently review a new draft rather than weakening a failed
-- precondition. No DML canary is authorized by this draft.

DO $preflight$
DECLARE
  v_relation_oid constant oid := 1702063;
  v_default_oid constant oid := 1702067;
  v_expected_table_hash constant text := '276cda7cce956b7c052888f45b4a295d';
  v_expected_columns_hash constant text := '79bf32c485d82e1d8177fdb27618057e';
  v_expected_acl_hash constant text := '1e87f00a737b4810e6a4e681a77af0ac';
  v_expected_policy_hash constant text := 'ca8336bffe5c8e6da0efb81f102ae75c';
  v_expected_trigger_hash constant text := 'cf050c61d0f4334c858e36246a5d9b75';
  v_expected_trigger_function_hash constant text := '730018a24a9cc972db08965d0259cfd6';
  v_expected_rows constant bigint := 6049;
  v_system_organization constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actual_rows bigint;
  v_non_system_rows bigint;
  v_hash text;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);
  -- Hold the catalog steady from proof through DROP DEFAULT. This lock changes
  -- neither rows nor RLS, policies, triggers, grants, or constraints.
  LOCK TABLE admin.feature_docs IN SHARE ROW EXCLUSIVE MODE;

  IF 'admin.feature_docs'::pg_catalog.regclass::pg_catalog.oid <> v_relation_oid THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: admin.feature_docs OID changed';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'schema', n.nspname,
    'table', c.relname,
    'relkind', c.relkind,
    'persistence', c.relpersistence,
    'owner', owner_role.rolname,
    'rls_enabled', c.relrowsecurity,
    'rls_forced', c.relforcerowsecurity
  )::text)
  INTO v_hash
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = c.relowner
  WHERE c.oid = v_relation_oid;
  IF v_hash IS DISTINCT FROM v_expected_table_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: target table identity, owner, or RLS state changed';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(canonical ORDER BY attname)::text, '[]'))
  INTO v_hash
  FROM (
    SELECT a.attnum, a.attname,
      pg_catalog.jsonb_build_object(
        'name', a.attname,
        'number', a.attnum,
        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull,
        'identity', a.attidentity,
        'generated', a.attgenerated,
        'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE a.attcollation::pg_catalog.regcollation::text END,
        'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid, false)
      ) AS canonical
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = v_relation_oid
      AND a.attname IN ('organization_id', 'visibility')
      AND NOT a.attisdropped
  ) scoped_columns;
  IF v_hash IS DISTINCT FROM v_expected_columns_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: organization or visibility column semantics changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = v_relation_oid
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped
      AND a.attnotnull
      AND a.atttypid = 'uuid'::pg_catalog.regtype
      AND d.oid = v_default_oid
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid, false) = pg_catalog.quote_literal(v_system_organization::text) || '::uuid'
  ) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: organization_id NOT NULL/default identity changed';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'acl_is_null', c.relacl IS NULL,
    'grants', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantor', COALESCE(grantor_role.rolname, 'PUBLIC'),
        'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
        'privilege', (acl).privilege_type,
        'grantable', (acl).is_grantable
      ) ORDER BY COALESCE(grantor_role.rolname, 'PUBLIC'),
                 COALESCE(grantee_role.rolname, 'PUBLIC'),
                 (acl).privilege_type, (acl).is_grantable)
      FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
      LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid = (acl).grantor
      LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = (acl).grantee
    ), '[]'::pg_catalog.jsonb)
  )::text)
  INTO v_hash
  FROM pg_catalog.pg_class c
  WHERE c.oid = v_relation_oid;
  IF v_hash IS DISTINCT FROM v_expected_acl_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: relation grants changed';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(canonical ORDER BY polname, polcmd)::text, '[]'))
  INTO v_hash
  FROM (
    SELECT p.polname, p.polcmd,
      pg_catalog.jsonb_build_object(
        'name', p.polname,
        'command', p.polcmd,
        'permissive', p.polpermissive,
        'roles', COALESCE((
          SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name)
          FROM (
            SELECT COALESCE(r.rolname, 'PUBLIC') AS role_name
            FROM pg_catalog.unnest(p.polroles) role_oid
            LEFT JOIN pg_catalog.pg_roles r ON r.oid = role_oid
          ) roles
        ), '[]'::pg_catalog.jsonb),
        'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid, false),
        'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false)
      ) AS canonical
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = v_relation_oid
  ) policies;
  IF v_hash IS DISTINCT FROM v_expected_policy_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: semantic RLS policy definitions changed';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(canonical ORDER BY tgname)::text, '[]'))
  INTO v_hash
  FROM (
    SELECT t.tgname,
      pg_catalog.jsonb_build_object(
        'name', t.tgname,
        'enabled', t.tgenabled,
        'definition', pg_catalog.pg_get_triggerdef(t.oid, false)
      ) AS canonical
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = v_relation_oid AND NOT t.tgisinternal
  ) triggers;
  IF v_hash IS DISTINCT FROM v_expected_trigger_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: semantic trigger set changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = v_relation_oid AND NOT t.tgisinternal AND p.oid IS NULL
  ) THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: a required trigger function is absent';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.jsonb_agg(canonical ORDER BY nspname, proname, identity_arguments)::text, '[]'))
  INTO v_hash
  FROM (
    SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_catalog.jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
        'owner', owner_role.rolname,
        'language', lang.lanname,
        'kind', p.prokind,
        'security_definer', p.prosecdef,
        'volatility', p.provolatile,
        'parallel', p.proparallel,
        'strict', p.proisstrict,
        'leakproof', p.proleakproof,
        'returns_set', p.proretset,
        'return_type', pg_catalog.pg_get_function_result(p.oid),
        'config', COALESCE((
          SELECT pg_catalog.jsonb_agg(setting ORDER BY setting)
          FROM pg_catalog.unnest(p.proconfig) setting
        ), '[]'::pg_catalog.jsonb),
        'acl', pg_catalog.jsonb_build_object(
          'acl_is_null', p.proacl IS NULL,
          'grants', COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'grantor', COALESCE(grantor_role.rolname, 'PUBLIC'),
              'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
              'privilege', (acl).privilege_type,
              'grantable', (acl).is_grantable
            ) ORDER BY COALESCE(grantor_role.rolname, 'PUBLIC'),
                       COALESCE(grantee_role.rolname, 'PUBLIC'),
                       (acl).privilege_type, (acl).is_grantable)
            FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
            LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid = (acl).grantor
            LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = (acl).grantee
          ), '[]'::pg_catalog.jsonb)
        ),
        'definition', pg_catalog.pg_get_functiondef(p.oid)
      ) AS canonical
    FROM (
      SELECT DISTINCT t.tgfoid
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = v_relation_oid AND NOT t.tgisinternal
    ) ids
    JOIN pg_catalog.pg_proc p ON p.oid = ids.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = p.proowner
    JOIN pg_catalog.pg_language lang ON lang.oid = p.prolang
  ) functions;
  IF v_hash IS DISTINCT FROM v_expected_trigger_function_hash THEN
    RAISE EXCEPTION 'FD-T01 precondition failed: semantic trigger-function definition, owner, grant, or configuration changed';
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
    FROM pg_catalog.pg_attrdef d
    JOIN pg_catalog.pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'admin.feature_docs'::pg_catalog.regclass
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'FD-T01 postcondition failed: organization_id still has a default';
  END IF;
END;
$postflight$;
