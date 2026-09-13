import React, { act } from "react";
import { Provider, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { createRoot } from "react-dom/client";
import notesReducer, { upsertNoteFromServer } from "../../redux/slice";
import type { ContentSource } from "@/features/rich-document/types";
import type { Note } from "../../types";
import MobileNoteEditor from "./MobileNoteEditor";

let captured: ContentSource | undefined;
const updateNote = jest.fn();
const setActiveNoteDirty = jest.fn();
jest.mock("../../hooks/useNotesRedux", () => ({ useNotesRedux: () => ({ updateNote, setActiveNoteDirty }) }));
jest.mock("../../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../../hooks/useNoteDelete", () => ({ useNoteDelete: () => ({ isDeleting: false, requestDelete: jest.fn() }) }));
jest.mock("@/hooks/useToastManager", () => ({ useToastManager: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("@/lib/toast", () => ({ toastErrorAlreadyCaptured: jest.fn() }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({ NonEditableContextMenu: () => null }));
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({ EditableContextMenu: ({ children, contentSource }: {children: React.ReactNode; contentSource?: ContentSource}) => { captured = contentSource; return <>{children}</>; } }));
jest.mock("./NoteEditorDock", () => ({ NoteEditorDock: ({onTagsChange}: {onTagsChange: (tags: string[]) => void}) => <button onClick={() => onTagsChange(["local tag"])}>Change local tags</button> }));

const id = "33333333-3333-4333-8333-333333333333";
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const note = (version: number): Note => ({ id, organization_id: "11111111-1111-4111-8111-111111111111", version, content: "base", label: "N", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "", created_by: actor, updated_at: "", updated_by: actor, deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0 });
const makeStore = () => configureStore({ reducer: { notes: notesReducer, userAuth: (state = { id: actor, authReady: true }) => state }, middleware: (gdm) => gdm({ serializableCheck: false }) });
type State = ReturnType<ReturnType<typeof makeStore>["getState"]>;
function Host() {
  const record = useSelector((state: State) => state.notes.notes[id]);
  return <MobileNoteEditor note={record} editorMode="plain" onBack={() => {}} />;
}

beforeAll(() => { enableMapSet(); (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { jest.useFakeTimers(); captured = undefined; updateNote.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

it.each([false, true])("preserves local-only tags=%s across a newer clean Redux observation", async (editTags) => {
  const store = makeStore();
  store.dispatch(upsertNoteFromServer({ note: note(4), fetchStatus: "full" }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Provider store={store}><Host /></Provider>));
    expect(captured).toMatchObject({ mode: "editable", editBase: { version: 4 } });
    await act(async () => {
      if (editTags) container.querySelector("button")!.click();
      store.dispatch(upsertNoteFromServer({ note: note(5), fetchStatus: "list" }));
    });
    // No autosave timer elapsed and no local tag was dispatched into Redux.
    expect(updateNote).not.toHaveBeenCalled();
    expect(store.getState().notes.notes[id]._dirty).toBe(false);
    expect(store.getState().notes.notes[id].tags).toEqual([]);
    if (editTags) expect(captured).toMatchObject({ mode: "editable", editBase: { version: 4 }, displayedPhysicalSnapshot: { tags: ["local tag"], version: 4 } });
    else expect(captured).toMatchObject({ mode: "identity" });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
