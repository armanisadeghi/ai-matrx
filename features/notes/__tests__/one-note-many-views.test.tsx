// ONE NOTE, MANY VIEWS — the note's body is ONE working copy, not one per editor.
//
// The same note open twice (a board tile AND the notes side panel, two split
// panes) used to be two editors with two private buffers and two timers: the
// second view lagged the first by a debounce, concurrent typing resolved
// last-debounce-wins, and the first view to unmount cleared the shared live
// buffer while the other view was still typing (notes audit N-07). The undo
// history the person could reach also lived in the view: right after a
// remount ⌘Z in Write did nothing.
//
// Break that would turn these red: an editor keeping its body in component
// state (`useState(reduxContent)` + its own timer), a view's unmount clearing
// the note's live buffer, or note undo leaving the rich editor alone when the
// editor has no history of its own.
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// The editor body is replaced by a plain field bound exactly like the real one
// (`content` + `onChange`), inside the rich editor's root so the undo routing
// sees a Write-mode keystroke. Its controller reports an empty history — what
// a freshly (re)mounted Write editor has.
jest.mock("../components/NoteEditorCore", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  return {
    isRichEditorMode: (mode: string) => mode === "write" || mode === "source",
    NoteEditorCore: ({
      content,
      onChange,
      richEditorRef,
    }: {
      content: string;
      onChange: (next: string) => void;
      richEditorRef?: { current: unknown };
    }) => {
      ReactActual.useEffect(() => {
        if (richEditorRef) richEditorRef.current = { historyDepth: () => ({ undo: 0, redo: 0 }) };
      });
      return (
        <div data-rich-editor="">
          <textarea data-testid="body" value={content} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    },
  };
});
jest.mock("next/dynamic", () => () => () => null);
jest.mock("../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false, loading: false }) }));
jest.mock("../hooks/usePreferredDefaultEditorMode", () => ({
  useNoteEditorMode: () => "write",
  useRememberNoteEditorMode: () => () => {},
}));
jest.mock("../hooks/useNotesSurfaceScope", () => ({ useNotesSurfaceScope: () => () => ({}) }));
jest.mock("../hooks/useNoteArtifactMaterialization", () => ({ useNoteArtifactMaterialization: () => ({}) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: new Proxy({}, { get: () => jest.fn() }) }));

import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore, type Middleware } from "@reduxjs/toolkit";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { enableMapSet } from "immer";
import { createRoot, type Root } from "react-dom/client";
import notesReducer, { upsertNoteFromServer } from "../redux/slice";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { NoteContentEditor } from "../components/NoteContentEditor";
import { getNoteLiveContent } from "../utils/noteLiveContent";
import type { Note } from "../types";

enableMapSet();

const NOTE_ID = "5c1b7e2a-3f4d-4a8b-9c6e-2d7f8a9b0c1d";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORED = "Harbor Dental — new-patient intake: confirm insurance, then x-rays.";

const storedNote = (): Note => ({
  id: NOTE_ID, organization_id: ORG, version: 3, content: STORED, label: "New-patient intake",
  folder_name: null, folder_id: null, tags: [], metadata: {}, published_to_web: false, position: 0,
  project_id: null, task_id: null, created_at: "", created_by: ACTOR, updated_at: "", updated_by: ACTOR,
  deleted_at: null, content_hash: null, file_path: null, last_device_id: null, custom_fields: {},
  sync_version: 0, search_engine_indexed: null, shown_to: null,
});

function makeStore() {
  const commits: string[] = [];
  const recordCommits: Middleware = () => (next) => (action) => {
    const a = action as { type?: string; payload?: { content?: string } };
    if (a.type === "notes/updateNoteContent" && typeof a.payload?.content === "string") commits.push(a.payload.content);
    return next(action);
  };
  const store = configureStore({
    reducer: {
      notes: notesReducer,
      userAuth: (state = { id: ACTOR, authReady: true }) => state,
      appContext: appContextReducer,
    },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }).concat(recordCommits),
  });
  store.dispatch(upsertNoteFromServer({ note: storedNote(), fetchStatus: "full" }));
  return { store, commits };
}

type Store = ReturnType<typeof makeStore>["store"];

function mountView(store: Store, instance: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <NotesInstanceProvider value={instance}>
          <NoteContentEditor noteId={NOTE_ID} embedded />
        </NotesInstanceProvider>
      </Provider>,
    );
  });
  const body = () => container.querySelector<HTMLTextAreaElement>("[data-testid=body]")!;
  return {
    body,
    type(text: string) {
      const field = body();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      act(() => {
        setter.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    configurable: true,
  });
});
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("one note open in two views", () => {
  it("shows a keystroke in the other view at once, and commits it once", () => {
    const { store, commits } = makeStore();
    const tile = mountView(store, "board-tile");
    const panel = mountView(store, "side-panel");
    try {
      expect(panel.body().value).toBe(STORED);
      tile.type(`${STORED} Ask about latex allergy.`);

      // No debounce between two views of one note.
      expect(panel.body().value).toBe(`${STORED} Ask about latex allergy.`);
      expect(commits).toEqual([]);

      act(() => jest.advanceTimersByTime(1000));
      expect(commits).toEqual([`${STORED} Ask about latex allergy.`]);
      expect(store.getState().notes.notes[NOTE_ID].content).toBe(`${STORED} Ask about latex allergy.`);
    } finally {
      tile.unmount();
      panel.unmount();
    }
  });

  it("keeps the words typed in one view when the OTHER view closes mid-debounce", () => {
    const { store, commits } = makeStore();
    const tile = mountView(store, "board-tile");
    const panel = mountView(store, "side-panel");
    panel.type(`${STORED} Patient prefers mornings.`);

    tile.unmount();
    // The panel is still typing: its words are the note's live body, and the
    // closing tile neither cleared them nor wrote a stale copy over them.
    expect(getNoteLiveContent(NOTE_ID)).toBe(`${STORED} Patient prefers mornings.`);
    expect(panel.body().value).toBe(`${STORED} Patient prefers mornings.`);
    expect(commits).toEqual([]);

    panel.unmount();
    // The last view leaving commits what it held — once.
    expect(commits).toEqual([`${STORED} Patient prefers mornings.`]);
    expect(store.getState().notes.notes[NOTE_ID].content).toBe(`${STORED} Patient prefers mornings.`);
    expect(getNoteLiveContent(NOTE_ID)).toBeUndefined();
  });

  it("a remounted Write editor still undoes through the note's own history", () => {
    const { store } = makeStore();
    const first = mountView(store, "board-tile");
    first.type(`${STORED} Bring photo ID.`);
    first.unmount(); // a board tile falls asleep / is closed and undone

    const again = mountView(store, "board-tile");
    try {
      expect(again.body().value).toBe(`${STORED} Bring photo ID.`);
      act(() => {
        again.body().dispatchEvent(
          new KeyboardEvent("keydown", { key: "z", metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }),
        );
      });
      expect(store.getState().notes.notes[NOTE_ID].content).toBe(STORED);
      expect(again.body().value).toBe(STORED);
    } finally {
      again.unmount();
    }
  });
});
