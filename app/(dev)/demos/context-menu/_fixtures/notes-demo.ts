import type { NotesEditorNotesMapEntry } from "@/features/notes/agent-context/buildNotesEditorContextData";

export const DEMO_NOTE_ID = "00000000-0000-4000-8000-000000000002";

export const DEMO_NOTE_RECORD = {
  label: "Context Menu Demo Note",
  folder_name: "Inbox",
  tags: ["demo", "draft"],
  updated_at: "2026-06-22T12:00:00.000Z",
};

export const DEMO_NOTE_OPEN_TABS = [
  DEMO_NOTE_ID,
  "00000000-0000-4000-8000-000000000003",
];

export const DEMO_NOTES_MAP: Record<string, NotesEditorNotesMapEntry> = {
  [DEMO_NOTE_ID]: {
    id: DEMO_NOTE_ID,
    label: DEMO_NOTE_RECORD.label,
    folder_name: DEMO_NOTE_RECORD.folder_name,
    updated_at: DEMO_NOTE_RECORD.updated_at,
  },
  "00000000-0000-4000-8000-000000000003": {
    id: "00000000-0000-4000-8000-000000000003",
    label: "Meeting Notes",
    folder_name: "Inbox",
    updated_at: "2026-06-21T09:00:00.000Z",
  },
};

export const DEMO_NOTE_FOLDERS = ["Inbox", "Archive", "Projects"];

export const DEMO_NOTE_INITIAL_CONTENT = `# Context Menu Demo Note

Select text before right-click to populate \`active_text\` and \`selection\`.

## Section one

Notes target wiring uses \`matrx-user/notes\` + full surface scope + \`extraSections\` for Save/Export/Move/Delete.
`;
