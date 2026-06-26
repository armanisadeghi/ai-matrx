import type { Note } from "../types";

/**
 * Sentinel id for the phantom (unsaved) note shown before any real note is
 * active. A phantom is a purely client-side placeholder — the editor renders
 * it so the user is always typing into "a note", but it is NEVER persisted
 * until the first edit materialises it into a real DB row (see the
 * `PHANTOM_NOTE_ID` branch in each editor's update handler).
 */
export const PHANTOM_NOTE_ID = "__phantom__";

/**
 * Create a fresh local-only placeholder note. Must contain every column of the
 * DB row so it satisfies the `Note` (= NoteRow) type — if the schema adds a
 * column, TypeScript flags this spot.
 */
export function createPhantomNote(folderName: string = "Draft"): Note {
  const now = new Date().toISOString();
  return {
    id: PHANTOM_NOTE_ID,
    label: "",
    content: "",
    content_hash: null,
    file_path: null,
    folder_id: null,
    folder_name: folderName,
    tags: [],
    user_id: "",
    created_at: now,
    updated_at: now,
    is_deleted: false,
    is_public: false,
    visibility: "private",
    last_device_id: null,
    shared_with: {},
    organization_id: null,
    project_id: null,
    task_id: null,
    position: 0,
    metadata: {},
    sync_version: 0,
    version: 1,
    created_by: null,
    updated_by: null,
  };
}
