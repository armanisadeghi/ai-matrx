const schema = jest.fn();
const getSession = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema, auth: { getSession } } }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources, setTargets } }));

import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
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

describe("reviewed Notes queue receipt", () => {
  beforeEach(() => { jest.clearAllMocks(); getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null }); listForSources.mockResolvedValue({ ok: true, data: { edges: [] } }); setTargets.mockResolvedValue({ ok: true, data: null }); });
  it("settles duplicate observers from one actual queued physical write", async () => {
    const store = configureStore({ reducer: { notes: notesReducer, userAuth: (state = { id: USER }) => state } as never, middleware: (gdm) => gdm({ serializableCheck: false }) });
    store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" }));
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
});
