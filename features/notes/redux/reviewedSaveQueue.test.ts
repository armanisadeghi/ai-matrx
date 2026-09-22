import { withClaims } from "@/test-utils/supabase-auth";

const schema = jest.fn();
const getSession = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();
const invalidate = jest.fn();

// The reviewed-save path checks the actor with `getClaimsUser(supabase)` →
// `auth.getClaims()`; `withClaims` derives it from this same `getSession`, so
// the scripted user switch is still ONE identity at both doors.
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema, auth: withClaims({ getSession }) } }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources, setTargets } }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ invalidate, services: { comments: new Proxy({}, { get: () => () => undefined }), categories: new Proxy({}, { get: () => () => undefined }) } }) }));

import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import notesReducer, { setNoteField, upsertNoteFromServer } from "./slice";
import { captureReviewedNoteSave, saveReviewedNoteSnapshot } from "./thunks";
import { captureNoteEditSourceFromRecord } from "../richDocumentSource";
import type { Note } from "../types";

enableMapSet();
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "22222222-2222-4222-8222-222222222222";
const note = (overrides: Partial<Note> = {}): Note => ({ id: ID, organization_id: ORG, content: "before", label: "note", folder_id: null, folder_name: null, tags: [], metadata: {}, position: 0, project_id: null, task_id: null, visibility: "personal", version: 7, updated_at: "2026-09-13T00:00:00.000Z", created_at: "2026-09-13T00:00:00.000Z", created_by: USER, updated_by: null, deleted_at: null, content_hash: null, file_path: null, last_device_id: null, custom_fields: {}, sync_version: 0, ...overrides });

function query(result: unknown) {
  const value = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), update: jest.fn(), single: jest.fn(), maybeSingle: jest.fn() };
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.is.mockReturnValue(value); value.update.mockReturnValue(value); value.single.mockResolvedValue(result); value.maybeSingle.mockResolvedValue(result);
  return value;
}
/**
 * THE PRE-WRITE READ IS GONE on the saveNote path (the reviewed snapshot drains
 * through the same queue): the thunk hands `persistNoteUpdate` the acknowledged
 * organization AND context links, so the service no longer SELECTs the stored
 * row — nor its associations — before writing it. Each case sequences ONLY the
 * calls the new path makes; a returning pre-write read spills one call past the
 * end of that sequence onto `preWriteRead`, and `noPreWriteRead()` fails on it.
 */
function savePath(...chains: Array<ReturnType<typeof query>>) {
  // An extra read must FAIL the way an exhausted mock used to, or a drain loop
  // would keep finding a readable row and never stop.
  const preWriteRead = query({ data: null, error: { message: "unexpected extra supabase call — the saveNote path makes no pre-write read" } });
  const from = jest.fn();
  for (const chain of chains) from.mockReturnValueOnce(chain);
  from.mockReturnValue(preWriteRead);
  schema.mockReturnValue({ from });
  return {
    from,
    preWriteRead,
    noPreWriteRead: () => expect(preWriteRead.select).not.toHaveBeenCalled(),
  };
}
function reducer(state: RootState | undefined, action: { type: string }): RootState {
  const next = createSlimRootReducer()(state, action);
  if (action.type === "test/seed-user") return { ...next, userAuth: { ...next.userAuth, id: USER } };
  if (action.type === "test/switch-user") return { ...next, userAuth: { ...next.userAuth, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } };
  return next;
}
function storeWithNote() {
  const store = configureStore({ reducer, middleware: (gdm) => gdm({ serializableCheck: false }) });
  store.dispatch({ type: "test/seed-user" });
  store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" }));
  return store;
}

