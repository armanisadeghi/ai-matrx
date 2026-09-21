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
  recordNoteConflict,
  captureNoteConflictLiveBuffer,
  applyNoteConflictResolution,
  markNoteSaved,
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

  it("retains a collaborator observation without manufacturing a conflict decision", () => {
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

    expect(state.notes[NOTE_ID]._error).toBeNull();
    expect(state.notes[NOTE_ID].content).toBe("# Chip");
    expect(state.notes[NOTE_ID]._remoteObservation?.note.content).toBe(
      "Something a colleague typed",
    );
    expect(state.notes[NOTE_ID]._conflictDecision).toBeNull();
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

// ── THE PHANTOM CONFLICT (2026-09-13) ────────────────────────────────────────
// `version` moves on EVERY update of the row. The live case: matrx-local wrote
// `file_path` + `last_device_id` back onto a web-created note 0.9s after its
// INSERT. Nothing the user edits changed, but the browser never adopted
// version 2, so its next save CAS'd on 1 and opened a conflict dialog against a
// row whose text equalled its own base.
import { NOTE_ROW_KEYS } from "./notes.types";
import { noteEditBaseFromRecord, noteEditedFieldsEqual } from "../utils/saveVerification";
import type { Note } from "../types";

function fullRow(overrides: Partial<Note> = {}): Note {
  const row: Note = {
    custom_fields: {},
    id: NOTE_ID, organization_id: ORG_ID, version: 1, content: "the recipe",
    label: "The Best Chicken Alfredo", folder_name: "Draft", folder_id: null, tags: [],
    metadata: {}, visibility: "personal", position: 0, project_id: null, task_id: null,
    created_at: "2026-09-14T05:55:17.534Z", created_by: "user-1",
    updated_at: "2026-09-14T05:55:17.534Z", updated_by: "user-1", deleted_at: null,
    content_hash: null, file_path: null, last_device_id: null, sync_version: 1,
    ...overrides,
  };
  for (const key of NOTE_ROW_KEYS) if (!(key in row)) throw new Error(`fixture lacks ${key}`);
  return row;
}

describe("phantom version bump while editing", () => {
  it("fast-forwards the base to a newer version whose edited fields equal the base, keeping the draft", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow(), fetchStatus: "full" }));
    expect(state.notes[NOTE_ID]._acknowledgedPhysicalSnapshot?.version).toBe(1);
    // The user deletes a line — dirty on version 1.
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "the recipe, shorter" }));
    // The desktop sync stamps file_path: version 2, identical edited fields.
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: fullRow({ version: 2, file_path: "/Notes/Draft/alfredo.md", last_device_id: "921d9676-75d", updated_at: "2026-09-14T05:55:18.435Z" }),
        fetchStatus: "full",
      }),
    );
    const record = state.notes[NOTE_ID];
    expect(record.version).toBe(2);
    expect(record.updated_at).toBe("2026-09-14T05:55:18.435Z");
    expect(record.file_path).toBe("/Notes/Draft/alfredo.md");
    expect(record.content).toBe("the recipe, shorter");
    expect(record._dirty).toBe(true);
    expect(record._remoteObservation).toBeNull();
    expect(record._conflictDecision).toBeNull();
    expect(record._error).toBeNull();
    // The base itself advanced: the next edit compares against version 2.
    expect(record._acknowledgedPhysicalSnapshot?.version).toBe(2);
    expect(record._acknowledgedPhysicalSnapshot?.content).toBe("the recipe");
  });

  it("does NOT fast-forward when an edited field really changed on the server (a real collaborator write)", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow(), fetchStatus: "full" }));
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "the recipe, shorter" }));
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: fullRow({ version: 2, content: "a colleague rewrote it", updated_at: "2026-09-14T05:55:18.435Z" }),
        fetchStatus: "full",
      }),
    );
    const record = state.notes[NOTE_ID];
    expect(record.version).toBe(1);
    expect(record.content).toBe("the recipe, shorter");
    expect(record._remoteObservation?.version).toBe(2);
    expect(record._acknowledgedPhysicalSnapshot?.version).toBe(1);
  });

  it("does NOT fast-forward from a partial (list) payload — only a complete row can move the base", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow(), fetchStatus: "full" }));
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "the recipe, shorter" }));
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: { id: NOTE_ID, organization_id: ORG_ID, version: 2, label: "The Best Chicken Alfredo", updated_at: "2026-09-14T05:55:18.435Z" },
        fetchStatus: "list",
      }),
    );
    expect(state.notes[NOTE_ID].version).toBe(1);
    expect(state.notes[NOTE_ID]._remoteObservation?.version).toBe(2);
  });
});

