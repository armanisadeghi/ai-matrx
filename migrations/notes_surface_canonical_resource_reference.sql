-- Notes surface: represent the persisted active note with one canonical
-- resource reference. The runtime now emits `current_note` as
-- {__kind, resource_type, resource_id, overlay?}; the server resolves the
-- complete readable record and applies an optional unsaved-content overlay.
--
-- The removed rows were duplicated client state. No agent.menu_surface binding
-- references this surface at migration time, so there is no mapping payload to
-- rewrite. Idempotent: the upsert and delete are safe to repeat.

INSERT INTO ui.ui_surface_value (
  surface_name,
  name,
  label,
  description,
  value_type,
  always_available,
  typical_char_count,
  sort_order
)
VALUES (
  'matrx-user/notes',
  'current_note',
  'Active note resource',
  'Canonical resource reference for the active persisted note. The server resolves its title, folder, tags, content, timestamps, permissions, and other available fields. When the editor is dirty, the same reference carries a request-scoped content overlay so the unsaved buffer remains authoritative.',
  'object',
  false,
  180,
  300
)
ON CONFLICT (surface_name, name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  always_available = EXCLUDED.always_available,
  typical_char_count = EXCLUDED.typical_char_count,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DELETE FROM ui.ui_surface_value
WHERE surface_name = 'matrx-user/notes'
  AND name IN (
    'current_note_id',
    'current_note_title',
    'current_note_folder',
    'current_note_tags',
    'current_note_word_count',
    'current_note_updated_at',
    'current_note_is_dirty',
    'open_notes_summary',
    'current_folder_note_ids',
    'all_folder_names',
    'context'
  );
