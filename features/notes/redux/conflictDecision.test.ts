import { enableMapSet } from "immer";
import notesReducer, {
  applyNoteConflictResolution,
  captureNoteConflictLiveBuffer,
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
    actorId: "user-1", organizationId: ORG, decisionId: "decision-1", reviewId: "review-1",
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
      decisionId: "decision-1", reviewId: "review-1", nextReviewId: "review-2", requestId: "refresh-1", liveContent: "mine",
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

    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const decision = state.notes[ID]._conflictDecision;
    if (!decision) throw new Error("Expected conflict decision");
    state = notesReducer(state, applyNoteConflictResolution({
      id: ID,
      decisionId: decision.decisionId, reviewId: decision.reviewId, requestId: "accept-theirs",
      choice: "theirs",
      proposedContent: "theirs",
      reviewedLiveContent: "mine",
    }));
    expect(state.notes[ID]).toMatchObject({ content: "theirs", label: "Remote", version: 5, project_id: "33333333-3333-4333-8333-333333333333" });
    expect(state.notes[ID]._dirtyFields).toEqual(new Set(["project_id"]));
    expect(state.notes[ID]._conflictDecision).toBeNull();
  });

  it("refuses a reviewed choice after the buffered snapshot changes and ignores lower versions with newer timestamps", () => {
    let state = conflicted();
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const decision = state.notes[ID]._conflictDecision;
    if (!decision) throw new Error("Expected conflict decision");
    state = notesReducer(state, setNoteField({ id: ID, field: "label", value: "edited after review" }));
    state = notesReducer(state, applyNoteConflictResolution({
      id: ID, decisionId: decision.decisionId, reviewId: decision.reviewId, requestId: "refuse-physical", choice: "theirs", proposedContent: "theirs",
      reviewedLiveContent: "mine",
    }));
    expect(state.notes[ID]).toMatchObject({ content: "mine", label: "edited after review", version: 4 });
    expect(state.notes[ID]._conflictDecision).not.toBeNull();
    expect(state.conflictResolutionReceipts["refuse-physical"]).toMatchObject({ status: "refused" });

    let clean = notesReducer(undefined, upsertNoteFromServer({ note: row({ version: 9, content: "v9", updated_at: "2026-09-12T00:09:00.000Z" }), fetchStatus: "full" }));
    clean = notesReducer(clean, upsertNoteFromServer({ note: row({ version: 8, content: "stale", updated_at: "2026-09-12T01:00:00.000Z" }), fetchStatus: "full" }));
    expect(clean.notes[ID]).toMatchObject({ version: 9, content: "v9" });
  });

  it("refuses an N+1 refresh when N+2 evidence arrives at the reducer boundary without changing the reviewed buffer", () => {
    let state = conflicted();
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const before = state.notes[ID]._conflictDecision;
    if (!before) throw new Error("Expected a decision");
    state = notesReducer(state, upsertNoteFromServer({ note: { id: ID, organization_id: ORG, version: 7, updated_at: "2026-09-12T00:03:00.000Z" }, fetchStatus: "list" }));
    state = notesReducer(state, refreshNoteConflictComparison({
      id: ID, decisionId: before.decisionId, reviewId: before.reviewId, nextReviewId: "review-after-n2", requestId: "refresh-refused", liveContent: "changed during refresh",
      currentRow: row({ content: "n+1", version: 6, updated_at: "2026-09-12T00:02:00.000Z" }),
    }));
    expect(state.conflictResolutionReceipts["refresh-refused"]).toMatchObject({ status: "refused" });
    expect(state.notes[ID]._conflictDecision).toMatchObject({ reviewId: before.reviewId, currentVersion: 5, reviewedLiveContent: "mine" });
    expect(state.notes[ID].content).toBe("mine");
  });

  it("refuses malformed or moved Refresh rows before rotating the review receipt", () => {
    const malformedVersions: unknown[] = [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "6", -1, 1.5, Number.MAX_SAFE_INTEGER + 1];
    for (const version of malformedVersions) {
      let state = conflicted();
      state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
      const before = state.notes[ID]._conflictDecision;
      if (!before) throw new Error("Expected a decision");
      const malformed = row({ content: "untrusted", version: 6 });
      Reflect.set(malformed, "version", version);
      state = notesReducer(state, refreshNoteConflictComparison({
        id: ID, decisionId: before.decisionId, reviewId: before.reviewId, nextReviewId: `bad-${String(version)}`, requestId: `bad-${String(version)}`, liveContent: "changed during refresh", currentRow: malformed,
      }));
      expect(state.conflictResolutionReceipts[`bad-${String(version)}`]).toMatchObject({ status: "refused" });
      expect(state.notes[ID]).toMatchObject({ content: "mine", version: 4 });
      expect(state.notes[ID]._conflictDecision).toMatchObject({ reviewId: before.reviewId, currentVersion: 5, reviewedLiveContent: "mine" });
    }

    let moved = conflicted();
    moved = notesReducer(moved, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const beforeMoved = moved.notes[ID]._conflictDecision;
    if (!beforeMoved) throw new Error("Expected a decision");
    const wrongRow = row({ content: "untrusted", version: 6 });
    Reflect.set(wrongRow, "id", "33333333-3333-4333-8333-333333333333");
    moved = notesReducer(moved, refreshNoteConflictComparison({
      id: ID, decisionId: beforeMoved.decisionId, reviewId: beforeMoved.reviewId, nextReviewId: "moved", requestId: "moved", liveContent: "mine", currentRow: wrongRow,
    }));
    expect(moved.conflictResolutionReceipts.moved).toMatchObject({ status: "refused" });
    expect(moved.notes[ID]._conflictDecision).toMatchObject({ reviewId: beforeMoved.reviewId, currentVersion: 5, reviewedLiveContent: "mine" });
  });

  it("accepts zero and positive integer Refresh revisions", () => {
    for (const version of [0, 6]) {
      let state = conflicted();
      state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
      const before = state.notes[ID]._conflictDecision;
      if (!before) throw new Error("Expected a decision");
      state = notesReducer(state, refreshNoteConflictComparison({
        id: ID, decisionId: before.decisionId, reviewId: before.reviewId, nextReviewId: `valid-${version}`, requestId: `valid-${version}`, liveContent: "mine", currentRow: row({ content: `revision-${version}`, version }),
      }));
      expect(state.conflictResolutionReceipts[`valid-${version}`]).toMatchObject({ status: "applied" });
      expect(state.notes[ID]._conflictDecision).toMatchObject({ reviewId: `valid-${version}`, currentVersion: version, reviewedLiveContent: "mine" });
    }
  });

  it("does not retain malformed realtime revisions as remote observations", () => {
    let state = conflicted();
    const malformed = row({ content: "untrusted", version: 6 });
    Reflect.set(malformed, "version", Number.NaN);
    state = notesReducer(state, upsertNoteFromServer({ note: malformed, fetchStatus: "list" }));
    expect(state.notes[ID]).toMatchObject({ content: "mine", version: 4, _remoteObservation: null });
  });

  it("refuses only a replaced review identity", () => {
    let state = conflicted(); state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const d = state.notes[ID]._conflictDecision!;
    state = notesReducer(state, applyNoteConflictResolution({ id: ID, decisionId: d.decisionId, reviewId: "wrong-review", requestId: "identity", choice: "mine", proposedContent: "mine", reviewedLiveContent: "mine" }));
    expect(state.conflictResolutionReceipts.identity?.status).toBe("refused"); expect(state.notes[ID]._conflictDecision).not.toBeNull();
  });

  it("refuses only a changed reviewed remote package", () => {
    let state = conflicted(); state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    state = structuredClone(state); state.notes[ID]._conflictDecision!.reviewedRemote = row({ content: "changed", version: 5 }); const d = state.notes[ID]._conflictDecision!;
    state = notesReducer(state, applyNoteConflictResolution({ id: ID, decisionId: d.decisionId, reviewId: d.reviewId, requestId: "remote", choice: "mine", proposedContent: "mine", reviewedLiveContent: "mine" }));
    expect(state.conflictResolutionReceipts.remote?.status).toBe("refused"); expect(state.notes[ID]._conflictDecision).not.toBeNull();
  });

  it("refuses only a stale decision", () => {
    let state = conflicted(); state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    state = notesReducer(state, upsertNoteFromServer({ note: { id: ID, organization_id: ORG, version: 6, updated_at: "2026-09-12T00:02:00.000Z" }, fetchStatus: "list" })); const d = state.notes[ID]._conflictDecision!;
    state = notesReducer(state, applyNoteConflictResolution({ id: ID, decisionId: d.decisionId, reviewId: d.reviewId, requestId: "stale", choice: "mine", proposedContent: "mine", reviewedLiveContent: "mine" }));
    expect(state.conflictResolutionReceipts.stale?.status).toBe("refused"); expect(state.notes[ID]._conflictDecision).not.toBeNull();
  });
});