describe("noteEditedFieldsEqual", () => {
  const base = { content: "c", label: "l", folder_id: null, folder_name: "Draft", tags: ["a"], visibility: "personal" as const };
  it("ignores bookkeeping columns", () => {
    expect(noteEditedFieldsEqual({ ...base, file_path: "/x.md", version: 9 } as never, base)).toBe(true);
  });
  it("compares tags by value", () => {
    expect(noteEditedFieldsEqual({ ...base, tags: ["a"] }, base)).toBe(true);
    expect(noteEditedFieldsEqual({ ...base, tags: ["b"] }, base)).toBe(false);
  });
  it("treats an absent edited field as a difference, never as a match", () => {
    const { folder_id: _omit, ...missing } = base;
    void _omit;
    expect(noteEditedFieldsEqual(missing, { ...base, folder_id: "f1" })).toBe(false);
  });
  it("catches every edited field", () => {
    for (const field of ["content", "label", "folder_id", "folder_name", "visibility"] as const) {
      expect(noteEditedFieldsEqual({ ...base, [field]: "changed" }, base)).toBe(false);
    }
  });
});

describe("adversarial review 2026-09-13 — holes closed", () => {
  it("choosing \"theirs\" makes the adopted server row the edit base, so the next bookkeeping bump fast-forwards", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow(), fetchStatus: "full" }));
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "mine" }));
    const remote = fullRow({ version: 2, content: "theirs", updated_at: "2026-09-14T05:56:00.000Z" });
    state = notesReducer(state, recordNoteConflict({ id: NOTE_ID, expectedVersion: 1, currentVersion: 2, currentRow: remote, sentSnapshot: { content: "mine" }, actorId: "user-1", organizationId: ORG_ID, decisionId: "d", reviewId: "r" }));
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: NOTE_ID, content: "mine" }));
    state = notesReducer(state, applyNoteConflictResolution({ id: NOTE_ID, decisionId: "d", reviewId: "r", requestId: "q", choice: "theirs", proposedContent: "theirs", reviewedLiveContent: "mine" }));
    expect(state.notes[NOTE_ID].content).toBe("theirs");
    expect(state.notes[NOTE_ID]._acknowledgedPhysicalSnapshot?.version).toBe(2);
    // The user types on, the desktop sync stamps file_path: version 3, nothing edited moved.
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "theirs, plus" }));
    state = notesReducer(state, upsertNoteFromServer({ note: fullRow({ version: 3, content: "theirs", file_path: "/x.md", updated_at: "2026-09-14T05:57:00.000Z" }), fetchStatus: "full" }));
    expect(state.notes[NOTE_ID].version).toBe(3);
    expect(state.notes[NOTE_ID].content).toBe("theirs, plus");
    expect(state.notes[NOTE_ID]._remoteObservation).toBeNull();
  });

  it("does not fast-forward from a payload DECLARED full that omits an edited field — completeness is proven from the keys", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow({ folder_id: null, folder_name: null }), fetchStatus: "full" }));
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "draft" }));
    const partial: Partial<Note> & { id: string } = { ...fullRow({ version: 2, folder_name: null, updated_at: "2026-09-14T05:57:00.000Z" }) };
    delete (partial as Record<string, unknown>).folder_id; // the server may hold a real folder move here
    state = notesReducer(state, upsertNoteFromServer({ note: partial, fetchStatus: "full" }));
    expect(state.notes[NOTE_ID].version).toBe(1);
    expect(state.notes[NOTE_ID]._remoteObservation?.version).toBe(2);
  });

  it("rebuilds the edit base from field history when a record never received a snapshot", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: { id: NOTE_ID, organization_id: ORG_ID, version: 1, label: "L", content: "the recipe", folder_name: "Draft", tags: [], updated_at: "2026-09-14T05:55:17.534Z" }, fetchStatus: "list" }));
    expect(state.notes[NOTE_ID]._acknowledgedPhysicalSnapshot).toBeNull();
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "the recipe, shorter" }));
    expect(noteEditBaseFromRecord(state.notes[NOTE_ID]).content).toBe("the recipe");
    state = notesReducer(state, upsertNoteFromServer({ note: fullRow({ version: 2, label: "L", folder_id: null, file_path: "/x.md", updated_at: "2026-09-14T05:55:18.435Z" }), fetchStatus: "full" }));
    expect(state.notes[NOTE_ID].version).toBe(2);
    expect(state.notes[NOTE_ID].content).toBe("the recipe, shorter");
    expect(state.notes[NOTE_ID]._acknowledgedPhysicalSnapshot?.version).toBe(2);
  });

  it("markNoteSaved retires remote evidence at or below the acknowledged version", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: fullRow(), fetchStatus: "full" }));
    state = notesReducer(state, updateNoteContent({ id: NOTE_ID, content: "mine" }));
    state = notesReducer(state, upsertNoteFromServer({ note: fullRow({ version: 2, content: "mine", updated_at: "2026-09-14T05:56:00.000Z" }), fetchStatus: "full" }));
    expect(state.notes[NOTE_ID]._remoteObservation?.version).toBe(2);
    state = notesReducer(state, markNoteSaved({ id: NOTE_ID, version: 2, savedSnapshot: { content: "mine" }, acknowledgedPhysicalSnapshot: fullRow({ version: 2, content: "mine" }) }));
    expect(state.notes[NOTE_ID]._remoteObservation).toBeNull();
  });
});
