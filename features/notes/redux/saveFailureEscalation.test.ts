// Guard for D132's remainder (b): a streak of failing saves MUST become loud.
//
// THE RULE: a save failure that repeats is not a notification, it is a defect
// with the user's only copy of their work sitting in a browser buffer. The
// streak counter is what turns the ignorable toast into the blocking editor
// banner, so it has to count every real failure, reset the instant a save
// lands, and never be inflated by a "conflict" (which has its own UI and its
// own decision to make).

import { enableMapSet } from "immer";
import notesReducer, {
  upsertNoteFromServer,
  updateNoteContent,
  markNoteSaveError,
  markNoteSaved,
} from "./slice";
import { NOTE_SAVE_FAILURE_BLOCK_THRESHOLD } from "./notes.types";
import { collectNoteDrafts } from "../utils/notesDrafts";
import { setNoteLiveContent } from "../utils/noteLiveContent";

enableMapSet();

const NOTE_ID = "55555555-5555-4555-8555-555555555555";
const ORG_ID = "66666666-6666-4666-8666-666666666666";
const RLS_MESSAGE =
  "This note is read-only for you — your changes are NOT being saved.";

function seedDirty() {
  let state = notesReducer(
    undefined,
    upsertNoteFromServer({
      note: {
        id: NOTE_ID,
        label: "Quarterly plan",
        content: "saved text",
        organization_id: ORG_ID,
        created_by: "user-1",
        updated_at: "2026-08-08T10:00:00.000Z",
      },
      fetchStatus: "full",
    }),
  );
  state = notesReducer(
    state,
    updateNoteContent({ id: NOTE_ID, content: "saved text + unsaved edit" }),
  );
  return state;
}

describe("notes save-failure escalation", () => {
  it("counts consecutive failures and crosses the blocking threshold", () => {
    let state = seedDirty();
    expect(state.notes[NOTE_ID]._consecutiveSaveFailures).toBe(0);

    for (let i = 1; i <= NOTE_SAVE_FAILURE_BLOCK_THRESHOLD; i += 1) {
      state = notesReducer(
        state,
        markNoteSaveError({ id: NOTE_ID, error: RLS_MESSAGE }),
      );
      expect(state.notes[NOTE_ID]._consecutiveSaveFailures).toBe(i);
    }

    expect(
      state.notes[NOTE_ID]._consecutiveSaveFailures >=
        NOTE_SAVE_FAILURE_BLOCK_THRESHOLD,
    ).toBe(true);
    expect(state.notes[NOTE_ID]._firstSaveFailureAt).not.toBeNull();
  });

  it("resets the streak the moment a save lands", () => {
    let state = seedDirty();
    state = notesReducer(
      state,
      markNoteSaveError({ id: NOTE_ID, error: RLS_MESSAGE }),
    );
    state = notesReducer(
      state,
      markNoteSaveError({ id: NOTE_ID, error: RLS_MESSAGE }),
    );
    state = notesReducer(
      state,
      markNoteSaved({
        id: NOTE_ID,
        updatedAt: "2026-08-08T10:05:00.000Z",
        savedSnapshot: { content: "saved text + unsaved edit" },
      }),
    );

    expect(state.notes[NOTE_ID]._consecutiveSaveFailures).toBe(0);
    expect(state.notes[NOTE_ID]._firstSaveFailureAt).toBeNull();
  });

  it("does NOT count a conflict toward the blocking banner", () => {
    let state = seedDirty();
    state = notesReducer(
      state,
      markNoteSaveError({ id: NOTE_ID, error: "conflict" }),
    );
    expect(state.notes[NOTE_ID]._consecutiveSaveFailures).toBe(0);
    expect(state.notes[NOTE_ID]._firstSaveFailureAt).toBeNull();
  });
});

describe("notes draft collection", () => {
  it("collects dirty notes, attributed to the account that TYPED them", () => {
    const state = seedDirty();
    const drafts = collectNoteDrafts({
      notes: state,
      // The booted session identity — Redux hydrates it once and never
      // refetches, so it still names the typist after a cookie rotation. Using
      // the record's `created_by` instead would hand a shared note's rescue to
      // its owner rather than to the sharee who wrote it.
      userAuth: { id: "editor-sharee" },
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      namespace: "note",
      entityId: NOTE_ID,
      ownerId: "editor-sharee",
      content: "saved text + unsaved edit",
    });
  });

  it("captures the PRE-DEBOUNCE editor buffer, not the stale Redux copy", () => {
    const state = seedDirty();
    // Keystrokes reach Redux 200–1000ms late; at the instant a tab is stopped
    // the newest words live only in noteLiveContent.
    setNoteLiveContent(NOTE_ID, "saved text + unsaved edit + just typed");
    try {
      const drafts = collectNoteDrafts({
        notes: state,
        userAuth: { id: "user-1" },
      });
      expect(drafts[0].content).toBe("saved text + unsaved edit + just typed");
    } finally {
      setNoteLiveContent(NOTE_ID, null);
    }
  });

  it("captures a note whose first keystrokes have not reached Redux yet", () => {
    // Not dirty at all — the debounce has not fired once — but the user has
    // typed. Reading Redux alone would rescue nothing.
    let state = notesReducer(
      undefined,
      upsertNoteFromServer({
        note: {
          id: NOTE_ID,
          label: "New Note",
          content: "",
          organization_id: ORG_ID,
          created_by: "user-1",
          updated_at: "2026-08-08T10:00:00.000Z",
        },
        fetchStatus: "full",
      }),
    );
    setNoteLiveContent(NOTE_ID, "the very first sentence");
    try {
      const drafts = collectNoteDrafts({
        notes: state,
        userAuth: { id: "user-1" },
      });
      expect(drafts).toHaveLength(1);
      expect(drafts[0].content).toBe("the very first sentence");
    } finally {
      setNoteLiveContent(NOTE_ID, null);
    }
    expect(state.notes[NOTE_ID]._dirty).toBe(false);
  });

  it("collects nothing when no note is dirty", () => {
    let state = seedDirty();
    state = notesReducer(
      state,
      markNoteSaved({
        id: NOTE_ID,
        savedSnapshot: { content: "saved text + unsaved edit" },
      }),
    );
    expect(
      collectNoteDrafts({ notes: state, userAuth: { id: "user-1" } }),
    ).toHaveLength(0);
  });
});
