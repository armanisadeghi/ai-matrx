// THE PHONE EDITOR IS THE SAME MACHINE AS THE DESKTOP EDITOR.
//
// Each case below fails against the editor as it stood on 2026-09-14 (audit
// N-01, N-05 mobile half, N-20):
//   (a) text typed and left inside the debounce window reached nothing — the
//       bespoke 2s timer was cancelled by this component's own unmount.
//   (b) a CAS conflict was recorded on the record and mobile rendered NOTHING
//       for it, so the save simply kept failing with no way to choose.
//   (c) a streak of failing saves produced one toast and then silence — the
//       blocking banner desktop has was never mounted here.

import React, { act } from "react";
import { Provider, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { createRoot } from "react-dom/client";
import notesReducer, {
  upsertNoteFromServer,
  markNoteSaveError,
  recordNoteConflict,
  setNoteField,
} from "../../redux/slice";
import { NOTE_SAVE_FAILURE_BLOCK_THRESHOLD } from "../../redux/notes.types";
import type { Note } from "../../types";
import MobileNoteEditor from "./MobileNoteEditor";

jest.mock("../../hooks/useNotesRedux", () => ({
  useNotesRedux: () => ({
    copyNote: jest.fn(),
    moveNote: jest.fn(),
    moveNoteToNewFolder: jest.fn(),
    setActiveNoteDirty: jest.fn(),
  }),
}));
jest.mock("../../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../../hooks/useNoteDelete", () => ({ useNoteDelete: () => ({ isDeleting: false, requestDelete: jest.fn() }) }));
jest.mock("@/hooks/useToastManager", () => ({ useToastManager: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() }, toastErrorAlreadyCaptured: jest.fn() }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({ NonEditableContextMenu: () => null }));
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("./NoteEditorDock", () => ({ NoteEditorDock: () => null }));
// The draft-recovery banner reaches the local draft store and the diff-window
// opener; neither is under test here. Its presence in the tree is asserted by
// the render, not by its internals.
jest.mock("../NoteDraftRecoveryBanner", () => ({
  NoteDraftRecoveryBanner: () => <div data-testid="draft-recovery-banner" />,
}));
// Render lazily-imported components for real — a marker stub would prove
// nothing about whether the canonical conflict window can mount on a phone.
jest.mock("next/dynamic", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  return (loader: () => Promise<{ default: React.ComponentType<unknown> }>) =>
    function Dynamic(props: Record<string, unknown>) {
      const [Loaded, setLoaded] = ReactModule.useState<React.ComponentType<unknown> | null>(null);
      ReactModule.useEffect(() => {
        let alive = true;
        void Promise.resolve(loader()).then((mod) => {
          if (alive) setLoaded(() => mod.default ?? (mod as unknown as React.ComponentType<unknown>));
        });
        return () => {
          alive = false;
        };
      }, []);
      return Loaded ? ReactModule.createElement(Loaded, props) : null;
    };
});

// The rich (WYSIWYG) editor, reduced to its one contract that matters here:
// `getCurrentMarkdown()` can hold words its onChange has not delivered yet.
let richLiveMarkdown = "";
let richOnChange: ((value: string) => void) | null = null;
jest.mock("@/components/mardown-display/chat-markdown/tui/TuiEditorContent", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const Tui = ReactModule.forwardRef(function Tui(props: { onChange?: (value: string) => void }, ref: React.Ref<unknown>) {
    richOnChange = props.onChange ?? null;
    ReactModule.useImperativeHandle(ref, () => ({ getCurrentMarkdown: () => richLiveMarkdown }));
    return ReactModule.createElement("div", { "data-testid": "rich-editor" });
  });
  return { __esModule: true, default: Tui };
});

const ID = "33333333-3333-4333-8333-333333333333";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const row = (overrides: Partial<Note> = {}): Note => ({
  id: ID, organization_id: ORG, version: 4, content: "base", label: "N",
  folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal",
  position: 0, project_id: null, task_id: null, created_at: "2026-09-14T00:00:00.000Z",
  created_by: ACTOR, updated_at: "2026-09-14T00:00:00.000Z", updated_by: ACTOR,
  deleted_at: null, content_hash: null, file_path: null, last_device_id: null,
  sync_version: 0, ...overrides,
});

