const schema = jest.fn();
const getSession = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema, auth: { getSession } } }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources, setTargets } }));

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
const note = (overrides: Partial<Note> = {}): Note => ({ id: ID, organization_id: ORG, content: "before", label: "note", folder_id: null, folder_name: null, tags: [], metadata: {}, position: 0, project_id: null, task_id: null, visibility: "personal", version: 7, updated_at: "2026-09-13T00:00:00.000Z", created_at: "2026-09-13T00:00:00.000Z", created_by: USER, updated_by: null, deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0, ...overrides });

function query(result: unknown) {
  const value = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), update: jest.fn(), single: jest.fn(), maybeSingle: jest.fn() };
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.is.mockReturnValue(value); value.update.mockReturnValue(value); value.single.mockResolvedValue(result); value.maybeSingle.mockResolvedValue(result);
  return value;
}
function reducer(state: RootState | undefined, action: { type: string }): RootState {
  const next = createSlimRootReducer()(state, action);
  if (action.type === "test/seed-user") return { ...next, userAuth: { ...next.userAuth, id: USER } };
  return next;
}
function storeWithNote() {
  const store = configureStore({ reducer, middleware: (gdm) => gdm({ serializableCheck: false }) });
  store.dispatch({ type: "test/seed-user" });
  store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" }));
  return store;
}

describe("reviewed Notes queue receipt", () => {
  beforeEach(() => { jest.clearAllMocks(); getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null }); listForSources.mockResolvedValue({ ok: true, data: { edges: [] } }); setTargets.mockResolvedValue({ ok: true, data: null }); });
  it("settles duplicate observers from one actual queued physical write", async () => {
    const store = storeWithNote();
    store.dispatch(setNoteField({ id: ID, field: "content", value: "reviewed" }));
    const record = store.getState().notes.notes[ID];
    const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "source", snapshotId: "snapshot" });
    const capture = store.dispatch(captureReviewedNoteSave(source));
    if (capture.status !== "captured") throw new Error(`capture refused: ${capture.reason}`);
    const existing = query({ data: note(), error: null });
    const updated = query({ data: note({ content: "reviewed", version: 8 }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated) });
    const first = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    const second = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source }));
    await expect(first.result).resolves.toMatchObject({ status: "physical-saved", receipt: { databaseWrite: "saved", note: { content: "reviewed", version: 8 } } });
    await expect(second.result).resolves.toMatchObject({ status: "physical-saved" });
    expect(updated.update).toHaveBeenCalledTimes(1);
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
    const existing = query({ data: note(), error: null }); const updated = query(undefined); updated.maybeSingle.mockImplementation(() => new Promise((resolve) => { resolveUpdate = resolve; entered?.(); }));
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated) });
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
  });
  it("retains the reviewed first receipt when a later ordinary drain fails", async () => {
    const store = storeWithNote(); store.dispatch(setNoteField({ id: ID, field: "content", value: "first" }));
    const record = store.getState().notes.notes[ID]; const source = captureNoteEditSourceFromRecord({ record, displayedNote: record, actorId: USER, sourceId: "drain", snapshotId: "drain" });
    const capture = store.dispatch(captureReviewedNoteSave(source)); if (capture.status !== "captured") throw new Error("capture refused");
    let resolveFirst: ((value: unknown) => void) | undefined; let entered: (() => void) | undefined; const enteredFirst = new Promise<void>((resolve) => { entered = resolve; });
    const existing = query({ data: note(), error: null }); const first = query(undefined); first.maybeSingle.mockImplementation(() => new Promise((resolve) => { resolveFirst = resolve; entered?.(); })); const failed = query({ data: null, error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(first).mockReturnValueOnce(existing).mockReturnValueOnce(failed) });
    const observation = store.dispatch(saveReviewedNoteSnapshot({ permit: capture.permit, currentSource: source })); await enteredFirst;
    store.dispatch(setNoteField({ id: ID, field: "content", value: "later" })); if (!resolveFirst) throw new Error("first transport never entered"); resolveFirst({ data: note({ content: "first", version: 8 }), error: null });
    await expect(observation.result).resolves.toMatchObject({ status: "physical-saved", receipt: { note: { content: "first", version: 8 } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().notes.notes[ID]).toMatchObject({ content: "later", _dirty: true });
  });
});
