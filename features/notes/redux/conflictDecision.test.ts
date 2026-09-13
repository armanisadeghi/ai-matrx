import { enableMapSet } from "immer";
import notesReducer, {
  applyNoteConflictResolution,
  captureNoteConflictLiveBuffer,
  dismissNoteConflict,
  recordNoteConflict,
  refreshNoteConflictComparison,
  beginRetainedNoteConflictCommand,
  settleRetainedNoteConflictCommand,
  transitionRetainedNoteConflictReview,
  setRetainedNoteConflictProposal,
  setNoteField,
  setNoteEditorMode,
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
  it("seeds legacy editor mode once and keeps physical metadata exact", () => {
    const legacyMetadata = { source: "legacy", lastEditorMode: "split" };
    let state = notesReducer(
      undefined,
      upsertNoteFromServer({
        note: row({ metadata: legacyMetadata }),
        fetchStatus: "full",
      }),
    );
    expect(state.notes[ID]._editorMode).toBe("split");
    expect(state.notes[ID].metadata).toEqual(legacyMetadata);
    expect(state.notes[ID]._acknowledgedPhysicalSnapshot?.metadata).toEqual(legacyMetadata);

    state = notesReducer(state, setNoteEditorMode({ id: ID, mode: "plain" }));
    expect(state.notes[ID]._editorMode).toBe("plain");
    expect(state.notes[ID].metadata).toEqual(legacyMetadata);
    expect(state.notes[ID]._acknowledgedPhysicalSnapshot?.metadata).toEqual(legacyMetadata);

    const serverMetadata = { source: "canonical" };
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: row({ metadata: serverMetadata, version: 5 }),
        fetchStatus: "full",
      }),
    );
    expect(state.notes[ID]._editorMode).toBe("plain");
    expect(state.notes[ID].metadata).toEqual(serverMetadata);
    expect(state.notes[ID]._acknowledgedPhysicalSnapshot?.metadata).toEqual(serverMetadata);
  });

  it("does not let a display fallback outrank a later persisted mode", () => {
    let state = notesReducer(
      undefined,
      upsertNoteFromServer({
        note: { id: ID, organization_id: ORG, version: 4, updated_at: "2026-09-12T00:00:00.000Z" },
        fetchStatus: "list",
      }),
    );
    expect(state.notes[ID]).toMatchObject({
      _editorMode: null,
      _editorModeSource: "uninitialized",
    });

    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: row({ metadata: { lastEditorMode: "markdown" } }),
        fetchStatus: "full",
      }),
    );
    expect(state.notes[ID]).toMatchObject({
      _editorMode: "markdown-split",
      _editorModeSource: "persisted",
    });
  });

  it("keeps a local mode choice when the first full row arrives", () => {
    let state = notesReducer(
      undefined,
      upsertNoteFromServer({
        note: { id: ID, organization_id: ORG, version: 4, updated_at: "2026-09-12T00:00:00.000Z" },
        fetchStatus: "list",
      }),
    );
    state = notesReducer(state, setNoteEditorMode({ id: ID, mode: "plain" }));
    state = notesReducer(
      state,
      upsertNoteFromServer({
        note: row({ metadata: { lastEditorMode: "matrx-split" } }),
        fetchStatus: "full",
      }),
    );
    expect(state.notes[ID]).toMatchObject({
      _editorMode: "plain",
      _editorModeSource: "local",
    });
  });

  it("records an absent legacy preference as a fully loaded null", () => {
    const state = notesReducer(
      undefined,
      upsertNoteFromServer({ note: row({ metadata: { source: "canonical" } }), fetchStatus: "full" }),
    );
    expect(state.notes[ID]).toMatchObject({
      _editorMode: null,
      _editorModeSource: "persisted",
    });
  });

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

  it("accepts zero only from an initial zero review and accepts later positive revisions", () => {
    let zero = notesReducer(undefined, upsertNoteFromServer({ note: row({ version: 0 }), fetchStatus: "full" }));
    zero = notesReducer(zero, setNoteField({ id: ID, field: "content", value: "mine" }));
    zero = notesReducer(zero, recordNoteConflict({
      id: ID, expectedVersion: 0, currentVersion: 0, currentRow: row({ content: "remote zero", version: 0 }), sentSnapshot: { content: "mine" }, actorId: "user-1", organizationId: ORG, decisionId: "zero", reviewId: "zero-review",
    }));
    zero = notesReducer(zero, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    zero = notesReducer(zero, refreshNoteConflictComparison({
      id: ID, decisionId: "zero", reviewId: "zero-review", nextReviewId: "zero-next", requestId: "zero-next", liveContent: "mine", currentRow: row({ content: "revision-zero", version: 0 }),
    }));
    expect(zero.conflictResolutionReceipts["zero-next"]).toMatchObject({ status: "applied" });

    let positive = conflicted();
    positive = notesReducer(positive, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const before = positive.notes[ID]._conflictDecision;
    if (!before) throw new Error("Expected a decision");
    positive = notesReducer(positive, refreshNoteConflictComparison({
      id: ID, decisionId: before.decisionId, reviewId: before.reviewId, nextReviewId: "valid-six", requestId: "valid-six", liveContent: "mine", currentRow: row({ content: "revision-six", version: 6 }),
    }));
    expect(positive.conflictResolutionReceipts["valid-six"]).toMatchObject({ status: "applied" });
    expect(positive.notes[ID]._conflictDecision).toMatchObject({ reviewId: "valid-six", currentVersion: 6, reviewedLiveContent: "mine" });
  });

  it("refuses lower canonical Refresh rows and mismatched CAS row revisions", () => {
    let state = conflicted();
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const before = state.notes[ID]._conflictDecision;
    if (!before) throw new Error("Expected a decision");
    state = notesReducer(state, refreshNoteConflictComparison({
      id: ID, decisionId: before.decisionId, reviewId: before.reviewId, nextReviewId: "lower", requestId: "lower", liveContent: "mine", currentRow: row({ content: "old", version: 0 }),
    }));
    expect(state.conflictResolutionReceipts.lower).toMatchObject({ status: "refused" });
    expect(state.notes[ID]._conflictDecision).toMatchObject({ reviewId: before.reviewId, currentVersion: 5, reviewedLiveContent: "mine" });

    let mismatch = notesReducer(undefined, upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    mismatch = notesReducer(mismatch, recordNoteConflict({
      id: ID, expectedVersion: 4, currentVersion: 5, currentRow: row({ version: 6 }), sentSnapshot: {}, actorId: "user-1", organizationId: ORG, decisionId: "mismatch", reviewId: "mismatch-review",
    }));
    expect(mismatch.notes[ID]._conflictDecision).toBeNull();
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

describe("retained controlled conflict review", () => {
  it("retains an actor-bound shared review session across dismissal and rejects actor replacement", () => {
    let state = notesReducer(conflicted(), captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const key = state.currentConflictReviewKeys[ID];
    expect(key).toBeDefined();
    const review = state.retainedConflictReviews[key!];
    expect(review).toMatchObject({ actorId: "user-1", noteId: ID, proposal: "mine", readOnly: false });
    expect(review.session.original).toBe("theirs");
    expect(review.session.modified).toBe("mine");

    state = notesReducer(state, dismissNoteConflict({ id: ID }));
    expect(state.retainedConflictReviews[key!].dismissed).toBe(true);
    state = notesReducer(state, { type: "userAuth/setUserAuth", payload: { id: "another-actor" } });
    expect(state.retainedConflictReviews).toEqual({});
    expect(state.currentConflictReviewKeys).toEqual({});
  });

  it("reduces rapid independent hunk choices and retains a decided session when proposal typing starts", () => {
    let state = notesReducer(conflicted(), captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const key = state.currentConflictReviewKeys[ID]!;
    const session = state.retainedConflictReviews[key].session;
    expect(session.hunkIds.length).toBeGreaterThan(0);
    const first = { type: "set-hunk" as const, sessionId: session.sessionId, sourceIdentity: session.sourceIdentity, sessionRevision: session.revision, hunkIndex: 0, hunkId: session.hunkIds[0], decision: "applied" as const };
    state = notesReducer(state, transitionRetainedNoteConflictReview({ reviewKey: key, actorId: "user-1", transition: first }));
    const afterFirst = state.retainedConflictReviews[key].session;
    expect(afterFirst.decisions[0]).toBe("applied");
    state = notesReducer(state, setRetainedNoteConflictProposal({ reviewKey: key, actorId: "user-1", proposal: "edited proposal" }));
    const nextKey = state.currentConflictReviewKeys[ID]!;
    expect(nextKey).not.toBe(key);
    expect(state.retainedConflictReviews[key]).toMatchObject({ readOnly: true });
    expect(state.retainedConflictReviews[nextKey]).toMatchObject({ proposal: "edited proposal", readOnly: false });
  });
  it("locks transitions until only the matching command settles", () => {
    let state = notesReducer(conflicted(), captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const key = state.currentConflictReviewKeys[ID]!;
    state = notesReducer(state, beginRetainedNoteConflictCommand({ reviewKey: key, actorId: "user-1", requestId: "lock-a", sessionId: state.retainedConflictReviews[key].session.sessionId, revision: state.retainedConflictReviews[key].session.revision }));
    expect(state.retainedConflictReviews[key].command).toMatchObject({ status: "pending", requestId: "lock-a" });
    const session = state.retainedConflictReviews[key].session;
    state = notesReducer(state, transitionRetainedNoteConflictReview({ reviewKey: key, actorId: "user-1", transition: { type: "set-hunk", sessionId: session.sessionId, sourceIdentity: session.sourceIdentity, sessionRevision: session.revision, hunkIndex: 0, hunkId: session.hunkIds[0], decision: "applied" } }));
    expect(state.retainedConflictReviews[key].session.decisions[0]).toBe("pending");
    state = notesReducer(state, settleRetainedNoteConflictCommand({ reviewKey: key, actorId: "user-1", requestId: "wrong" }));
    expect(state.retainedConflictReviews[key].command.status).toBe("pending");
    state = notesReducer(state, settleRetainedNoteConflictCommand({ reviewKey: key, actorId: "user-1", requestId: "lock-a" }));
    expect(state.retainedConflictReviews[key].command.status).toBe("idle");
  });

});

describe("reviewed rebase dirty reconciliation", () => {
  it("recomputes supported physical dirt against the reviewed remote and preserves context", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    state = notesReducer(state, setNoteField({ id: ID, field: "content", value: "mine" }));
    state = notesReducer(state, setNoteField({ id: ID, field: "label", value: "local title" }));
    state = notesReducer(state, setNoteField({ id: ID, field: "project_id", value: "33333333-3333-4333-8333-333333333333" }));
    state = notesReducer(state, recordNoteConflict({ id: ID, expectedVersion: 4, currentVersion: 5, currentRow: row({ content: "theirs", label: "Remote", version: 5 }), sentSnapshot: { content: "mine", label: "local title" }, actorId: "user-1", organizationId: ORG, decisionId: "reconcile-decision", reviewId: "reconcile-review" }));
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const decision = state.notes[ID]._conflictDecision!;
    state = notesReducer(state, applyNoteConflictResolution({ id: ID, decisionId: decision.decisionId, reviewId: decision.reviewId, requestId: "reconcile", choice: "mine", proposedContent: "theirs", reviewedLiveContent: "mine" }));
    expect(state.notes[ID]._dirtyFields).toEqual(new Set(["label", "project_id"]));
    expect(state.notes[ID]._dirty).toBe(true);
  });
});

describe("reviewed context reconciliation", () => {
  it("clears a context field that matches the reviewed remote while retaining a differing edge", () => {
    let state = notesReducer(undefined, upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    state = notesReducer(state, setNoteField({ id: ID, field: "content", value: "mine" }));
    state = notesReducer(state, setNoteField({ id: ID, field: "project_id", value: null }));
    state = notesReducer(state, setNoteField({ id: ID, field: "task_id", value: "33333333-3333-4333-8333-333333333333" }));
    state = notesReducer(state, recordNoteConflict({ id: ID, expectedVersion: 4, currentVersion: 5, currentRow: row({ content: "theirs", version: 5, project_id: null, task_id: null }), sentSnapshot: { content: "mine", project_id: null, task_id: "33333333-3333-4333-8333-333333333333" }, actorId: "user-1", organizationId: ORG, decisionId: "context-decision", reviewId: "context-review" }));
    state = notesReducer(state, captureNoteConflictLiveBuffer({ id: ID, content: "mine" }));
    const decision = state.notes[ID]._conflictDecision!;
    state = notesReducer(state, applyNoteConflictResolution({ id: ID, decisionId: decision.decisionId, reviewId: decision.reviewId, requestId: "context-reconcile", choice: "mine", proposedContent: "theirs", reviewedLiveContent: "mine" }));
    expect(state.notes[ID]._dirtyFields.has("project_id")).toBe(false);
    expect(state.notes[ID]._dirtyFields.has("task_id")).toBe(true);
  });
});