const makeStore = () =>
  configureStore({
    reducer: {
      notes: notesReducer,
      userAuth: (state = { id: ACTOR, authReady: true }) => state,
    },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
type Store = ReturnType<typeof makeStore>;
type State = ReturnType<Store["getState"]>;

function Host({ mode = "plain" }: { mode?: "plain" | "wysiwyg" }) {
  const record = useSelector((state: State) => state.notes.notes[ID]);
  return <MobileNoteEditor note={record} editorMode={mode} onBack={() => {}} />;
}

async function mount(store: Store, mode: "plain" | "wysiwyg" = "plain") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Host mode={mode} />
      </Provider>,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeAll(() => {
  enableMapSet();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("MobileNoteEditor writes through the canonical path", () => {
  it("keeps text typed and abandoned inside the debounce window (N-01)", async () => {
    jest.useFakeTimers();
    const store = makeStore();
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    const { container, unmount } = await mount(store);

    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "base and one more sentence");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Still inside the debounce: nothing has reached the record yet.
    expect(store.getState().notes.notes[ID].content).toBe("base");

    // Leaving the note (Back, the OS gesture, another note) used to cancel the
    // only path to a durable copy.
    await unmount();

    expect(store.getState().notes.notes[ID].content).toBe("base and one more sentence");
    expect(store.getState().notes.notes[ID]._dirty).toBe(true);
    jest.useRealTimers();
  });

  it("keeps rich-editor text its onChange never delivered when the note is closed", async () => {
    const store = makeStore();
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    const { container, unmount } = await mount(store, "wysiwyg");
    // The lazily-imported rich editor resolves on a microtask.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='rich-editor']")).not.toBeNull();

    // The user types in rich mode; onChange reports part of it...
    await act(async () => {
      richOnChange?.("base, plus the last");
    });
    // ...and the words typed after that have not been reported yet.
    richLiveMarkdown = "base, plus the last sentence typed before tapping Back";
    await unmount();

    expect(store.getState().notes.notes[ID].content).toBe(
      "base, plus the last sentence typed before tapping Back",
    );
    expect(store.getState().notes.notes[ID]._dirty).toBe(true);
    richLiveMarkdown = "";
  });

  it("opening a note in rich mode and leaving WITHOUT editing writes nothing, even if the rich editor re-serializes it", async () => {
    const store = makeStore();
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    const { unmount } = await mount(store, "wysiwyg");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // The rich editor's own serialization differs from the stored text.
    richLiveMarkdown = "base\n";
    await unmount();
    expect(store.getState().notes.notes[ID].content).toBe("base");
    expect(store.getState().notes.notes[ID]._dirty).toBe(false);
    richLiveMarkdown = "";
  });

  it("renders the canonical conflict surface for a recorded CAS conflict (N-20)", async () => {
    const store = makeStore();
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    store.dispatch(setNoteField({ id: ID, field: "content", value: "mine" }));
    store.dispatch(
      recordNoteConflict({
        id: ID,
        expectedVersion: 4,
        currentVersion: 5,
        currentRow: row({ content: "theirs", label: "Remote", version: 5, updated_at: "2026-09-14T00:01:00.000Z" }),
        sentSnapshot: { content: "mine" },
        actorId: ACTOR,
        organizationId: ORG,
        decisionId: "decision-1",
        reviewId: "review-1",
      }),
    );

    const { unmount } = await mount(store);
    // The lazily-imported window resolves on a microtask.
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.getState().notes.notes[ID]._conflictDecision).toBeTruthy();
    expect(document.body.textContent).toContain("Note Conflict");
    expect(document.body.textContent).toContain("Keep Mine");
    expect(document.body.textContent).toContain("Accept Changes");

    await unmount();
  });

  it("renders the blocking save-failure banner once the streak crosses the threshold (N-05)", async () => {
    const store = makeStore();
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    store.dispatch(setNoteField({ id: ID, field: "content", value: "unsaved work" }));
    for (let i = 0; i < NOTE_SAVE_FAILURE_BLOCK_THRESHOLD; i += 1) {
      store.dispatch(markNoteSaveError({ id: ID, error: "Save blocked." }));
    }

    const { container, unmount } = await mount(store);

    expect(store.getState().notes.notes[ID]._consecutiveSaveFailures).toBe(
      NOTE_SAVE_FAILURE_BLOCK_THRESHOLD,
    );
    expect(container.querySelector('[data-surface-value="note_save_blocked"]')).not.toBeNull();
    expect(container.textContent).toContain("Your changes are NOT being saved");
    expect(container.querySelector('[data-testid="draft-recovery-banner"]')).not.toBeNull();

    await unmount();
  });
});
