/**
 * THE SAVE-FAILURE NOTICE IS DERIVED, NEVER RE-CAPTURED. The canonical save
 * thunk classifies and captures a failed write once; a surface that shows the
 * user "Failed to save note" must use `toastErrorAlreadyCaptured`, which never
 * files a second, context-free system_error. This used to be asserted by
 * grepping the source for the call name — a change detector that passed while
 * the behaviour could regress. Now the phone editor's Save is driven for real
 * against a rejecting save thunk.
 */
import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { createRoot } from "react-dom/client";
import notesReducer, { upsertNoteFromServer, setNoteField } from "../redux/slice";
import type { Note } from "../types";
import MobileNoteEditor from "./mobile/MobileNoteEditor";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";

enableMapSet();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../hooks/useNotesRedux", () => ({
  useNotesRedux: () => ({ copyNote: jest.fn(), moveNote: jest.fn(), moveNoteToNewFolder: jest.fn(), setActiveNoteDirty: jest.fn() }),
}));
jest.mock("../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../hooks/useNoteDelete", () => ({ useNoteDelete: () => ({ isDeleting: false, requestDelete: jest.fn() }) }));
jest.mock("@/hooks/useToastManager", () => ({ useToastManager: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() }, toastErrorAlreadyCaptured: jest.fn() }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({ NonEditableContextMenu: () => null }));
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("./mobile/NoteEditorDock", () => ({ NoteEditorDock: () => null }));
jest.mock("./NoteDraftRecoveryBanner", () => ({ NoteDraftRecoveryBanner: () => null }));
jest.mock("./NoteConflictWindow", () => ({ NoteConflictWindow: () => null }));
jest.mock("next/dynamic", () => () => () => null);
// The canonical save thunk, rejecting: it has ALREADY captured the failure.
jest.mock("../redux/thunks", () => {
  const actual = jest.requireActual<typeof import("../redux/thunks")>("../redux/thunks");
  return {
    ...actual,
    // Shaped like a dispatched createAsyncThunk result: the dispatch promise
    // resolves to the rejected action, and `.unwrap()` throws.
    saveNote: Object.assign(
      () => () =>
        Object.assign(Promise.resolve({ type: "notes/saveNote/rejected" }), {
          unwrap: () => Promise.reject(new Error("write refused")),
        }),
      { pending: { match: () => false }, fulfilled: { match: () => false }, rejected: { match: () => false } },
    ),
  };
});

const ID = "33333333-3333-4333-8333-333333333333";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (): Note => ({
  custom_fields: {},
  id: ID, organization_id: ORG, version: 4, content: "base", label: "N",
  folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal",
  position: 0, project_id: null, task_id: null, created_at: "2026-09-14T00:00:00.000Z",
  created_by: ACTOR, updated_at: "2026-09-14T00:00:00.000Z", updated_by: ACTOR,
  deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0,
});

describe("save-failure capture boundary (behaviour)", () => {
  it("a rejected Save on the phone shows the already-captured notice, never a fresh toast.error", async () => {
    const store = configureStore({
      reducer: { notes: notesReducer, userAuth: (s = { id: ACTOR, authReady: true }) => s },
      middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    store.dispatch(setNoteField({ id: ID, field: "content", value: "edited" }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Provider store={store}>
          <MobileNoteEditor note={row()} onBack={() => {}} editorMode="plain" />
        </Provider>,
      );
    });
    const editorState = (window as unknown as { __mobileNoteEditorState?: { handleSave: () => Promise<void> } }).__mobileNoteEditorState;
    expect(editorState).toBeDefined();
    await act(async () => {
      await editorState!.handleSave();
    });
    expect(toastErrorAlreadyCaptured).toHaveBeenCalledWith("Failed to save note");
    expect(toast.error).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
