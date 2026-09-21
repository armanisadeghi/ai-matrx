// A newer CLEAN server observation must not take the phone editor's unsaved
// work away. Since 2026-09-14 the mobile editor writes tags straight into the
// record (the canonical `updateNoteTags`) instead of holding them in React
// state, so the guard now lives where it belongs: the record goes dirty, and
// `applyServerNoteUpsert` preserves dirty fields when version 5 arrives.

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
const setActiveNoteDirty = jest.fn();
jest.mock("../../hooks/useNotesRedux", () => ({
  useNotesRedux: () => ({
    copyNote: jest.fn(),
    moveNote: jest.fn(),
    moveNoteToNewFolder: jest.fn(),
    setActiveNoteDirty,
  }),
}));
jest.mock("../../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../../hooks/useNoteDelete", () => ({ useNoteDelete: () => ({ isDeleting: false, requestDelete: jest.fn() }) }));
jest.mock("@/hooks/useToastManager", () => ({ useToastManager: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() }, toastErrorAlreadyCaptured: jest.fn() }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({ NonEditableContextMenu: () => null }));
jest.mock("../NoteDraftRecoveryBanner", () => ({ NoteDraftRecoveryBanner: () => null }));
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({ EditableContextMenu: ({ children, contentSource }: {children: React.ReactNode; contentSource?: ContentSource}) => { captured = contentSource; return <>{children}</>; } }));
jest.mock("./NoteEditorDock", () => ({ NoteEditorDock: ({onTagsChange}: {onTagsChange: (tags: string[]) => void}) => <button onClick={() => onTagsChange(["local tag"])}>Change local tags</button> }));

const id = "33333333-3333-4333-8333-333333333333";
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const note = (version: number): Note => ({ custom_fields: {}, id, organization_id: "11111111-1111-4111-8111-111111111111", version, content: "base", label: "N", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "", created_by: actor, updated_at: "", updated_by: actor, deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0 });
const makeStore = () => configureStore({ reducer: { notes: notesReducer, userAuth: (state = { id: actor, authReady: true }) => state }, middleware: (gdm) => gdm({ serializableCheck: false }) });
type State = ReturnType<ReturnType<typeof makeStore>["getState"]>;
function Host() {
  const record = useSelector((state: State) => state.notes.notes[id]);
  return <MobileNoteEditor note={record} editorMode="plain" onBack={() => {}} />;
}

beforeAll(() => { enableMapSet(); (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { jest.useFakeTimers(); captured = undefined; setActiveNoteDirty.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

it.each([false, true])("survives a newer clean Redux observation with edits=%s", async (editTags) => {
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
    });
    await act(async () => {
      store.dispatch(upsertNoteFromServer({ note: note(5), fetchStatus: "list" }));
    });

    const record = store.getState().notes.notes[id];
    if (editTags) {
      // The edit is IN the record — a phone edit is durable the moment it is
      // made — and the newer clean observation did not take it back.
      expect(record._dirty).toBe(true);
      expect(record.tags).toEqual(["local tag"]);
      expect(captured).toMatchObject({ mode: "editable", displayedPhysicalSnapshot: { tags: ["local tag"] } });
    } else {
      expect(record._dirty).toBe(false);
      expect(record.tags).toEqual([]);
      expect(captured).toMatchObject({ mode: "identity" });
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
