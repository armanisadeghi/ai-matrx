-- =====================================================================
-- udt_* Wave-3 ADDITIVE retrofit (Step-1 only: standard cols + org/actor
-- backfill + _touch_row/_stamp_actor; replaces legacy set_updated_at).
-- NO RLS flips, NO drops, NO NOT NULL. Idempotent (routine is re-runnable;
-- backfills are IS NULL-guarded; trigger create is drop-if-exists+create).
--
-- Classification (10 public.udt_* base tables):
--   Base-1 entity  -> retrofit_entity
--     udt_datasets         (personal; owner user_id)            [parent of fields/rows]
--     udt_dataset_fields   (parent  -> udt_datasets via table_id)
--     udt_dataset_rows     (parent  -> udt_datasets via table_id)
--     udt_documents        (personal; owner user_id)
--     udt_workbooks        (personal; owner user_id)
--     udt_picklists        (personal; owner user_id)            [parent of items]
--     udt_picklist_items   (parent  -> udt_picklists via list_id)
--   Base-3 log/append-only -> SKIP (no version/soft-delete; their own history):
--     udt_dataset_row_versions  (bigint id, change_kind/changed_by snapshot log)
--     udt_document_snapshots    (origin='autosave' snapshot log)
--     udt_workbook_snapshots    (origin='autosave' snapshot log)
--
-- No created_by TYPE collisions: none of the 7 entities had a created_by
-- column (the routine adds the standard uuid). The two snapshot tables that
-- carry created_by uuid are Base-3 (skipped) -> no RENAME needed anywhere.
--
-- Legacy updated-at trigger on each entity = generic `set_updated_at`
-- (replaced by _touch_row). Business triggers preserved:
--   inherit_table_security_on_insert, cascade_table_security_settings,
--   udt_dataset_rows_validate, udt_log_row_version (version snapshots),
--   and the _mirror_proj/_mirror_task association-mirror triggers (litter
--   stays in place this wave -- project_id/task_id/workbook_id untouched).
--
-- Org backfill: 'personal' -> user's personal org (100% owner coverage
-- verified: 11/11 owners have a personal org; 0 system-org fallback).
-- 'parent'  -> denormalized from udt_datasets / udt_picklists.
-- Verified live: 0 null-org, 0 null-created_by, 0 null-version on all 7.
-- =====================================================================

-- Parents first (children denormalize org from them).
select platform.retrofit_entity('udt_datasets',       'dataset',       'personal', 'user_id', null,            null,       'set_updated_at');
select platform.retrofit_entity('udt_dataset_fields', 'dataset_field', 'parent',   'user_id', 'udt_datasets',  'table_id', 'set_updated_at');
select platform.retrofit_entity('udt_dataset_rows',   'dataset_row',   'parent',   'user_id', 'udt_datasets',  'table_id', 'set_updated_at');

select platform.retrofit_entity('udt_picklists',      'picklist',      'personal', 'user_id', null,            null,       'set_updated_at');
select platform.retrofit_entity('udt_picklist_items', 'picklist_item', 'parent',   'user_id', 'udt_picklists', 'list_id',  'set_updated_at');

select platform.retrofit_entity('udt_documents',      'document',      'personal', 'user_id', null,            null,       'set_updated_at');
select platform.retrofit_entity('udt_workbooks',      'workbook',      'personal', 'user_id', null,            null,       'set_updated_at');
