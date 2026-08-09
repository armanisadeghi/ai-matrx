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
  it("collects dirty notes, attributed to the account that wrote them", () => {
    const state = seedDirty();
    const drafts = collectNoteDrafts({
      notes: state,
      userAuth: { id: "someone-else" },
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      namespace: "note",
      entityId: NOTE_ID,
      // The RECORD's owner, not the account currently holding the cookie —
      // this is exactly the identity-drift case from D132.
      ownerId: "user-1",
      content: "saved text + unsaved edit",
    });
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
