// The Write-mode typing freeze (2026-10-10).
//
// Typing in a new note in Write mode locked the browser. The trace: every
// pause of 200ms committed the note to the record AND wrote it to the
// database, and each commit replaced the notes map several times (content,
// pending, saved, settled, label). Each replacement re-rendered EVERY sidebar
// row — a context menu, an item menu and a dozen Radix providers per row —
// because the row list was not memoised (NoteSidebar is a React Compiler skip)
// and the projection handed every row a fresh-but-equal `folderReferences`
// array whenever `updated_at` moved. Measured on /notes with the folders
// expanded: 206 row renders per keystroke before, ~1 after.
//
// These three guards fail on the pre-fix code:
//   1. a SAVE (updated_at / label moving) keeps the folder arrays identical;
//   2. a changed note re-renders only its own row, never its siblings;
//   3. the commit debounce outlasts an ordinary pause between keystrokes.

const itemRowRenders = new Map<string, number>();

jest.mock("@ai-matrx/design-system/item", () => ({
  ItemRow: ({ entity }: { entity: { id: string } }) => {
    itemRowRenders.set(entity.id, (itemRowRenders.get(entity.id) ?? 0) + 1);
    return null;
  },
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/commerce-review/components/OrganizationTag", () => ({
  OrganizationTag: () => null,
}));
jest.mock("@/components/ui/checkbox", () => ({ Checkbox: () => null }));

import { enableMapSet } from "immer";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import notesReducer, { updateNoteLabel, upsertNotesFromServer } from "../redux/slice";
import { selectAllFolders, selectAllNotesList, selectFolderReferences } from "../redux/selectors";
import { getReduxSyncDelay, type NoteRecord } from "../redux/notes.types";
import { NoteSidebarRow } from "../components/NoteSidebarRow";
import { createCoalescedCommit } from "@/lib/working-copy/coalescedCommit";
import { NOTE_SAVE_MAX_WAIT_MS } from "../redux/notes.types";

enableMapSet();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Action = Parameters<typeof notesReducer>[1];
type SliceState = ReturnType<typeof notesReducer>;

const noteId = (i: number) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`;

function serverNote(i: number, updatedAt = `2026-09-1${i % 5}T00:00:00Z`) {
  return {
    id: noteId(i),
    created_by: "user-1",
    label: `Note ${i}`,
    content: `body ${i}`,
    folder_name: i % 3 === 0 ? "Draft" : `Folder ${i % 3}`,
    folder_id: `folder-${i % 3}`,
    organization_id: "org-1",
    tags: [],
    updated_at: updatedAt,
    position: i,
    published_to_web: false,
    version: 1,
  };
}

function seed(count: number): SliceState {
  const upserts = Array.from({ length: count }, (_, i) => ({ note: serverNote(i), fetchStatus: "list" as const }));
  return notesReducer(undefined, upsertNotesFromServer({ upserts }) as Action) as SliceState;
}

const asRoot = (notes: SliceState) => ({ notes }) as never;

describe("a save of one note never re-renders the rest of the sidebar", () => {
  it("keeps the folder arrays identical when a save moves updated_at and the label", () => {
    let state = seed(40);
    const folders = selectAllFolders(asRoot(state));
    const references = selectFolderReferences(asRoot(state));

    for (let i = 0; i < 10; i++) {
      // What a save cycle does to the record: the server's updated_at…
      state = notesReducer(
        state,
        upsertNotesFromServer({
          upserts: [{ note: { ...serverNote(7, `2026-10-10T00:00:${10 + i}Z`), content: `typed ${i}` }, fetchStatus: "full" as const }],
        }) as Action,
      ) as SliceState;
      // …and the auto-label of a new note following its first line.
      state = notesReducer(state, updateNoteLabel({ id: noteId(7), label: `typed ${i}` }) as Action) as SliceState;

      expect(selectAllFolders(asRoot(state))).toBe(folders);
      expect(selectFolderReferences(asRoot(state))).toBe(references);
    }
  });

  it("re-renders only the row whose note changed", async () => {
    let state = seed(20);
    const store = configureStore({ reducer: { notes: notesReducer } });
    const references = () => selectFolderReferences(asRoot(state));
    const noop = () => {};
    const formatTime = () => "1h";

    function List({ notes }: { notes: NoteRecord[] }) {
      return (
        <>
          {notes.map((note) => (
            <NoteSidebarRow
              key={note.id}
              note={note}
              instanceId="sidebar"
              isActive={false}
              isOpenTab={false}
              allFolders={references()}
              openKnowledge={noop}
              formatTime={formatTime}
              onSelectNote={noop}
              selectionMode={false}
              isSelected={false}
              onToggleSelect={noop}
              onCreateFolder={noop}
            />
          ))}
        </>
      );
    }

    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<Provider store={store}><List notes={selectAllNotesList(asRoot(state))} /></Provider>);
    });
    expect(itemRowRenders.size).toBe(20);
    const before = new Map(itemRowRenders);

    // Five save cycles of note-4: content, updated_at and label all move.
    for (let i = 0; i < 5; i++) {
      state = notesReducer(
        state,
        upsertNotesFromServer({
          upserts: [{ note: { ...serverNote(4, `2026-10-10T00:01:0${i}Z`), content: `typed ${i}` }, fetchStatus: "full" as const }],
        }) as Action,
      ) as SliceState;
      state = notesReducer(state, updateNoteLabel({ id: noteId(4), label: `typed ${i}` }) as Action) as SliceState;
      await act(async () => {
        root.render(<Provider store={store}><List notes={selectAllNotesList(asRoot(state))} /></Provider>);
      });
    }

    const reRendered = [...itemRowRenders].filter(([id, n]) => n !== before.get(id)).map(([id]) => id);
    expect(reRendered).toEqual([noteId(4)]);
    await act(async () => root.unmount());
  });

  it("waits out an ordinary pause between keystrokes before committing (and writing) the note", () => {
    // A person typing pauses 200–400ms between words; Write mode reports a
    // keystroke ~120ms after it lands. A commit sooner than that wrote the
    // note to the database every two or three characters.
    expect(getReduxSyncDelay(0)).toBeGreaterThanOrEqual(1000);
    expect(getReduxSyncDelay(5_000)).toBeGreaterThanOrEqual(1000);
  });

  it("still saves every few seconds while someone types without a pause", () => {
    jest.useFakeTimers();
    try {
      const runs: number[] = [];
      const commit = createCoalescedCommit({
        delay: () => getReduxSyncDelay(0),
        maxWait: NOTE_SAVE_MAX_WAIT_MS,
        read: () => null,
        run: () => void runs.push(Date.now()),
      });
      // 12 seconds of typing, a keystroke every 250ms, never a 1s pause.
      for (let t = 0; t < 12_000; t += 250) {
        commit.schedule();
        jest.advanceTimersByTime(250);
      }
      expect(runs.length).toBeGreaterThanOrEqual(2);
      expect(runs.length).toBeLessThanOrEqual(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
