-- FD-T01 canonical, read-only capture for admin.feature_docs.
-- The migration preflight must use this same serialization logic and compare
-- both the canonical JSON objects and their hashes. Catalog OIDs are emitted as
-- observations but excluded from the policy/trigger/function/ACL hashes.
BEGIN TRANSACTION READ ONLY;
SELECT set_config('search_path', '', true);

WITH
target AS (
  SELECT 'admin.feature_docs'::regclass::oid AS relid
),
table_identity AS (
  SELECT jsonb_build_object(
    'schema', n.nspname,
    'table', c.relname,
    'relkind', c.relkind,
    'persistence', c.relpersistence,
    'owner', owner_role.rolname,
    'rls_enabled', c.relrowsecurity,
    'rls_forced', c.relforcerowsecurity
  ) AS canonical,
  c.oid::text AS catalog_oid
  FROM target t
  JOIN pg_class c ON c.oid = t.relid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles owner_role ON owner_role.oid = c.relowner
),
column_rows AS (
  SELECT
    a.attname,
    jsonb_build_object(
      'name', a.attname,
      'number', a.attnum,
      'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE a.attcollation::regcollation::text END,
      'default', pg_get_expr(d.adbin, d.adrelid, false)
    ) AS canonical,
    d.oid::text AS default_catalog_oid
  FROM target t
  JOIN pg_attribute a ON a.attrelid = t.relid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attname IN ('organization_id', 'visibility')
    AND NOT a.attisdropped
),
columns AS (
  SELECT
    COALESCE(jsonb_agg(canonical ORDER BY attname), '[]'::jsonb) AS canonical,
    COALESCE(jsonb_agg(jsonb_build_object(
      'name', attname,
      'default_catalog_oid', default_catalog_oid
    ) ORDER BY attname), '[]'::jsonb) AS catalog_observations
  FROM column_rows
),
relation_acl_source AS (
  SELECT c.relacl IS NULL AS acl_is_null,
         aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
  FROM target t
  JOIN pg_class c ON c.oid = t.relid
),
relation_acl AS (
  SELECT jsonb_build_object(
    'acl_is_null', bool_or(acl_is_null),
    'grants', COALESCE(jsonb_agg(jsonb_build_object(
      'grantor', COALESCE(grantor_role.rolname, 'PUBLIC'),
      'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
      'privilege', (acl).privilege_type,
      'grantable', (acl).is_grantable
    ) ORDER BY COALESCE(grantor_role.rolname, 'PUBLIC'),
               COALESCE(grantee_role.rolname, 'PUBLIC'),
               (acl).privilege_type,
               (acl).is_grantable), '[]'::jsonb)
  ) AS canonical
  FROM relation_acl_source s
  LEFT JOIN pg_roles grantor_role ON grantor_role.oid = (s.acl).grantor
  LEFT JOIN pg_roles grantee_role ON grantee_role.oid = (s.acl).grantee
),
policy_rows AS (
  SELECT
    p.polname,
    p.polcmd,
    p.oid::text AS catalog_oid,
    jsonb_build_object(
      'name', p.polname,
      'command', p.polcmd,
      'permissive', p.polpermissive,
      'roles', COALESCE((
        SELECT jsonb_agg(COALESCE(r.rolname, 'PUBLIC') ORDER BY COALESCE(r.rolname, 'PUBLIC'))
        FROM unnest(p.polroles) role_oid
        LEFT JOIN pg_roles r ON r.oid = role_oid
      ), '[]'::jsonb),
      'using', pg_get_expr(p.polqual, p.polrelid, false),
      'with_check', pg_get_expr(p.polwithcheck, p.polrelid, false)
    ) AS canonical
  FROM target t
  JOIN pg_policy p ON p.polrelid = t.relid
),
policies AS (
  SELECT
    COALESCE(jsonb_agg(canonical ORDER BY polname, polcmd), '[]'::jsonb) AS canonical,
    COALESCE(jsonb_agg(jsonb_build_object('name', polname, 'catalog_oid', catalog_oid)
      ORDER BY polname, polcmd), '[]'::jsonb) AS catalog_observations
  FROM policy_rows
),
trigger_rows AS (
  SELECT
    t.tgname,
    t.oid::text AS catalog_oid,
    t.tgfoid,
    jsonb_build_object(
      'name', t.tgname,
      'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid, false)
    ) AS canonical
  FROM target target_rel
  JOIN pg_trigger t ON t.tgrelid = target_rel.relid
  WHERE NOT t.tgisinternal
),
triggers AS (
  SELECT
    COALESCE(jsonb_agg(canonical ORDER BY tgname), '[]'::jsonb) AS canonical,
    COALESCE(jsonb_agg(jsonb_build_object('name', tgname, 'catalog_oid', catalog_oid)
      ORDER BY tgname), '[]'::jsonb) AS catalog_observations
  FROM trigger_rows
),
trigger_function_ids AS (
  SELECT DISTINCT tgfoid FROM trigger_rows
),
function_rows AS (
  SELECT
    n.nspname,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.oid::text AS catalog_oid,
    jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'owner', owner_role.rolname,
      'language', lang.lanname,
      'kind', p.prokind,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'strict', p.proisstrict,
      'leakproof', p.proleakproof,
      'returns_set', p.proretset,
      'return_type', pg_get_function_result(p.oid),
      'config', COALESCE((
        SELECT jsonb_agg(setting ORDER BY setting)
        FROM unnest(p.proconfig) setting
      ), '[]'::jsonb),
      'acl', jsonb_build_object(
        'acl_is_null', p.proacl IS NULL,
        'grants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'grantor', COALESCE(grantor_role.rolname, 'PUBLIC'),
            'grantee', COALESCE(grantee_role.rolname, 'PUBLIC'),
            'privilege', (acl).privilege_type,
            'grantable', (acl).is_grantable
          ) ORDER BY COALESCE(grantor_role.rolname, 'PUBLIC'),
                     COALESCE(grantee_role.rolname, 'PUBLIC'),
                     (acl).privilege_type,
                     (acl).is_grantable)
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          LEFT JOIN pg_roles grantor_role ON grantor_role.oid = (acl).grantor
          LEFT JOIN pg_roles grantee_role ON grantee_role.oid = (acl).grantee
        ), '[]'::jsonb)
      ),
      'definition', pg_get_functiondef(p.oid)
    ) AS canonical
  FROM trigger_function_ids ids
  JOIN pg_proc p ON p.oid = ids.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles owner_role ON owner_role.oid = p.proowner
  JOIN pg_language lang ON lang.oid = p.prolang
),
functions AS (
  SELECT
    COALESCE(jsonb_agg(canonical ORDER BY nspname, proname, identity_arguments), '[]'::jsonb) AS canonical,
    COALESCE(jsonb_agg(jsonb_build_object(
      'schema', nspname,
      'name', proname,
      'identity_arguments', identity_arguments,
      'catalog_oid', catalog_oid
    ) ORDER BY nspname, proname, identity_arguments), '[]'::jsonb) AS catalog_observations
  FROM function_rows
),
data_counts AS (
  SELECT jsonb_build_object(
    'rows', count(*),
    'non_system_organization_rows', count(*) FILTER (
      WHERE organization_id <> '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
    ),
    'reserved_canary_rows', count(*) FILTER (WHERE path LIKE '__org_canary__/%'),
    'visibility', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'visibility', grouped.visibility,
        'rows', grouped.rows
      ) ORDER BY grouped.visibility)
      FROM (
        SELECT visibility::text AS visibility, count(*) AS rows
        FROM admin.feature_docs
        GROUP BY visibility
      ) grouped
    ), '[]'::jsonb)
  ) AS canonical
  FROM admin.feature_docs
),
registry AS (
  SELECT to_jsonb(registry_row) AS canonical
  FROM (
    SELECT token, schema_name, table_name, rls_variant, is_active,
           agent_writable, suppress_platform_admin_lane
    FROM platform.entity_types
    WHERE token = 'feature_doc'
  ) registry_row
),
verification AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'check', check_name,
    'status', status,
    'detail', detail
  ) ORDER BY check_name), '[]'::jsonb) AS canonical
  FROM iam.verify_canonical('admin', 'feature_docs', 'feature_doc', NULL)
  WHERE check_name IN ('personal_row_wall', 'policies_canonical', 'rls_enabled', 'visibility')
)
SELECT jsonb_build_object(
  'capture_contract', jsonb_build_object(
    'version', 1,
    'search_path', current_setting('search_path'),
    'transaction_read_only', current_setting('transaction_read_only')::boolean,
    'target', 'admin.feature_docs',
    'system_organization_id', '39c38960-d30c-4840-b0c1-c9960de95582'
  ),
  'table', jsonb_build_object(
    'canonical', ti.canonical,
    'md5', md5(ti.canonical::text),
    'catalog_oid', ti.catalog_oid
  ),
  'columns', jsonb_build_object(
    'canonical', cols.canonical,
    'md5', md5(cols.canonical::text),
    'catalog_observations', cols.catalog_observations
  ),
  'relation_acl', jsonb_build_object(
    'canonical', ra.canonical,
    'md5', md5(ra.canonical::text)
  ),
  'policies', jsonb_build_object(
    'canonical', pol.canonical,
    'md5', md5(pol.canonical::text),
    'catalog_observations', pol.catalog_observations
  ),
  'triggers', jsonb_build_object(
    'canonical', trg.canonical,
    'md5', md5(trg.canonical::text),
    'catalog_observations', trg.catalog_observations
  ),
  'trigger_functions', jsonb_build_object(
    'canonical', fn.canonical,
    'md5', md5(fn.canonical::text),
    'catalog_observations', fn.catalog_observations
  ),
  'data', dc.canonical,
  'registry', reg.canonical,
  'verification', ver.canonical
) AS canonical_snapshot
FROM table_identity ti
CROSS JOIN columns cols
CROSS JOIN relation_acl ra
CROSS JOIN policies pol
CROSS JOIN triggers trg
CROSS JOIN functions fn
CROSS JOIN data_counts dc
CROSS JOIN registry reg
CROSS JOIN verification ver;

ROLLBACK;
