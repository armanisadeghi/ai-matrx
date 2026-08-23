-- 🚨 EVERY org-less INSERT INTO workbench.working_documents FAILED WITH A HARD
-- ERROR — a stale org-inheritance trigger pointing at a column that was dropped.
--
-- ============================================================================
-- THE BUG, MEASURED LIVE (rolled back)
-- ============================================================================
--   INSERT (title, content, created_by)                  -> FAILS
--       UndefinedColumn: column "conversation_id" not found in data type
--                        workbench.working_documents
--   INSERT (title, content, created_by, organization_id) -> OK
--
-- `_0_inherit_org` still ran
-- `platform.inherit_org_from_parent('chat','conversation','conversation_id')`,
-- but `workbench.working_documents` HAS NO `conversation_id` COLUMN — it was
-- dropped when the table was canonicalized (the conversation link is now an
-- association edge / `metadata.origin_conversation_id`, which is the canonical
-- shape; a `conversation_id` FK would be the bug).
--
-- The failure is conditional, which is why it survived: `inherit_org_from_parent`
-- returns EARLY when `NEW.organization_id IS NOT NULL`, so it never touches the
-- missing column on an insert that supplies the org. Only the org-LESS path —
-- the one `_stamp_org_default` exists to serve — reaches the broken lookup. And
-- because the trigger is named `_0_inherit_org`, it sorts FIRST and fires
-- BEFORE `_stamp_org_default` ever gets the chance to fill the column.
--
-- So the backstop db-rules §2 requires was present, correct, and unreachable.
--
-- ============================================================================
-- SOMEBODY ALREADY HIT THIS AND MISDIAGNOSED IT — worth reading before you
-- "fix" the caller instead
-- ============================================================================
-- `aidream/services/conversation_context/context_writeback.py` carries:
--
--   # NOTE: working_documents.organization_id is NOT NULL. A missing
--   # spec.organization_id fails this insert at the DB — a pre-existing
--   # gap carried over unchanged from the raw-SQL version (not
--   # introduced by this conversion); flagged, not silently patched.
--
-- Correctly observed, wrongly attributed. The insert did not fail on the NOT
-- NULL constraint — it failed on `UndefinedColumn`, several triggers earlier,
-- and would have failed the same way even with a nullable column. The NOT NULL
-- was never the problem; the stale trigger was. That comment is corrected in
-- the same commit.
--
-- ============================================================================
-- THE FIX + THE GUARD
-- ============================================================================
-- Drop the stale trigger. `_stamp_org_default` then does exactly its job —
-- PROVEN in the dry run: after the drop, an org-less insert succeeded and came
-- back stamped with the creator's organization.
--
-- Then `audit.inherit_org_trigger_drift`, the sibling of the
-- `audit.trigger_token_drift` guard added the same day, so this whole family of
-- "trigger arguments name something that no longer exists" is watched rather
-- than rediscovered. It flags an `inherit_org_from_parent` trigger whose named
-- PARENT TABLE is missing, whose parent has no `organization_id` to inherit, or
-- whose CHILD lacks the FK column the trigger reads. Swept live: 117 such
-- triggers exist and this was the ONLY drifted one — so the guard starts empty
-- and any future row is a real regression.
--
-- Idempotent: DROP TRIGGER IF EXISTS + CREATE OR REPLACE VIEW.

BEGIN;

DROP TRIGGER IF EXISTS _0_inherit_org ON workbench.working_documents;

CREATE OR REPLACE VIEW audit.inherit_org_trigger_drift AS
WITH t AS (
  SELECT n.nspname AS child_schema,
         c.relname AS child_table,
         tg.tgname AS trigger_name,
         (regexp_match(pg_get_triggerdef(tg.oid),
            'inherit_org_from_parent\(''([a-z0-9_]+)'', *''([a-z0-9_]+)'', *''([a-z0-9_]+)''')) AS m
  FROM pg_trigger tg
  JOIN pg_class c     ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
    AND pg_get_triggerdef(tg.oid) ~ 'inherit_org_from_parent'
)
SELECT t.child_schema, t.child_table, t.trigger_name,
       t.m[1] || '.' || t.m[2] AS parent_named,
       t.m[3]                  AS fk_column,
       (SELECT count(*) > 0 FROM information_schema.tables x
         WHERE x.table_schema = t.m[1] AND x.table_name = t.m[2])          AS parent_exists,
       (SELECT count(*) > 0 FROM information_schema.columns x
         WHERE x.table_schema = t.m[1] AND x.table_name = t.m[2]
           AND x.column_name = 'organization_id')                          AS parent_has_org,
       (SELECT count(*) > 0 FROM information_schema.columns x
         WHERE x.table_schema = t.child_schema AND x.table_name = t.child_table
           AND x.column_name = t.m[3])                                     AS child_has_fk
FROM t
WHERE t.m IS NOT NULL
  AND (NOT EXISTS (SELECT 1 FROM information_schema.tables x
                    WHERE x.table_schema = t.m[1] AND x.table_name = t.m[2])
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns x
                    WHERE x.table_schema = t.m[1] AND x.table_name = t.m[2]
                      AND x.column_name = 'organization_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns x
                    WHERE x.table_schema = t.child_schema AND x.table_name = t.child_table
                      AND x.column_name = t.m[3]));

COMMENT ON VIEW audit.inherit_org_trigger_drift IS
  'Any row = a platform.inherit_org_from_parent trigger whose ARGUMENTS name something that no longer exists: a missing parent table, a parent with no organization_id to inherit, or a child missing the FK column the trigger reads. The failure is CONDITIONAL and therefore easy to miss — inherit_org_from_parent returns early when organization_id is already set, so only the org-less path (the one _stamp_org_default exists to serve) hits the broken lookup and dies with UndefinedColumn. Found 2026-08-21 on workbench.working_documents, where a dropped conversation_id column made every org-less insert a hard error. Sibling of audit.trigger_token_drift. MUST BE EMPTY.';

DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM audit.inherit_org_trigger_drift;
  IF v <> 0 THEN
    RAISE EXCEPTION 'audit.inherit_org_trigger_drift is not empty after the repair: % row(s)', v;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'workbench.working_documents'::regclass
                AND tgname = '_0_inherit_org' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'the stale _0_inherit_org trigger survived the drop';
  END IF;

  -- The backstop that must now carry the org must actually be attached.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'workbench.working_documents'::regclass
                    AND tgname = '_stamp_org_default' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'working_documents has organization_id NOT NULL and now has NO org backstop at all (db-rules §2)';
  END IF;
END $$;

COMMIT;
