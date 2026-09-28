// A NOTE OPENED FROM THE LIST NEVER MOUNTS AN EDITOR BEFORE ITS BODY ARRIVES.
//
// The list read carries a preview, never the body (audit N-24). Mounting the
// editor on "" in that window let a keystroke arm the local-edit sync; the
// arriving body was discarded as a clobber and the next save replaced the
// whole note with those few characters. Until 2026-09-27 only shared notes
// were gated — the rich editor hid the gap by accident by refusing to render
// any empty document, which also left every NEW note on "Loading editor..."
// forever. Drop the `bodyLoaded` gate and this goes red.
let mounted = 0;
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({ EditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("./NoteEditorCore", () => ({ NoteEditorCore: () => { mounted += 1; return <div data-testid="editor" />; }, isRichEditorMode: (mode: string) => mode === "write" || mode === "source" }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../hooks/usePreferredDefaultEditorMode", () => ({ useNoteEditorMode: () => "write", useRememberNoteEditorMode: () => () => {} }));
jest.mock("../hooks/useNotesSurfaceScope", () => ({ useNotesSurfaceScope: () => () => ({}) }));
jest.mock("../hooks/useNoteUndoRedo", () => ({ useNoteUndoRedo: () => ({}) }));
jest.mock("../hooks/useNoteArtifactMaterialization", () => ({ useNoteArtifactMaterialization: () => ({}) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: new Proxy({}, { get: () => jest.fn() }) }));
const fetchNoteContent = jest.fn((noteId: string) => ({ type: "test/fetchNoteContent", payload: noteId }));
jest.mock("../redux/thunks", () => ({ ...jest.requireActual("../redux/thunks"), fetchNoteContent: (noteId: string) => fetchNoteContent(noteId) }));
import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { enableMapSet } from "immer";
enableMapSet();
import { createRoot } from "react-dom/client";
import notesReducer, { upsertNoteFromServer } from "../redux/slice";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { NoteContentEditor } from "./NoteContentEditor";
import type { Note } from "../types";

const id = "44444444-4444-4444-8444-444444444444", org = "11111111-1111-4111-8111-111111111111", actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const note = (o: Partial<Note> = {}): Note => ({ id, organization_id: org, version: 2, content: "Kiln firing schedule", label: "Kiln", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "", created_by: actor, updated_at: "", updated_by: actor, deleted_at: null, content_hash: null, file_path: null, last_device_id: null, custom_fields: {}, sync_version: 0, search_engine_indexed: null, shown_to: null, ...o });

it("waits for the body of a listed note, then mounts the editor", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }), configurable: true });
  const store = configureStore({ reducer: { notes: notesReducer, userAuth: (state = { id: actor, authReady: true }) => state, appContext: appContextReducer }, middleware: (gdm) => gdm({ serializableCheck: false }) });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    // A list row: preview only, no body.
    const { content: _body, ...listRow } = note();
    await act(async () => { store.dispatch(upsertNoteFromServer({ note: listRow as Note, fetchStatus: "list" })); });
    await act(async () => root.render(<Provider store={store}><NotesInstanceProvider value="i"><NoteContentEditor noteId={id} /></NotesInstanceProvider></Provider>));
    expect(mounted).toBe(0);
    expect(container.textContent).toContain("Loading note");
    expect(fetchNoteContent).toHaveBeenCalledWith(id);

    // The body lands.
    await act(async () => { store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" })); });
    expect(mounted).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("Loading note");
  } finally { await act(async () => root.unmount()); }
});
