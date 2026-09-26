-- NO NULL ORG ratchet — report canonical CERTIFICATION per table (canonical-first triage)
-- based-on: public.org_null_ratchet_snapshot() dfcda686cae116166eec31c3aec0c23d8965d1f230f15625a3ccaae81741353d
-- =====================================================================
-- Arman, 2026-09-25 (common-docs/policies/canonical-first-triage.md): a DB-wide
-- finding is judged by where it lives. A NULL organization_id on a CERTIFIED
-- table (or on canonical machinery) is a major defect; on an uncertified table,
-- while certified ones are clean, it is canonicalization debt, not a finding.
--
-- This adds `certified` (audit.summary.certified OR audit_class='machinery') to
-- every entry of `null_org_rows` and `nullable_org_columns`, so both twin
-- checkers (aidream scripts/check_org_null.py, matrx-frontend
-- scripts/canonical-ratchets/check-org-null.ts) block on certified growth and
-- report uncertified growth as the canonicalization queue. Additive keys only;
-- grants unchanged (service_role EXECUTE).

CREATE OR REPLACE FUNCTION public.org_null_ratchet_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_exempt_schemas CONSTANT text[] := ARRAY[
    'graveyard','auth','storage','realtime','vault','extensions','supabase_functions',
    'supabase_migrations','cron','net','pgsodium','_analytics','_realtime'];
  -- see the header: history is a snapshot of rows counted at their source.
  c_exempt_rowscan CONSTANT text[] := ARRAY['history'];
  rec record;
  v_nulls bigint;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
BEGIN
  FOR rec IN
    SELECT n.nspname AS s, c.relname AS t, c.oid,
           EXISTS (SELECT 1 FROM platform.entity_types e
                    WHERE e.schema_name = n.nspname AND e.table_name = c.relname) AS registered,
           (SELECT count(*) FROM pg_attribute a
             WHERE a.attrelid = c.oid AND NOT a.attisdropped
               AND a.attname IN ('created_by','created_at','updated_at','deleted_at',
                                 'metadata','version','visibility')) AS base_col_score,
           -- canonical-first triage (2026-09-25): certified tables, and the
           -- machinery the canonical contract is built from, are the ones a
           -- NULL org is a MAJOR defect on; elsewhere it is canonicalization debt.
           EXISTS (SELECT 1 FROM audit.summary a
                    WHERE a.schema_name = n.nspname AND a.table_name = c.relname
                      AND (a.certified OR a.audit_class = 'machinery')) AS certified
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                         AND NOT org.attisdropped AND NOT org.attnotnull
    WHERE c.relkind IN ('r','p')
      AND NOT c.relispartition
      AND n.nspname NOT LIKE 'pg\_%'
      AND n.nspname <> ALL (c_exempt_schemas)
      AND n.nspname <> ALL (c_exempt_rowscan)
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id IS NULL', rec.s, rec.t)
      INTO v_nulls;
    v_total := v_total + v_nulls;
    IF v_nulls > 0 THEN
      v_rows := v_rows || jsonb_build_object(
        'schema', rec.s, 'table', rec.t, 'null_rows', v_nulls,
        'guarded_class', (rec.registered OR rec.base_col_score >= 3),
        'certified', rec.certified);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'system_org_id', '39c38960-d30c-4840-b0c1-c9960de95582',
    'ddl_guard_attached', (SELECT coalesce(bool_or(evtenabled <> 'D'), false)
                             FROM pg_event_trigger WHERE evtname = 'ddl_guard'),
    'null_org_rows_total', v_total,
    'null_org_rows', v_rows,
    -- NEW (2026-08-29): the evidence half of the exemption contract. Every CHECK
    -- constraint mentioning organization_id on a nullable-org table. The checker
    -- honours an exemption ONLY while its named constraint appears here, so a
    -- dropped constraint turns a quiet exemption back into loud debt.
    -- Deliberately NOT filtered to constraints that "look like" they force NULL:
    -- the two live shapes are `... AND (organization_id IS NULL)` and the XOR
    -- `(user_id IS NOT NULL) <> (organization_id IS NOT NULL)`, and a pattern
    -- narrow enough to catch both would be a pattern that silently misses the
    -- third shape nobody has written yet. Report the facts; let the baseline
    -- name the constraint and a human state the reason.
    'org_constraints', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'schema', s, 'table', t, 'constraint', cname, 'definition', cdef)
             ORDER BY s, t, cname)
      FROM (
        SELECT n.nspname AS s, c.relname AS t, con.conname AS cname,
               pg_get_constraintdef(con.oid) AS cdef
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                             AND NOT org.attisdropped AND NOT org.attnotnull
        WHERE con.contype = 'c'
          AND c.relkind IN ('r','p')
          AND NOT c.relispartition
          AND n.nspname NOT LIKE 'pg\_%'
          AND n.nspname <> ALL (c_exempt_schemas)
          AND pg_get_constraintdef(con.oid) ILIKE '%organization_id%'
      ) q
    ), '[]'::jsonb),
    'nullable_org_columns', coalesce((
      SELECT jsonb_agg(jsonb_build_object('schema', s, 'table', t, 'certified', certified) ORDER BY s, t)
      FROM (
        SELECT n.nspname AS s, c.relname AS t,
               EXISTS (SELECT 1 FROM audit.summary a
                        WHERE a.schema_name = n.nspname AND a.table_name = c.relname
                          AND (a.certified OR a.audit_class = 'machinery')) AS certified
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                             AND NOT org.attisdropped AND NOT org.attnotnull
        WHERE c.relkind IN ('r','p')
          AND NOT c.relispartition
          AND n.nspname NOT LIKE 'pg\_%'
          AND n.nspname <> ALL (c_exempt_schemas)
          AND (EXISTS (SELECT 1 FROM platform.entity_types e
                        WHERE e.schema_name = n.nspname AND e.table_name = c.relname)
               OR (SELECT count(*) FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND NOT a.attisdropped
                      AND a.attname IN ('created_by','created_at','updated_at','deleted_at',
                                        'metadata','version','visibility')) >= 3)
      ) q
    ), '[]'::jsonb)
  );
END;
$function$;

-- Declared in data: no client ever calls this; the two release checkers do,
-- as service_role (PostgREST) and over a direct connection.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
SELECT 'public', 'org_null_ratchet_snapshot', '', ARRAY[]::oid[],
       'No entity-id arguments; returns catalog counts of NULL organization_id rows per table.',
       'org_null_ratchet_certified.sql',
       'server_only: the NO NULL ORG release ratchets (aidream scripts/check_org_null.py and matrx-frontend check-org-null.ts) call it as service_role; no client surface reads it.',
       false, false
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door
                   WHERE schema_name = 'public' AND function_name = 'org_null_ratchet_snapshot');

-- Grants: CREATE OR REPLACE keeps the existing ACL (service_role EXECUTE only).
