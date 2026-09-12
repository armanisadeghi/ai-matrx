-- PREPARED ONLY — DO NOT MOVE TO migrations/ OR APPLY.
--
-- N01 Notes supporting-index preparation. This additive, autocommit-only draft
-- creates the two parent keys needed by the later Notes organization cutover:
--   1) (organization_id, created_by, name), for scoped folder identity; and
--   2) (id, organization_id), for a future parent-equality foreign key.
--
-- It deliberately preserves every row, trigger, RLS policy, grant, existing
-- unique (created_by, name) index, and current FK. It creates no FK and drops
-- no old index. The old index remains an intentional overlap barrier until all
-- deployed consumers use folder ID plus organization ID.
--
-- This file contains CREATE INDEX CONCURRENTLY, so it MUST be run only through
-- the sanctioned aidream autocommit runner. That runner sends one statement at
-- a time; if a run stops after either index, re-run this exact file. The
-- preflight accepts an already-created index only when its complete catalog
-- definition is exact, and the postflight proves both keys before success.

SET lock_timeout = '2s';
SET statement_timeout = '10min';

DO $n01_preflight$
DECLARE
  v_relation_oid constant oid := 1711434;
  v_expected_acl_hash constant text := '8040d4c48089279c9365e8396ea54216';
  v_expected_trigger_hash constant text := 'e97a235b197b830b74468987cf4ddd10';
  v_expected_policy_hash constant text := 'ddff9aebc68fec7609e12231b8f42990';
  v_old_index constant text := 'CREATE UNIQUE INDEX note_folders_created_by_name_unique ON workbench.note_folders USING btree (created_by, name)';
  v_scoped_index constant text := 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders USING btree (organization_id, created_by, name)';
  v_parent_index constant text := 'CREATE UNIQUE INDEX note_folders_id_organization_unique ON workbench.note_folders USING btree (id, organization_id)';
BEGIN
  IF 'workbench.note_folders'::regclass::oid <> v_relation_oid THEN
    RAISE EXCEPTION 'N01 precondition failed: workbench.note_folders OID changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = v_relation_oid
      AND c.relowner = 'postgres'::regrole
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
      AND md5(coalesce(c.relacl::text, '')) = v_expected_acl_hash
  ) THEN
    RAISE EXCEPTION 'N01 precondition failed: note_folders owner, ACL, or RLS state changed';
  END IF;
  IF (SELECT md5(string_agg(t.oid::text || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid)) FROM pg_trigger t WHERE t.tgrelid = v_relation_oid AND NOT t.tgisinternal) IS DISTINCT FROM v_expected_trigger_hash THEN
    RAISE EXCEPTION 'N01 precondition failed: note_folders trigger set changed';
  END IF;
  IF (SELECT md5(string_agg(p.oid::text || ':' || p.polname || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':' || array_to_string(p.polroles, ',') || ':' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ':' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), ',' ORDER BY p.oid)) FROM pg_policy p WHERE p.polrelid = v_relation_oid) IS DISTINCT FROM v_expected_policy_hash THEN
    RAISE EXCEPTION 'N01 precondition failed: note_folders RLS policy definitions changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_relation_oid AND a.attname='organization_id' AND a.atttypid='uuid'::regtype AND a.attnotnull AND NOT a.attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_relation_oid AND a.attname='created_by' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_relation_oid AND a.attname='name' AND a.atttypid='text'::regtype AND a.attnotnull AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'N01 precondition failed: note_folders identity columns changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid=v_relation_oid AND x.relname='note_folders_created_by_name_unique' AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_old_index) THEN
    RAISE EXCEPTION 'N01 precondition failed: old created_by/name unique index changed or is absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='workbench' AND x.relname='note_folders_organization_created_by_name_unique' AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=x.oid AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_scoped_index))
     OR EXISTS (SELECT 1 FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='workbench' AND x.relname='note_folders_id_organization_unique' AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=x.oid AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_parent_index)) THEN
    RAISE EXCEPTION 'N01 precondition failed: a named supporting index exists with a non-exact definition';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT organization_id,created_by,name FROM workbench.note_folders GROUP BY organization_id,created_by,name HAVING count(*)>1) duplicates)
     OR EXISTS (SELECT 1 FROM (SELECT id,organization_id FROM workbench.note_folders GROUP BY id,organization_id HAVING count(*)>1) duplicates) THEN
    RAISE EXCEPTION 'N01 precondition failed: proposed unique keys have duplicate groups';
  END IF;
END
$n01_preflight$;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS note_folders_organization_created_by_name_unique
  ON workbench.note_folders (organization_id, created_by, name);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS note_folders_id_organization_unique
  ON workbench.note_folders (id, organization_id);

DO $n01_postflight$
DECLARE
  v_relation_oid constant oid := 1711434;
  v_old_index constant text := 'CREATE UNIQUE INDEX note_folders_created_by_name_unique ON workbench.note_folders USING btree (created_by, name)';
  v_scoped_index constant text := 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders USING btree (organization_id, created_by, name)';
  v_parent_index constant text := 'CREATE UNIQUE INDEX note_folders_id_organization_unique ON workbench.note_folders USING btree (id, organization_id)';
BEGIN
  IF (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid=v_relation_oid AND x.relname='note_folders_created_by_name_unique' AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_old_index) <> 1 THEN
    RAISE EXCEPTION 'N01 postflight failed: old created_by/name unique index was not preserved exactly';
  END IF;
  IF (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid=v_relation_oid AND x.relname='note_folders_organization_created_by_name_unique' AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_scoped_index) <> 1
     OR (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid=v_relation_oid AND x.relname='note_folders_id_organization_unique' AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=v_parent_index) <> 1 THEN
    RAISE EXCEPTION 'N01 postflight failed: supporting index definition is absent, invalid, or changed';
  END IF;
END
$n01_postflight$;
