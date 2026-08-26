-- Personal-variant tables must not carry the platform-admin lane, and the
-- dashboard admin contract must stop demanding that they do.
--
-- WHAT WAS WRONG
-- --------------
-- db-rules §6d/§6e: the `personal` variant emits only `svc_all` plus
-- authenticated CRUD constrained to `user_id = auth.uid()`.  It never carries
-- `platform_admin_all` -- a personal row's user_id is the complete access
-- boundary.  `iam.verify_canonical`'s `policy_personal_owner_only` check
-- encodes exactly that.
--
-- Three live tables violated it:
--   rag.kg_suggestion_ack, rag.scope_association_suggestions,
--   rag.scope_item_value_suggestions
--
-- This was NOT a missed generator run.  aidream 0471/0472 (2026-08-23) applied
-- the `personal` variant correctly and proved it green.  On 2026-08-24,
-- aidream `0496_complete_dashboard_admin_access.sql` swept every
-- PostgREST-exposed RLS relation and re-created `platform_admin_all` on any
-- table lacking it -- with no variant awareness -- silently re-opening the
-- hole 0471 had closed.  Measured live before this migration: a platform admin
-- owning ZERO of these rows could read all 254 of them (107 + 30 + 117).
--
-- `communication.notification_channel_preference` (personal, created after the
-- sweep) is clean, which is what isolated the sweep as the cause.
--
-- WHY THE CONTRACT CHANGES TOO
-- ----------------------------
-- 0496 also installed platform.admin_access_contract_violations(), whose
-- `admin_policy` rule reports ANY RLS table without `platform_admin_all` as a
-- violation.  That rule contradicts db-rules §6e, and it already fires today on
-- the correctly-clean notification_channel_preference.  Left alone it would
-- report all four personal tables as broken the moment this migration lands --
-- training the next agent to "fix" them by re-adding the policy, which is
-- precisely the loop that produced this defect.  POLICY outranks a checker, so
-- the checker is corrected here: personal-variant tokens and privacy-wall
-- tokens (suppress_platform_admin_lane, HR D19) are excluded from that one
-- rule.  Every other rule and every other table is untouched.

-- 1. Regenerate through the generator.  Never a hand-written DROP POLICY: the
--    personal lane returns before the admin policy is created, so regeneration
--    removes it correctly and stays removed under the next regeneration.
SELECT iam.apply_rls('rag', 'kg_suggestion_ack',              'kg_suggestion_ack',              'personal');
SELECT iam.apply_rls('rag', 'scope_association_suggestions',  'scope_association_suggestion',   'personal');
SELECT iam.apply_rls('rag', 'scope_item_value_suggestions',   'scope_item_value_suggestion',    'personal');

