import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = jest.fn();
const createNewNote = Object.assign(jest.fn((input: unknown) => ({ type: "notes/createNewNote/pending", meta: { arg: input } })), {
  fulfilled: { match: (action: { type?: string }) => action.type === "notes/createNewNote/fulfilled" },
  rejected: { match: (action: { type?: string }) => action.type === "notes/createNewNote/rejected" },
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("../redux/selectors", () => ({
  selectAllNotesList: () => [],
  selectActiveNote: () => null,
  selectOpenTabs: () => [],
  selectNotesListStatus: () => "loaded",
  selectActiveNoteId: () => null,
}));
jest.mock("../redux/slice", () => ({
  setActiveNote: jest.fn(), addTab: jest.fn(), removeTab: jest.fn(), reorderTabs: jest.fn(),
  resetNotesState: jest.fn(), setNoteField: jest.fn(),
}));
jest.mock("../redux/thunks", () => ({
  createNewNote,
  fetchNotesList: jest.fn(), fetchNoteContent: jest.fn(), saveNote: jest.fn(),
  deleteNote: jest.fn(), copyNote: jest.fn(), findOrCreateEmptyNote: jest.fn(),
  saveNoteField: jest.fn(), moveNoteToFolder: jest.fn(), moveNoteToNewFolder: jest.fn(),
}));

import { useNotesRedux } from "./useNotesRedux";
import { NoteContextPartialSaveError } from "../service/noteSaveErrors";
import type { Note } from "../types";

let api: ReturnType<typeof useNotesRedux> | null = null;

function Probe() {
  api = useNotesRedux();
  return null;
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    content: "body",
    content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: "user-1",
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: null,
    label: "Created",
    last_device_id: null,
    metadata: {},
    organization_id: "org-1",
    position: 0,
    project_id: "project-1",
    sync_version: 0,
    tags: [],
    task_id: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
  };
}

describe("useNotesRedux partial creation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    api = null;
    dispatch.mockReset();
    createNewNote.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("preserves the durable note and failed context fields instead of reporting a rollback", async () => {
    dispatch.mockResolvedValue({
      type: "notes/createNewNote/rejected",
      payload: {
        code: "context_partial",
        message: "The note was saved, but one or more context links could not be saved.",
        receipt: {
          note: note(),
          databaseWrite: "saved",
          succeededFields: ["project_id"],
          failedFields: ["task_id"],
          safeCauses: { task_id: "task denied" },
        },
      },
    });

    if (!api) throw new Error("The Notes hook did not mount.");
    await expect(api.createNote({ organization_id: "org-1", content: "body" })).rejects.toMatchObject({
      name: "NoteContextPartialSaveError",
      actualStoredNote: note(),
      failedFields: ["task_id"],
      safeCauses: { task_id: "task denied" },
    } satisfies Partial<NoteContextPartialSaveError>);
    expect(createNewNote).toHaveBeenCalledWith({ organization_id: "org-1", content: "body" });
  });
});
