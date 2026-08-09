// Guard for the recurring /notes false-conflict bug.
//
// THE RULE: a conflict means SOMEONE ELSE changed the server copy. A payload
// carrying values this client itself wrote is our own work echoing back and
// must never be reported to the user as a conflict — even when the user has
// typed past it in the meantime (our write's realtime echo lands 50–500ms
// after the REST response, so "differs from the live buffer" is always true
// during active typing and is the wrong question to ask).

import { enableMapSet } from "immer";
import notesReducer, {
  upsertNoteFromServer,
  updateNoteContent,
  recordNoteWriteAttempt,
} from "./slice";
import { serverMatchesAttempt } from "../utils/saveVerification";

// The notes slice stores `_dirtyFields` as a Set — the app enables this plugin
// at store setup; the reducer under test needs it here too.
enableMapSet();

const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";

function seed(content: string, updatedAt: string) {
  return notesReducer(
    undefined,
    upsertNoteFromServer({
      note: {
        id: NOTE_ID,
        label: "Chip",
        content,
        organization_id: ORG_ID,
        updated_at: updatedAt,
      },
      fetchStatus: "full",
    }),
  );
}

describe("notes conflict detection", () => {
  it("does NOT flag a conflict when the server echoes content we wrote", () => {
    // 1. Note exists on the server with "Chip".
    let state = seed("Chip", "2026-08-08T10:00:00.000Z");
    // 2. User edits to "# Chip" — record is now dirty.
    state = notesReducer(
      state,
      updateNoteContent({ id: NOTE_ID, content: "# Chip" }),
    );
    // 3. An autosave of "Chip" was issued a moment ago.
    state = notesReducer(
      state,
      recordNoteWriteAttempt({ id: NOTE_ID, values: { content: "Chip" } }),
    );
    // 4. That save's own realtime echo lands, carrying "Chip" — older than the
    //    live buffer but authored by us.
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: {
          id: NOTE_ID,
          content: "Chip",
          organization_id: ORG_ID,
          updated_at: "2026-08-08T10:00:01.000Z",
        },
        fetchStatus: "full",
      }),
    );

    expect(state.notes[NOTE_ID]._error).toBeNull();
    expect(state.notes[NOTE_ID].content).toBe("# Chip");
  });

  it("DOES flag a conflict when a collaborator's content arrives", () => {
    let state = seed("Chip", "2026-08-08T10:00:00.000Z");
    state = notesReducer(
      state,
      updateNoteContent({ id: NOTE_ID, content: "# Chip" }),
    );
    state = notesReducer(
      state,
      recordNoteWriteAttempt({ id: NOTE_ID, values: { content: "Chip" } }),
    );
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: {
          id: NOTE_ID,
          content: "Something a colleague typed",
          organization_id: ORG_ID,
          updated_at: "2026-08-08T10:00:02.000Z",
        },
        fetchStatus: "full",
      }),
    );

    expect(state.notes[NOTE_ID]._error).toBe("conflict");
    expect(state.notes[NOTE_ID].content).toBe("# Chip");
  });
});

describe("serverMatchesAttempt", () => {
  it("recognizes a write that already landed", () => {
    expect(
      serverMatchesAttempt({ content: "Chip", label: "Chip" }, { content: "Chip" }),
    ).toBe(true);
  });

  it("rejects a server row that differs", () => {
    expect(serverMatchesAttempt({ content: "Other" }, { content: "Chip" })).toBe(
      false,
    );
  });

  it("refuses to vouch for unverifiable fields", () => {
    // `tags` is not probed — we cannot prove it persisted, so the caller must
    // stay on the conflict path rather than clear a dirty field.
    expect(
      serverMatchesAttempt({ content: "Chip" }, { content: "Chip", tags: ["a"] }),
    ).toBe(false);
    expect(serverMatchesAttempt({ content: "Chip" }, {})).toBe(false);
  });
});
