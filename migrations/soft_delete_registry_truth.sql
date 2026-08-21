-- soft_delete_registry_truth.sql
--
-- Third and last pass of Arman's 2026-08-21 rule ("if it's a safe positive add,
-- add it rather than sit non-conformant"). The first two passes fixed tables
-- whose registry said has_soft_delete=FALSE. This one fixes the INVERSE, which
-- is worse: 25 active tokens whose registry says has_soft_delete=TRUE while the
-- table has no `deleted_at` column at all.
--
-- That is not a missing feature, it is a REGISTRY LIE, and it is the exact
-- failure `scripts/check_entity_drift.py` in aidream was written to scream
-- about ("the database is truth; entity_types is a CLAIM about it"). Anything
-- that trusted the flag — a UI offering delete-and-restore, a retention job
-- expecting to soft-delete — was silently broken, and `iam.verify_canonical`
-- was charging each of these tables a hard FAIL for it.
--
-- Fix direction: make the CLAIM TRUE by adding the column, not by flipping the
-- flag to false. These are user content (research sources, file pages, studio
-- documents, workbench datasets/lists/workbooks, runtime work items) — content
-- that should be recoverable after a delete. db-rules §8's generic RPCs
-- `public.entity_soft_delete(token,id)` / `public.entity_undelete(token,id)`
-- start working on all 25 the moment the column exists.
--
-- SCOPE NOTE — these tables are NOT certified after this and are not meant to
-- be. Each carries 2-12 hard FAILs from the standing canonicalization backlog;
-- this migration removes exactly one of them (`soft_delete`) and makes the
-- registry honest. The rest is the backlog's work, and several of these tables
-- are under active repair by parallel sessions, so nothing else here is touched.
--
-- EXCLUDED: `agent_card` — same drift, but it is a VIEW (matrx-frontend D233).
-- A view cannot carry the column; its flag is part of D233's pending decision.
--
-- SAFETY: adding a nullable column is metadata-only on PG11+ (no rewrite) and
-- the largest table here is ~8.9k rows / 60 MB. `ddl_lock_timeout_guard` caps
-- the lock wait at 8s, so a busy table fails fast rather than queueing behind.

BEGIN;

DO $$
DECLARE
  r record;
  n_added int := 0;
BEGIN
  FOR r IN
    SELECT et.schema_name s, et.table_name t, et.token tok
    FROM platform.entity_types et
    WHERE et.is_active
      AND et.has_soft_delete
      AND et.token <> 'agent_card'
      AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
                  WHERE ns.nspname=et.schema_name AND c.relname=et.table_name
                    AND c.relkind IN ('r','p'))
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema=et.schema_name AND c.table_name=et.table_name
                        AND c.column_name='deleted_at')
    ORDER BY et.schema_name, et.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN deleted_at timestamptz', r.s, r.t);
    EXECUTE format('COMMENT ON COLUMN %I.%I.deleted_at IS %L', r.s, r.t,
      'Soft delete: NULL = live (db-rules §8). Added 2026-08-21 to make the entity_types.has_soft_delete=true claim TRUE. Authenticated RLS deliberately does NOT filter this; the app filters, and anon pub_read does.');
    n_added := n_added + 1;
  END LOOP;

  RAISE NOTICE 'added deleted_at to % table(s)', n_added;
END $$;

-- Proof: no active BASE-TABLE token claims soft delete without the column.
DO $$
DECLARE n int; v_tokens text;
BEGIN
  SELECT count(*), string_agg(et.token, ', ' ORDER BY et.token) INTO n, v_tokens
  FROM platform.entity_types et
  WHERE et.is_active AND et.has_soft_delete AND et.token <> 'agent_card'
    AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
                WHERE ns.nspname=et.schema_name AND c.relname=et.table_name AND c.relkind IN ('r','p'))
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema=et.schema_name AND c.table_name=et.table_name
                      AND c.column_name='deleted_at');
  IF n <> 0 THEN
    RAISE EXCEPTION 'registry still claims soft delete without a column on % token(s): %', n, v_tokens;
  END IF;
END $$;

-- The three of these that expose an anon lane get their policies regenerated,
-- so a soft-deleted PUBLIC row is actually hidden from anon. Without this the
-- column would be a half-capability on exactly the tables where it leaks.
-- (The other 22 are `component` variants — that lane emits no anon policy and
-- no deleted_at prefix, so regenerating them would be churn for zero change.)
SELECT iam.apply_rls('workbench','udt_datasets',        'dataset',        'entity');
SELECT iam.apply_rls('workbench','udt_structured_lists','structured_list','entity');
SELECT iam.apply_rls('workbench','udt_workbooks',       'workbook',       'entity');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE policyname='pub_read'
     AND (schemaname,tablename) IN (('workbench','udt_datasets'),('workbench','udt_structured_lists'),('workbench','udt_workbooks'))
     AND qual LIKE '%deleted_at IS NULL%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected 3 deleted_at-guarded pub_read policies, found %', n;
  END IF;
END $$;

COMMIT;
