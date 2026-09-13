import { enableMapSet } from "immer";
import notesReducer, {
  acceptRemoteNoteConflict,
  dismissNoteConflict,
  recordNoteConflict,
  refreshNoteConflictComparison,
  setNoteField,
  upsertNoteFromServer,
} from "./slice";
import type { Note } from "../types";

enableMapSet();

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function row(overrides: Partial<Note> = {}): Note {
  return {
    id: ID, label: "Original", content: "base", folder_name: "Draft", folder_id: null,
    tags: [], metadata: { source: "test" }, organization_id: ORG, project_id: null,
    task_id: null, deleted_at: null, visibility: "personal", version: 4, sync_version: 0,
    content_hash: null, file_path: null, last_device_id: null, position: 0,
    created_at: "2026-09-12T00:00:00.000Z", updated_at: "2026-09-12T00:00:00.000Z",
    created_by: "user-1", updated_by: "user-1", ...overrides,
  };
}

function conflicted() {
  let state = notesReducer(undefined, upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
  state = notesReducer(state, setNoteField({ id: ID, field: "content", value: "mine" }));
  return notesReducer(state, recordNoteConflict({
    id: ID,
    expectedVersion: 4,
    currentVersion: 5,
    currentRow: row({ content: "theirs", label: "Remote", version: 5, updated_at: "2026-09-12T00:01:00.000Z" }),
    sentSnapshot: { content: "mine" },
  }));
}

describe("Notes CAS conflict decision contract", () => {
  it("creates a decision only from a full CAS row and keeps dirty input separate", () => {
    const state = conflicted();
    const record = state.notes[ID];
    expect(record.content).toBe("mine");
    expect(record._conflictDecision).toMatchObject({ expectedVersion: 4, currentVersion: 5 });
    expect(record._conflictDecision?.currentRow.content).toBe("theirs");
  });

  it("marks partial newer realtime evidence stale and refresh keeps the local draft", () => {
    let state = conflicted();
    state = notesReducer(state, upsertNoteFromServer({
      note: { id: ID, organization_id: ORG, version: 6, updated_at: "2026-09-12T00:02:00.000Z" },
      fetchStatus: "list",
    }));
    expect(state.notes[ID]._conflictDecision?.stale).toBe(true);
    expect(state.notes[ID]._remoteObservation).toMatchObject({ version: 6, complete: false });

    // A refresh at version 6 replaces only the comparison package.
    state = notesReducer(state, refreshNoteConflictComparison({
      id: ID,
      currentRow: row({ content: "theirs v6", version: 6, updated_at: "2026-09-12T00:02:00.000Z" }),
    }));
    expect(state.notes[ID].content).toBe("mine");
    expect(state.notes[ID]._dirtyFields).toEqual(new Set(["content"]));
    expect(state.notes[ID]._conflictDecision).toMatchObject({ stale: false, currentVersion: 6 });

    // Evidence arriving after Refresh invalidates choices again.
    state = notesReducer(state, upsertNoteFromServer({
      note: { id: ID, organization_id: ORG, version: 7, updated_at: "2026-09-12T00:03:00.000Z" },
      fetchStatus: "list",
    }));
    expect(state.notes[ID]._conflictDecision?.stale).toBe(true);
  });

  it("accepting theirs clears reviewed physical fields but preserves association dirt and dismissal preserves the decision", () => {
    let state = conflicted();
    state = notesReducer(state, setNoteField({ id: ID, field: "project_id", value: "33333333-3333-4333-8333-333333333333" }));
    state = notesReducer(state, dismissNoteConflict({ id: ID }));
    expect(state.notes[ID]._conflictDecision?.dismissed).toBe(true);

    state = notesReducer(state, acceptRemoteNoteConflict({ id: ID }));
    expect(state.notes[ID]).toMatchObject({ content: "theirs", label: "Remote", version: 5, project_id: "33333333-3333-4333-8333-333333333333" });
    expect(state.notes[ID]._dirtyFields).toEqual(new Set(["project_id"]));
    expect(state.notes[ID]._conflictDecision).toBeNull();
  });
});
