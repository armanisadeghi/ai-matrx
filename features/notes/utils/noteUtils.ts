// features/notes/utils/noteUtils.ts

import type { Note, NoteFilters, NoteSortConfig, FolderGroup } from "../types";
import { DEFAULT_FOLDER_NAMES } from "../constants/defaultFolders";
import { idMatchesQuery } from "@/utils/search-scoring";

/**
 * Whether a note belongs in the active-org sidebar/list view.
 *
 * After the org retrofit, historical notes were stamped onto the user's
 * **personal** organization, while most users keep a company org as their
 * active/default. Filtering strictly on `activeOrgId` then zeros every
 * folder count even though the notes still exist (and show up in
 * unfiltered surfaces like FolderQuickPick).
 *
 * Rule: visible when the note's org matches the active org OR the user's
 * personal org. Other company orgs stay hidden. Callers still handle the
 * null-org ("homeless") case separately.
 */
export function noteMatchesActiveOrgContext(
  note: { organization_id: string | null },
  activeOrgId: string | null,
  personalOrgId: string | null,
): boolean {
  if (!activeOrgId) return true;
  const orgId = note.organization_id;
  if (orgId == null) return false;
  if (orgId === activeOrgId) return true;
  if (personalOrgId != null && orgId === personalOrgId) return true;
  return false;
}

/**
 * Ordered folder names for a sidebar: defaults first, then any folders
 * present on the given notes (alphabetically). Keeps the folder list in
 * lockstep with whatever note set the counts are derived from.
 */
export function folderNamesForNotes(
  notes: ReadonlyArray<{ folder_name: string | null }>,
): string[] {
  const folderSet = new Set<string>(DEFAULT_FOLDER_NAMES);
  for (const note of notes) {
    if (note.folder_name) folderSet.add(note.folder_name);
  }
  return Array.from(folderSet).sort((a, b) => {
    const aIdx = DEFAULT_FOLDER_NAMES.indexOf(a);
    const bIdx = DEFAULT_FOLDER_NAMES.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Filter notes based on search, tags, and folder
 */
export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  let filtered = [...notes];

  // Filter by search text (searches in label and content)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (note) =>
        note.label.toLowerCase().includes(searchLower) ||
        (note.content ?? "").toLowerCase().includes(searchLower) ||
        idMatchesQuery(note, searchLower),
    );
  }

  // Filter by folder
  if (filters.folder_name) {
    filtered = filtered.filter(
      (note) => note.folder_name === filters.folder_name,
    );
  }

  // Filter by tags (note must have all selected tags)
  const tags = filters.tags;
  if (tags && tags.length > 0) {
    filtered = filtered.filter((note) =>
      tags.every((tag) => (note.tags ?? []).includes(tag)),
    );
  }

  return filtered;
}

/**
 * Sort notes based on field and order
 */