describe("reviewed Notes queue receipt", () => {
  beforeEach(() => { jest.clearAllMocks(); getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null }); listForSources.mockResolvedValue({ ok: true, data: { edges: [] } }); setTargets.mockResolvedValue({ ok: true, data: null }); invalidate.mockReturnValue(undefined); });
  it("settles duplicate observers from one actual queued physical write", async () => {
    const store = storeWithNote();
    store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID];
    const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "source", snapshotId: "snapshot" });
    const capture = store.dispatch(captureReviewedNoteSave(source));
    if (capture.status !== "captured") throw new Error(`capture refused: ${capture.reason}`);
    const updated = query({ data: note({ content: "reviewed", version: 8 }), error: null });
    const path = savePath(updated);
    const first = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    const second = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    await expect(first.result).resolves.toMatchObject({ status: "physical-saved", receipt: { databaseWrite: "saved", note: { content: "reviewed", version: 8 } } });
    await expect(second.result).resolves.toMatchObject({ status: "physical-saved" });
    expect(updated.update).toHaveBeenCalledTimes(1);
    path.noPreWriteRead();
  });
  it("refuses a newer editor snapshot before any transport write", async () => {
    const store = storeWithNote();
    store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID];
    const captured = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "source", snapshotId: "first" });
    const current = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "source", snapshotId: "second" });
    const permit = store.dispatch(captureReviewedNoteSave(captured));
    if (permit.status !== "captured") throw new Error("capture unexpectedly refused");
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: permit.permit, currentSource: current }));
    await expect(observation.result).resolves.toMatchObject({ status: "refused", reason: "source-changed" });
    expect(schema).not.toHaveBeenCalled();
  });
  it("releases one observer without cancelling the shared physical write", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "release", snapshotId: "release" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture unexpectedly refused");
    let resolveUpdate: ((value: unknown) => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredUpdate = new Promise<void>((resolve) => { entered = resolve; });
    const updated = query(undefined); updated.maybeSingle.mockImplementation(() => new Promise((resolve) => { resolveUpdate = resolve; entered?.(); }));
    const path = savePath(updated);
    const first = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    const second = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    expect(first).not.toBe(second); first.release();
    await expect(first.result).resolves.toMatchObject({ status: "observation-released" });
    await enteredUpdate;
    if (!resolveUpdate) throw new Error("reviewed transport never entered");
    resolveUpdate({ data: note({ content: "reviewed", version: 8 }), error: null });
    await expect(second.result).resolves.toMatchObject({ status: "physical-saved" });
    const third = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    await expect(third.result).resolves.toMatchObject({ status: "physical-saved" });
    expect(updated.update).toHaveBeenCalledTimes(1);
    path.noPreWriteRead();
  });
  it("retains the reviewed first receipt when a later ordinary drain fails", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "first" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "drain", snapshotId: "drain" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    let resolveFirst: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const enteredFirst = new Promise<void>((resolve) => { entered = resolve; });
    const first = query(undefined); first.maybeSingle.mockImplementation(() => new Promise((resolve) => { resolveFirst = resolve; entered?.(); })); const failed = query({ data: null, error: null });
    // The later drain CAS-misses (no row, no error), so guardedUpdate reads the
    // current row before giving up — two writes and one conflict read, and no
    // pre-write read in front of either write.
    const drainConflictRead = query({ data: null, error: null });
    const path = savePath(first, failed, drainConflictRead);
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await enteredFirst;
    store.dispatch(setNoteField({ id: ID, field: "content", value: "later" })); if (!resolveFirst) throw new Error("first transport never entered"); resolveFirst({ data: note({ content: "first", version: 8 }), error: null });
    await expect(observation.result).resolves.toMatchObject({ status: "physical-saved", receipt: { note: { content: "first", version: 8 } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().notes.notes[ID]).toMatchObject({ content: "later", _dirty: true });
    path.noPreWriteRead();
  });
  it("returns post-ack recovery without installing an old actor receipt after actor switch", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "actor", snapshotId: "actor" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    let resolveUpdate: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const enteredUpdate = new Promise<void>((resolve) => { entered = resolve; });
    const updated = query(undefined); updated.maybeSingle.mockImplementation(() => new Promise((resolve) => { resolveUpdate = resolve; entered?.(); }));
    const path = savePath(updated);
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await enteredUpdate;
    store.dispatch({ type: "test/switch-user" }); getSession.mockResolvedValue({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null });
    if (!resolveUpdate) throw new Error("transport never entered"); resolveUpdate({ data: note({ content: "reviewed", version: 8 }), error: null });
    await expect(observation.result).resolves.toMatchObject({ status: "recovery-required" });
    expect(store.getState().notes.notes[ID]).toMatchObject({ content: "reviewed", _dirty: true, _error: null, _consecutiveSaveFailures: 0 });
    path.noPreWriteRead();
  });
  it("keeps the base revision for an acknowledged context-only settlement", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "context", snapshotId: "context" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error(`capture refused: ${capture.reason}`);
    const readback = query({ data: note(), error: null }); const path = savePath(readback);
    const result = await store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result;
    if (result.status === "refused") throw new Error(`context settlement refused ${result.reason}; schema=${schema.mock.calls.length}; readback=${JSON.stringify({ select: readback.select.mock.calls.length, maybeSingle: readback.maybeSingle.mock.calls.length })}; error=${store.getState().notes.notes[ID]._error}`);
    expect(result).toMatchObject({ status: "context-settled", receipt: { databaseWrite: "unchanged", note: { version: 7 } } });
    expect(store.getState().notes.notes[ID].version).toBe(7);
    path.noPreWriteRead();
  });
  it("returns the saved receipt and retains a failed project context draft", async () => {
    setTargets.mockResolvedValueOnce({ ok: false, error: new Error("project denied") });
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" })); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "partial", snapshotId: "partial" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error(`capture refused: ${capture.reason}`);
    const updated = query({ data: note({ content: "reviewed", version: 8 }), error: null });
    const path = savePath(updated);
    const result = await store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result;
    expect(result).toMatchObject({ status: "partial", receipt: { databaseWrite: "saved", note: { content: "reviewed", version: 8 }, failedFields: ["project_id"] } });
    expect(store.getState().notes.notes[ID]).toMatchObject({ version: 8, project_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", _dirty: true });
    expect(store.getState().notes.notes[ID]._dirtyFields.has("project_id")).toBe(true);
    path.noPreWriteRead();
  });
  it("returns unchanged partial context receipt without a physical update", async () => {
    setTargets.mockResolvedValueOnce({ ok: false, error: new Error("project denied") });
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "unchanged-partial", snapshotId: "unchanged-partial" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error(`capture refused: ${capture.reason}`);
    const readback = query({ data: note(), error: null }); const path = savePath(readback);
    const result = await store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result;
    expect(result).toMatchObject({ status: "partial", receipt: { databaseWrite: "unchanged", note: { version: 7 }, failedFields: ["project_id"] } });
    expect(readback.update).not.toHaveBeenCalled();
    expect(store.getState().notes.notes[ID]).toMatchObject({ version: 7, project_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", _dirty: true });
    expect(store.getState().notes.notes[ID]._dirtyFields.has("project_id")).toBe(true);
    path.noPreWriteRead();
  });
  it("keeps the unchanged context receipt when later typing replays a physical save", async () => {
    let releaseContext: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const enteredContext = new Promise<void>((resolve) => { entered = resolve; });
    setTargets.mockImplementationOnce(() => new Promise((resolve) => { releaseContext = resolve; entered?.(); }));
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "race", snapshotId: "race" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    const readback = query({ data: note(), error: null }); const updated = query({ data: note({ content: "later", version: 8 }), error: null });
    const path = savePath(readback, updated);
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await enteredContext;
    store.dispatch(setNoteField({ id: ID, field: "content", value: "later" })); if (!releaseContext) throw new Error("context settlement did not enter"); releaseContext({ ok: true, data: null });
    await expect(observation.result).resolves.toMatchObject({ status: "context-settled", receipt: { databaseWrite: "unchanged", note: { version: 7 }, succeededFields: ["project_id"] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().notes.notes[ID]).toMatchObject({ content: "later", version: 8 });
    expect(readback.update).not.toHaveBeenCalled();
    path.noPreWriteRead();
  });
  it("retains a saved receipt when post-write cache invalidation fails", async () => {
    invalidate.mockImplementationOnce(() => { throw new Error("cache unavailable"); });
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" })); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "cache", snapshotId: "cache" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    const updated = query({ data: note({ content: "reviewed", version: 8, project_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }), error: null }); const path = savePath(updated);
    const result = await store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result;
    expect(result).toMatchObject({ status: "recovery-required", reason: "cache-recovery", receipt: { databaseWrite: "saved", note: { content: "reviewed", version: 8 }, succeededFields: ["project_id"] } });
    path.noPreWriteRead();
  });
  it("refuses a Supabase-only session change before transport", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "pre-session", snapshotId: "pre-session" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    getSession.mockResolvedValue({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null });
    await expect(store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result).resolves.toMatchObject({ status: "refused", reason: "session-changed" });
    expect(schema).not.toHaveBeenCalled(); expect(store.getState().userAuth.id).toBe(USER);
  });
  it("retains a saved receipt after a Supabase-only post-ack session change", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "post-session", snapshotId: "post-session" }); const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    let release: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const updated = query(undefined); updated.maybeSingle.mockImplementation(() => new Promise((resolve) => { release = resolve; entered?.(); })); const path = savePath(updated);
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await waiting;
    getSession.mockResolvedValue({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null }); if (!release) throw new Error("transport did not enter"); release({ data: note({ content: "reviewed", version: 8 }), error: null });
    await expect(observation.result).resolves.toMatchObject({ status: "recovery-required", reason: "session-changed", receipt: { note: { content: "reviewed", version: 8 } }, actorId: USER });
    expect(store.getState().userAuth.id).toBe(USER); expect(store.getState().notes.notes[ID]).toMatchObject({ version: 7, _dirty: true, _error: null, _consecutiveSaveFailures: 0 });
    path.noPreWriteRead();
  });
  it("retains a partial saved receipt after a Supabase-only session change", async () => {
    let release: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const waiting = new Promise<void>((resolve) => { entered = resolve; });
    setTargets.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; entered?.(); }));
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" })); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "partial-session", snapshotId: "partial-session" }); const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    const updated = query({ data: note({ content: "reviewed", version: 8 }), error: null }); const path = savePath(updated);
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await waiting;
    getSession.mockResolvedValue({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null }); if (!release) throw new Error("context did not enter"); release({ ok: false, error: new Error("project denied") });
    await expect(observation.result).resolves.toMatchObject({ status: "recovery-required", reason: "session-changed", receipt: { databaseWrite: "saved", note: { content: "reviewed", version: 8 }, failedFields: ["project_id"] } });
    expect(store.getState().userAuth.id).toBe(USER); expect(store.getState().notes.notes[ID]).toMatchObject({ version: 7, _dirty: true, _error: null, _consecutiveSaveFailures: 0 });
    path.noPreWriteRead();
  });
  it.each([
    ["label", { label: "wrong" }],
    ["metadata", { metadata: { wrong: true } }],
    ["tags", { tags: ["wrong"] }],
  ])("refuses an invalid saved receipt with wrong unsubmitted %s", async (_field, mutation) => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: `invalid-${_field}`, snapshotId: `invalid-${_field}` }); const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    const updated = query({ data: note({ content: "reviewed", version: 8, ...mutation }), error: null }); const path = savePath(updated);
    await expect(store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result).resolves.toMatchObject({ status: "refused", reason: "invalid-receipt" });
    expect(store.getState().notes.notes[ID]).toMatchObject({ version: 7, content: "reviewed", _dirty: true });
    path.noPreWriteRead();
  });
  it("reports a failed context field at its ACKNOWLEDGED value, never the attempted one, without a server read", async () => {
    // Until 2026-09-21 the save re-read the note and its association edges
    // before writing, so a server-side change of the link could surface here
    // as an invalid receipt. The save now trusts the acknowledged snapshot
    // (two round trips fewer on every autosave); what it must still get right
    // is the receipt: the failed field carries the value the client last
    // acknowledged — null here — not the value it was trying to write.
    setTargets.mockResolvedValueOnce({ ok: false, error: new Error("project denied") });
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" })); store.dispatch(setNoteField({ id: ID, field: "project_id", value: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "base-context", snapshotId: "base-context" }); const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    listForSources.mockResolvedValueOnce({ ok: true, data: { edges: [{ sourceId: ID, targetType: "project", targetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] } });
    const updated = query({ data: note({ content: "reviewed", version: 8 }), error: null }); const path = savePath(updated);
    const result = await store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })).result;
    expect(result).toMatchObject({ status: "partial" });
    if (result.status !== "partial") throw new Error("expected a partial receipt");
    expect(result.receipt.failedFields).toEqual(["project_id"]);
    expect(result.receipt.note.project_id).toBe(record._acknowledgedPhysicalSnapshot?.project_id ?? null);
    expect(result.receipt.note.project_id).not.toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    // The association read that used to supply the prior value is never made.
    expect(listForSources).not.toHaveBeenCalled();
    expect(store.getState().notes.notes[ID]).toMatchObject({ version: 8, content: "reviewed" });
    path.noPreWriteRead();
  });
});
