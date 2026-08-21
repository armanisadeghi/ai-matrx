-- NO NULL ORG — the data-level read path for the two blocking ratchets
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 / §6e): "NO NULL ORG."
--
-- The DDL sentinel (migrations/ddl_guard_nullable_org.sql) guards CREATION.
-- This function is the DATA half: how many rows are actually wrong right now,
-- and how many tables still ALLOW them to be wrong. It feeds two ratchets in
-- matrx-frontend/scripts/canonical-ratchets (blocking in --strict) and the
-- aidream release gate scripts/check_org_null.py.
--
-- WHY A SECURITY DEFINER RPC AND NOT A VIEW. Same reason as
-- public.canonical_ratchet_snapshot: PostgREST does not expose `platform` or
-- `audit`, and the counts must be taken with the RLS boundary OFF or the gate
-- would measure what the gate's own credentials can see instead of what is
-- true. EXECUTE is granted to service_role only.
--
-- TWO COUNTS, DIFFERENT JOBS:
--   * `null_org_rows` — every BASE TABLE in a non-exempt schema whose
--     organization_id is nullable is scanned for actual NULLs. This is the
--     count that must only go DOWN. It is what stops the 38 grandfathered
--     tables from GROWING their backlog while they wait for their own NOT NULL
--     flip: the flip is not forced, but writing new NULL-org rows fails the
--     gate. A NOT NULL column cannot hold a NULL, so scanning only the nullable
--     ones is complete, not a shortcut.
--   * `nullable_org_columns` — the tables that still ALLOW it, restricted to
--     the entity-looking-or-registered class the DDL guard uses, so the two
--     layers agree on the population by construction.
--
-- Cost: a seq scan of every nullable-org table. Measured live at apply time
-- (~1.7M rows total, the bulk of it rag.kg_edges) — a couple of seconds, once
-- per release. It never runs on a hot path.

BEGIN;

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
                                 'metadata','version','visibility')) AS base_col_score
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                         AND NOT org.attisdropped AND NOT org.attnotnull
    WHERE c.relkind IN ('r','p')
      AND NOT c.relispartition
      AND n.nspname NOT LIKE 'pg\_%'
      AND n.nspname <> ALL (c_exempt_schemas)
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id IS NULL', rec.s, rec.t)
      INTO v_nulls;
    v_total := v_total + v_nulls;
    IF v_nulls > 0 THEN
      v_rows := v_rows || jsonb_build_object(
        'schema', rec.s, 'table', rec.t, 'null_rows', v_nulls,
        'guarded_class', (rec.registered OR rec.base_col_score >= 3));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'system_org_id', '39c38960-d30c-4840-b0c1-c9960de95582',
    'ddl_guard_attached', (SELECT coalesce(bool_or(evtenabled <> 'D'), false)
                             FROM pg_event_trigger WHERE evtname = 'ddl_guard'),
    'null_org_rows_total', v_total,
    'null_org_rows', v_rows,
    'nullable_org_columns', coalesce((
      SELECT jsonb_agg(jsonb_build_object('schema', s, 'table', t) ORDER BY s, t)
      FROM (
        SELECT n.nspname AS s, c.relname AS t
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

REVOKE ALL ON FUNCTION public.org_null_ratchet_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_null_ratchet_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_null_ratchet_snapshot() TO service_role;

COMMENT ON FUNCTION public.org_null_ratchet_snapshot() IS
  'NO NULL ORG (owner ruling 2026-08-21, db-rules §2/§6e). Live read path for the two blocking ratchets: NULL-organization_id row counts, and the tables that still allow them. service_role only.';

COMMIT;