export function sortNotes(notes: Note[], sortConfig: NoteSortConfig): Note[] {
  const sorted = [...notes];

  sorted.sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    switch (sortConfig.field) {
      case "label":
        aVal = a.label.toLowerCase();
        bVal = b.label.toLowerCase();
        break;
      case "created_at":
        aVal = a.created_at ? new Date(a.created_at).getTime() : 0;
        bVal = b.created_at ? new Date(b.created_at).getTime() : 0;
        break;
      case "updated_at":
        aVal = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        bVal = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortConfig.order === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.order === "asc" ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Group notes by folder
 * Ensures default folders always appear (even if empty)
 */
export function groupNotesByFolder(notes: Note[]): FolderGroup[] {
  const folderMap = new Map<string, Note[]>();

  // Initialize default folders (they'll show even if empty)
  DEFAULT_FOLDER_NAMES.forEach((folderName) => {
    folderMap.set(folderName, []);
  });

  // Add notes to their respective folders
  notes.forEach((note) => {
    const folder = note.folder_name || "Draft";
    let bucket = folderMap.get(folder);
    if (!bucket) {
      bucket = [];
      folderMap.set(folder, bucket);
    }
    bucket.push(note);
  });

  const groups: FolderGroup[] = Array.from(folderMap.entries()).map(
    ([folder_name, notes]) => ({
      folder_name,
      notes,
      count: notes.length,
    }),
  );

  // Sort: Default folders first (in order), then custom folders alphabetically
  groups.sort((a, b) => {
    const aIsDefault = DEFAULT_FOLDER_NAMES.includes(a.folder_name);
    const bIsDefault = DEFAULT_FOLDER_NAMES.includes(b.folder_name);

    if (aIsDefault && bIsDefault) {
      // Both default: maintain DEFAULT_FOLDERS order
      return (
        DEFAULT_FOLDER_NAMES.indexOf(a.folder_name) -
        DEFAULT_FOLDER_NAMES.indexOf(b.folder_name)
      );
    }
    if (aIsDefault) return -1; // Default folders first
    if (bIsDefault) return 1;

    // Both custom: alphabetical
    return a.folder_name.localeCompare(b.folder_name);
  });

  return groups;
}

/**
 * Extract all unique tags from notes
 */
export function extractUniqueTags(notes: Note[]): string[] {
  const allTags = notes.flatMap((note) => note.tags ?? []);
  return Array.from(new Set(allTags)).sort();
}

/**
 * Whether a note's content is empty (null, undefined, or whitespace-only).
 *
 * Single source of truth for "does this note have anything worth losing" —
 * drives the empty-new-note dedup logic below AND the delete-confirmation
 * skip rule (an empty note deletes instantly, no dialog).
 */
export function isNoteContentEmpty(
  content: string | null | undefined,
): boolean {
  return !content || content.trim() === "";
}

/**
 * Find an existing empty note (no content and "New Note" label or variants like "New Note 1", "New Note 2", etc.)
 * This prevents duplicate empty notes from accumulating
 */
export function findEmptyNewNote(notes: Note[]): Note | null {
  return (
    notes.find((note) => {
      if (!isNoteContentEmpty(note.content)) return false;

      // Check if label is "New Note" or "New Note [number]"
      const isNewNoteLabel =
        note.label === "New Note" || /^New Note \d+$/.test(note.label);
      return isNewNoteLabel;
    }) || null
  );
}

/**
 * Find an existing empty note in a specific folder
 */
export function findEmptyNewNoteInFolder(
  notes: Note[],
  folderName: string,
): Note | null {
  return (
    notes.find(
      (note) =>
        note.label === "New Note" &&
        note.folder_name === folderName &&
        isNoteContentEmpty(note.content),
    ) || null
  );
}

/**
 * Generate a unique label for a new note
 * IMPORTANT: Only generates numbered variants if base label exists AND is not empty
 * This prevents creating "New Note 1" when "New Note" exists but is empty (we should reuse the empty one)
 */
export function generateUniqueLabel(
  existingNotes: Note[],
  baseLabel = "New Note",
): string {
  // Check if base label exists
  const baseNote = existingNotes.find((n) => n.label === baseLabel);

  // If base label doesn't exist, use it
  if (!baseNote) {
    return baseLabel;
  }

  // If base label exists but is empty, this is a problem!
  // The caller should have found and reused this empty note instead
  // But we'll return the base label anyway - duplicate checking should handle this
  const isBaseEmpty = isNoteContentEmpty(baseNote.content);
  if (isBaseEmpty) {
    console.warn(
      `generateUniqueLabel: "${baseLabel}" exists but is empty. Should be reused, not duplicated.`,
    );
    return baseLabel;
  }

  // Base label exists and has content, so find next available number
  let counter = 1;
  const existingLabels = new Set(existingNotes.map((n) => n.label));

  while (existingLabels.has(`${baseLabel} ${counter}`)) {
    // Check if this numbered variant is empty
    const numberedNote = existingNotes.find(
      (n) => n.label === `${baseLabel} ${counter}`,
    );
    if (numberedNote && isNoteContentEmpty(numberedNote.content)) {
      console.warn(
        `generateUniqueLabel: "${baseLabel} ${counter}" exists but is empty. Should be reused, not duplicated.`,
      );
      return `${baseLabel} ${counter}`;
    }
    counter++;
  }

  return `${baseLabel} ${counter}`;
}
