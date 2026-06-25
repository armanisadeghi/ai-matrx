-- note_* Wave-3 ADDITIVE retrofit (Step-1 only: standard actor/org/version cols
-- + backfill + platform._touch_row/_stamp_actor triggers). No RLS, no drops, no NOT NULL.
--
-- Classification of the public.note_% family (7 base tables):
--   Base-1 entity (retrofit, personal org): notes, note_folders, note_devices,
--                                           note_directory_mappings, note_shares
--   Base-3 log  (SKIP — append-only, no updated_at): note_versions, note_sync_log
--
-- notes & note_folders each carry THREE redundant legacy updated_at stamper triggers
-- (all pure NEW.updated_at = now()). retrofit_entity drops only the one it is told to
-- (p_legacy_trigger); drop the extras here FIRST so the org/created_by backfill UPDATE
-- does not stamp updated_at = now() on every row and wreck recency sort. After this,
-- platform._touch_row is the single updated_at authority. Business triggers
-- (note_version_trigger, increment_sync_version, _mirror_proj, _mirror_task,
-- trg_notes_*, trg_auto_ingest_note) are left untouched.
--
-- Idempotent: drop-if-exists + retrofit_entity guards every backfill on `... IS NULL`
-- and every trigger create on drop-if-exists, so re-applying is a no-op.

-- notes: drop the two non-canonical updated_at stampers (canonical notes_updated_at is
-- dropped by the routine via p_legacy_trigger).
drop trigger if exists set_updated_at on public.notes;           -- handle_updated_at()
drop trigger if exists trigger_notes_updated_at on public.notes;  -- update_updated_at()

-- note_folders: drop the two non-canonical updated_at stampers (canonical
-- note_folders_updated_at is dropped by the routine).
drop trigger if exists set_note_folders_updated_at on public.note_folders;      -- update_updated_at_column()
drop trigger if exists trigger_note_folders_updated_at on public.note_folders;  -- update_updated_at()

-- Base-1 entity retrofits (personal org strategy; ownerless rows -> Matrx System org).
select platform.retrofit_entity('notes',                    'note',                  'personal', 'user_id',  null, null, 'notes_updated_at');
select platform.retrofit_entity('note_folders',             'note_folder',           'personal', 'user_id',  null, null, 'note_folders_updated_at');
select platform.retrofit_entity('note_devices',             'note_device',           'personal', 'user_id',  null, null, 'set_note_devices_updated_at');
select platform.retrofit_entity('note_directory_mappings',  'note_directory_mapping','personal', 'user_id',  null, null, 'set_note_directory_mappings_updated_at');
select platform.retrofit_entity('note_shares',              'note_share',            'personal', 'owner_id', null, null, 'note_shares_updated_at');
