// Audit N-23 — every keystroke used to re-sort the whole collection.
//
// `updateNoteContent` rewrites one record every 200–1000 ms while the user
// types. `selectAllNotesList`, `selectAllFolders` and `selectFolderReferences`
// all recomputed from the notes map, so each sync cost a filter + sort of
// every note plus a folder-Set and folder-Map rebuild — three times — and
// handed every consumer brand-new array references to re-render from.
//
// The ORDER and the FOLDERS are now keyed off a per-note structural signature
// that a body edit does not touch: same arrays, same references, no sort.
// `selectAllNotesList` still returns FRESH records (find, empty-note reuse and
// the markdown export all read `.content` off those rows) — what it no longer
// does is sort.

import { enableMapSet } from "immer";
import notesReducer from "./slice";
import { upsertNotesFromServer, updateNoteContent, updateNoteLabel } from "./slice";
import {
  selectAllFolders,
  selectAllNotesList,
  selectFolderReferences,
  selectNotesListProjection,
} from "./selectors";


enableMapSet();

type Action = Parameters<typeof notesReducer>[1];
type SliceState = ReturnType<typeof notesReducer>;

function seed(count: number): SliceState {
  const upserts = Array.from({ length: count }, (_, i) => ({
    note: {
      id: `note-${i}`,
      created_by: "user-1",
      label: `Note ${i}`,
      content: `body ${i}`,
      folder_name: i % 3 === 0 ? "Draft" : `Folder ${i % 3}`,
      folder_id: `folder-${i % 3}`,
      organization_id: "org-1",
      tags: [],
      updated_at: `2026-09-1${i % 5}T00:00:00Z`,
      position: i,
      visibility: "personal" as const,
      version: 1,
    },
    fetchStatus: "list" as const,
  }));
  return notesReducer(
    undefined,
    upsertNotesFromServer({ upserts }) as Action,
  ) as SliceState;
}

const asRoot = (notes: SliceState) => ({ notes }) as never;

describe("notes list projection", () => {
  it("returns the SAME arrays across 50 content updates", () => {
    let state = seed(40);
    const firstList = selectAllNotesList(asRoot(state));
    const firstFolders = selectAllFolders(asRoot(state));
    const firstRefs = selectFolderReferences(asRoot(state));
    const firstProjection = selectNotesListProjection(asRoot(state));
    const firstOrder = firstList.map((n) => n.id);

    for (let i = 0; i < 50; i++) {
      state = notesReducer(
        state,
        updateNoteContent({ id: `note-${i % 40}`, content: `typed ${i}` }) as Action,
      ) as SliceState;

      // The ordering + folder projection never rebuilds.
      expect(selectNotesListProjection(asRoot(state))).toBe(firstProjection);
      expect(selectAllFolders(asRoot(state))).toBe(firstFolders);
      expect(selectFolderReferences(asRoot(state))).toBe(firstRefs);
    }

    const after = selectAllNotesList(asRoot(state));
    // Order is untouched…
    expect(after.map((n) => n.id)).toEqual(firstOrder);
    // …and the rows carry the text the user just typed, not the pre-edit copy
    // the sidebar's empty-note reuse, global find and the export would read.
    expect(after.find((n) => n.id === "note-9")?.content).toBe("typed 49");
    expect(firstList).not.toBe(after);
  });

  it("rebuilds the projection when a label changes", () => {
    let state = seed(10);
    const before = selectNotesListProjection(asRoot(state));
    const beforeFolders = selectAllFolders(asRoot(state));

    state = notesReducer(
      state,
      updateNoteLabel({ id: "note-3", label: "Renamed" }) as Action,
    ) as SliceState;

    expect(selectNotesListProjection(asRoot(state))).not.toBe(before);
    // The folder set genuinely did not change, but it is rebuilt with the
    // projection — the guarantee is "content edits are free", not deep equality.
    expect(selectAllFolders(asRoot(state))).toEqual(beforeFolders);
  });

  it("rebuilds the projection when a note moves folder", () => {
    let state = seed(10);
    const before = selectNotesListProjection(asRoot(state));

    state = notesReducer(
      state,
      upsertNotesFromServer({
        upserts: [{
          note: {
            id: "note-2",
            created_by: "user-1",
            label: "Note 2",
            folder_name: "Somewhere New",
            folder_id: "folder-new",
            organization_id: "org-1",
            updated_at: "2026-09-14T09:00:00Z",
            position: 2,
            version: 1,
          },
          fetchStatus: "list" as const,
        }],
      }) as Action,
    ) as SliceState;

    expect(selectNotesListProjection(asRoot(state))).not.toBe(before);
    expect(selectAllFolders(asRoot(state))).toContain("Somewhere New");
    expect(
      selectFolderReferences(asRoot(state)).some((f) => f.id === "folder-new"),
    ).toBe(true);
  });
});
