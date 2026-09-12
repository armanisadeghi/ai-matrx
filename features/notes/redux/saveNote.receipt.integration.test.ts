const schema = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();
const invalidate = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema } }));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForSources, setTargets },
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ invalidate }),
}));

import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import type { Note } from "../types";
import notesReducer, {
  setNoteField,
  setNoteFields,
  updateNoteFolder,
  upsertNoteFromServer,
} from "./slice";
import { saveNote } from "./thunks";

enableMapSet();

const ORG = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID, content: "before", content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z", created_by: "user-1", deleted_at: null,
    file_path: null, folder_id: null, folder_name: null, label: "Original", last_device_id: null,
    metadata: {}, organization_id: ORG, position: 0, project_id: null, sync_version: 0,
    tags: [], task_id: null, updated_at: "2026-09-12T00:00:00.000Z", updated_by: null,
    version: 7, visibility: "personal", ...overrides,
  };
}

function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), maybeSingle: jest.fn(), update: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

function storeWithNote() {
  const store = configureStore({
    reducer: { notes: notesReducer, userAuth: () => ({ id: "user-1" }) },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" }));
  return store;
}

describe("saveNote receipt integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    setTargets.mockResolvedValue({ ok: true, data: null });
  });

  it("accepts a paired folder display name while persisting only its admitted ID", async () => {
    const existing = query({ data: note(), error: null });
    const folder = query({ data: { id: FOLDER_ID, name: "Archive" }, error: null });
    const updated = query({ data: note({ folder_id: FOLDER_ID, folder_name: "Archive", version: 8 }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(folder).mockReturnValueOnce(updated) });
    const store = storeWithNote();
    store.dispatch(setNoteFields({ id: NOTE_ID, updates: { folder_id: FOLDER_ID, folder_name: "Archive" } }));

    const action = await store.dispatch(saveNote(NOTE_ID));

    expect(saveNote.fulfilled.match(action)).toBe(true);
    expect(updated.update).toHaveBeenCalledWith({ folder_id: FOLDER_ID, folder_name: "Archive", version: 8 });
    expect(store.getState().notes.notes[NOTE_ID]._dirtyFields.size).toBe(0);
  });

  it("refuses a name-only persisted folder mutation", async () => {
    const store = storeWithNote();
    store.dispatch(updateNoteFolder({ id: NOTE_ID, folder: "Archive" }));

    const action = await store.dispatch(saveNote(NOTE_ID));

    expect(saveNote.rejected.match(action)).toBe(true);
    expect(schema).not.toHaveBeenCalled();
  });

  it("does not advance a context-only readback over a physical edit typed while edges settle", async () => {
    const existing = query({ data: note({ version: 8, updated_at: "2026-09-12T01:00:00.000Z" }), error: null });
    const unchanged = query({ data: note({ version: 8, updated_at: "2026-09-12T01:00:00.000Z" }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });
    let release: ((value: { ok: true; data: null }) => void) | undefined;
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    setTargets.mockImplementation(() => new Promise((resolve) => { release = resolve; started?.(); }));
    const store = storeWithNote();
    store.dispatch(setNoteField({ id: NOTE_ID, field: "project_id", value: PROJECT_ID }));
    const pending = store.dispatch(saveNote(NOTE_ID));
    await startedPromise;
    store.dispatch(setNoteField({ id: NOTE_ID, field: "content", value: "later physical edit" }));
    release?.({ ok: true, data: null });
    await pending;

    const record = store.getState().notes.notes[NOTE_ID];
    expect(record).toMatchObject({ version: 7, updated_at: "2026-09-12T00:00:00.000Z", content: "later physical edit" });
    expect(record._dirtyFields).toEqual(new Set(["content"]));
  });

  it("keeps newer physical dirt through a partial context receipt", async () => {
    const existing = query({ data: note({ version: 8, updated_at: "2026-09-12T01:00:00.000Z" }), error: null });
    const unchanged = query({ data: note({ version: 8, updated_at: "2026-09-12T01:00:00.000Z" }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });
    let release: ((value: { ok: true; data: null }) => void) | undefined;
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    setTargets.mockImplementation(({ targetType }: { targetType: string }) => targetType === "project"
      ? new Promise((resolve) => { release = resolve; started?.(); })
      : Promise.resolve({ ok: false, error: { message: "task denied" } }));
    const store = storeWithNote();
    store.dispatch(setNoteFields({ id: NOTE_ID, updates: { project_id: PROJECT_ID, task_id: TASK_ID } }));
    const pending = store.dispatch(saveNote(NOTE_ID));
    await startedPromise;
    store.dispatch(setNoteField({ id: NOTE_ID, field: "content", value: "later physical edit" }));
    release?.({ ok: true, data: null });
    await pending;

    const record = store.getState().notes.notes[NOTE_ID];
    expect(record).toMatchObject({ version: 7, content: "later physical edit", project_id: PROJECT_ID, task_id: TASK_ID });
    expect(record._dirtyFields).toEqual(new Set(["content", "task_id"]));
    expect(record._saving).toBe(false);
  });
});