-- 2. Teach the dashboard admin contract that `personal` and privacy-wall
--    tokens are legitimately admin-lane-free.
CREATE OR REPLACE FUNCTION platform.admin_access_contract_violations()
RETURNS TABLE(category text, object_name text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'admin_access_contract_violations requires a platform admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cfg AS (
    SELECT unnest(s.setconfig) AS kv
    FROM pg_db_role_setting s
    JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = 'authenticator'
  ), exposed AS (
    SELECT btrim(x) AS schema_name
    FROM cfg,
         unnest(string_to_array(split_part(kv, '=', 2), ',')) AS x
    WHERE kv LIKE 'pgrst.db_schemas=%'
  ), rels AS (
    SELECT c.oid, n.nspname AS schema_name, c.relname, c.relkind,
           c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN (SELECT schema_name FROM exposed)
      AND n.nspname NOT LIKE 'pg\_%'
      AND n.nspname <> 'information_schema'
      AND n.nspname NOT IN (
        'extensions', 'graphql', 'graphql_public', 'realtime', 'storage',
        'vault', 'net', 'cron', 'supabase_migrations', 'pgbouncer',
        '_analytics', '_realtime', 'pgsodium', 'pgtle',
        'supabase_functions'
      )
      AND c.relkind IN ('r', 'p', 'v')
  )
  SELECT 'schema_usage'::text, r.schema_name::text, 'authenticated lacks USAGE'::text
  FROM rels r
  JOIN pg_namespace n ON n.nspname = r.schema_name
  WHERE NOT has_schema_privilege('authenticated', n.oid, 'USAGE')
  UNION ALL
  SELECT 'relation_select', format('%I.%I', r.schema_name, r.relname),
         'authenticated lacks SELECT'
  FROM rels r
  WHERE NOT has_table_privilege('authenticated', r.oid, 'SELECT')
  UNION ALL
  SELECT 'table_crud', format('%I.%I', r.schema_name, r.relname),
         'authenticated lacks one or more of INSERT, UPDATE, DELETE'
  FROM rels r
  WHERE r.relkind IN ('r', 'p')
    AND NOT (
      has_table_privilege('authenticated', r.oid, 'INSERT')
      AND has_table_privilege('authenticated', r.oid, 'UPDATE')
      AND has_table_privilege('authenticated', r.oid, 'DELETE')
    )
  UNION ALL
  -- db-rules §6e: admin access is explicit BY VARIANT.  `personal` never
  -- carries the admin lane, and a privacy-wall token deliberately drops it.
  -- Demanding it here is what re-opened the rag suggestion tables.
  SELECT 'admin_policy', format('%I.%I', r.schema_name, r.relname),
         'RLS table has no platform_admin_all policy'
  FROM rels r
  WHERE r.relkind IN ('r', 'p') AND r.relrowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = r.oid AND p.polname = 'platform_admin_all'
    )
    AND NOT EXISTS (
      SELECT 1 FROM platform.entity_types et
      WHERE et.schema_name = r.schema_name
        AND et.table_name  = r.relname
        AND et.is_active
        AND (
          coalesce(et.rls_variant, 'entity') = 'personal'
          OR coalesce(et.suppress_platform_admin_lane, false)
        )
    )
  UNION ALL
  SELECT 'rpc_execute', 'platform.admin_relation_catalog()',
         'authenticated lacks EXECUTE'
  WHERE NOT has_function_privilege(
    'authenticated', 'platform.admin_relation_catalog()', 'EXECUTE'
  )
  UNION ALL
  SELECT 'rpc_execute', 'platform.admin_relation_columns(text,text)',
         'authenticated lacks EXECUTE'
  WHERE NOT has_function_privilege(
    'authenticated', 'platform.admin_relation_columns(text,text)', 'EXECUTE'
  )
  UNION ALL
  SELECT 'sequence_usage', format('%I.%I', n.nspname, c.relname),
         'authenticated lacks USAGE'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S'
    AND n.nspname IN (SELECT schema_name FROM exposed)
    AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('authenticated'::name, c.oid, 'USAGE') ELSE false END;
END
$function$;

REVOKE ALL ON FUNCTION platform.admin_access_contract_violations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform.admin_access_contract_violations()
  TO authenticated, service_role;

-- 3. Assertions -- this migration proves its own postcondition.
DO $assert$
DECLARE
  v_bad integer;
  v_uncertified text;
BEGIN
  -- No active personal-variant table may carry the admin lane.
  SELECT count(*) INTO v_bad
  FROM platform.entity_types et
  JOIN pg_policies p
    ON p.schemaname = et.schema_name AND p.tablename = et.table_name
  WHERE et.is_active
    AND coalesce(et.rls_variant, 'entity') = 'personal'
    AND p.policyname = 'platform_admin_all';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'personal-variant tables still carrying platform_admin_all: %', v_bad;
  END IF;

  -- All three tokens must certify.
  SELECT string_agg(t.tok, ', ') INTO v_uncertified
  FROM (VALUES
    ('rag','kg_suggestion_ack','kg_suggestion_ack'),
    ('rag','scope_association_suggestions','scope_association_suggestion'),
    ('rag','scope_item_value_suggestions','scope_item_value_suggestion')
  ) AS t(sch, tbl, tok)
  WHERE NOT iam.canonical_certify_ok(t.sch, t.tbl, t.tok);
  IF v_uncertified IS NOT NULL THEN
    RAISE EXCEPTION 'tokens failed canonical_certify_ok: %', v_uncertified;
  END IF;

END
$assert$;

