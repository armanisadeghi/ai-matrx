// A NOTE HAS ONE SAVE DOOR: ITS WORKING COPY.
//
// Until 2026-10-03 a note's working-copy "save" was an in-memory Redux commit,
// and the real database write ran through a second door (the notes autosave
// middleware) with its own retry and its own conflict window. So the
// primitive's guarantees — retry after the last view leaves, offline-aware
// backoff, the record held until saved, one conflict choice — never covered
// the one write that matters.
//
// Now the working-copy kind's save IS the database save (undo history and the
// auto-label are its steps, the version check its compare-and-swap). These
// read the primitive's own state, so a second door turns them red:
//  - a write that fails after the last view leaves is held and retried here;
//  - offline, no write is spent; `online` saves it;
//  - two devices: the primitive's conflict (Keep mine / Take theirs / Merge),
//    nothing lost and nothing written until the person chooses;
//  - Save (before the debounce) carries the generated label, once, and one
//    undo step per save.
jest.mock("@/lib/toast", () => {
  const fn = () => jest.fn();
  const toast = { warning: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn(), dismiss: jest.fn(), message: jest.fn() };
  return { toast: new Proxy(toast, { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? fn() }) };
});
jest.mock("@/utils/supabase/client", () => (require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule());
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }, error: null }),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));
const persistNoteUpdate = jest.fn();
jest.mock("../service/notesService", () => ({
  ...jest.requireActual("../service/notesService"),
  persistNoteUpdate: (...args: unknown[]) => persistNoteUpdate(...args),
}));

import { configureStore, type Middleware, type UnknownAction } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { toast } from "@/lib/toast";
import notesReducer, { upsertNoteFromServer } from "../redux/slice";
import { saveNote } from "../redux/thunks";
import { noteSaveRequestMiddleware } from "../redux/noteSaveRequests";
import workingCopiesReducer, { getWorkingCopy } from "@/lib/working-copy/workingCopySlice";
import { mergedConflictText } from "@/lib/working-copy/announce";
import { noteWorkingCopy } from "../utils/noteLiveContent";
import { NoteUpdateConflictError, type NoteSaveReceipt } from "../service/noteSaveErrors";
import type { Note } from "../types";

enableMapSet();

const NOTE_ID = "6c1e9b2a-3f4d-4e5a-8b7c-2d1e0f9a8b71";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORED = "Harbor Dental intake\n- confirm insurance\n- x-rays\n- consent form";

const row = (overrides: Partial<Note> = {}): Note => ({
  id: NOTE_ID, organization_id: ORG, version: 3, content: STORED, label: "Intake checklist",
  folder_name: null, folder_id: null, tags: [], metadata: {}, published_to_web: false, position: 0,
  project_id: null, task_id: null, created_at: "2026-10-01T09:00:00.000Z", created_by: ACTOR,
  updated_at: "2026-10-01T09:00:00.000Z", updated_by: ACTOR,
  deleted_at: null, content_hash: null, file_path: null, last_device_id: null, custom_fields: {},
  sync_version: 0, search_engine_indexed: null, shown_to: null,
  ...overrides,
});

/** The server stores what was sent, one version up. */
function storedReceipt(sent: Partial<Note>, from: Note): NoteSaveReceipt {
  return {
    note: { ...from, ...sent, version: from.version + 1, updated_at: new Date(Date.parse(from.updated_at ?? "") + 60_000).toISOString() },
    databaseWrite: "saved",
    succeededFields: [],
    failedFields: [],
    safeCauses: {},
  };
}

function makeStore(initial: Note = row()) {
  const seen: UnknownAction[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const store = configureStore({
    reducer: {
      notes: notesReducer,
      workingCopies: workingCopiesReducer,
      userAuth: (state = { id: ACTOR, authReady: true }) => state,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(recorder, noteSaveRequestMiddleware),
  });
  store.dispatch(upsertNoteFromServer({ note: initial, fetchStatus: "full" }));
  return { store, seen };
}

const record = (store: ReturnType<typeof makeStore>["store"]) => store.getState().notes.notes[NOTE_ID];
const entry = (store: ReturnType<typeof makeStore>["store"]) =>
  getWorkingCopy(store.getState(), noteWorkingCopy.key(NOTE_ID));

let online = true;
beforeAll(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
});

beforeEach(() => {
  jest.useFakeTimers();
  online = true;
  persistNoteUpdate.mockReset();
  (toast.warning as jest.Mock).mockClear();
});

afterEach(async () => {
  // Every session this test opened must have settled (no stray retry timers).
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
});

it("a save that fails after the note's last view left is held by its working copy and retried until it lands", async () => {
  const { store } = makeStore();
  const mine = `${STORED}\n- parking validation`;
  persistNoteUpdate
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockImplementation(async (_id: string, updates: Partial<Note>) => storedReceipt(updates, row()));

  const release = noteWorkingCopy.attach(NOTE_ID, store);
  noteWorkingCopy.load(NOTE_ID, STORED);
  noteWorkingCopy.edit(NOTE_ID, mine);
  release(); // the board tile closes before the debounce
  await jest.advanceTimersByTimeAsync(0);

  expect(persistNoteUpdate).toHaveBeenCalledTimes(1);
  // The working copy holds the unsaved words and owns the retry.
  expect(entry(store)?.failure).toMatchObject({ permanent: false, attempts: 1 });
  expect(entry(store)?.value).toBe(mine);
  expect(noteWorkingCopy.openIds()).toContain(NOTE_ID);

  await jest.advanceTimersByTimeAsync(1_000); // the primitive's first backoff step
  expect(persistNoteUpdate).toHaveBeenCalledTimes(2);
  expect(persistNoteUpdate.mock.calls[1][1]).toMatchObject({ content: mine });
  expect(record(store)._dirty).toBe(false);
  expect(record(store).content).toBe(mine);
  expect(noteWorkingCopy.openIds()).not.toContain(NOTE_ID);
});

it("offline, no write is spent; coming back online saves what was typed with the tile closed", async () => {
  const { store } = makeStore();
  const mine = `${STORED}\n- typed on the train`;
  persistNoteUpdate.mockImplementation(async (_id: string, updates: Partial<Note>) => {
    if (!online) throw new TypeError("Failed to fetch");
    return storedReceipt(updates, row());
  });

  online = false;
  const release = noteWorkingCopy.attach(NOTE_ID, store);
  noteWorkingCopy.load(NOTE_ID, STORED);
  noteWorkingCopy.edit(NOTE_ID, mine);
  release();
  await jest.advanceTimersByTimeAsync(0);
  expect(persistNoteUpdate).toHaveBeenCalledTimes(1); // the attempt on close

  await jest.advanceTimersByTimeAsync(20_000);
  expect(persistNoteUpdate).toHaveBeenCalledTimes(1); // offline: no write spent
  expect(entry(store)?.status).toBe("error");
  expect(noteWorkingCopy.openIds()).toContain(NOTE_ID);

  online = true;
  window.dispatchEvent(new Event("online"));
  await jest.advanceTimersByTimeAsync(0);
  expect(persistNoteUpdate).toHaveBeenCalledTimes(2);
  expect(persistNoteUpdate.mock.calls[1][1]).toMatchObject({ content: mine });
  expect(record(store)._dirty).toBe(false);
  expect(noteWorkingCopy.openIds()).not.toContain(NOTE_ID);
});

describe("two devices edit one note", () => {
  const mine = STORED.replace("- confirm insurance", "- confirm insurance (Delta PPO)");
  const theirs = `${STORED}\n- send forms by text`;
  const theirRow = row({ content: theirs, version: 4, updated_at: "2026-10-01T09:05:00.000Z" });

  async function intoConflict() {
    const made = makeStore();
    persistNoteUpdate.mockImplementation(async (_id: string, updates: Partial<Note>, options: { expectedVersion?: number }) => {
      if (options.expectedVersion === 3) throw new NoteUpdateConflictError({ expectedVersion: 3, actualStoredNote: theirRow });
      return storedReceipt(updates, theirRow);
    });
    const release = noteWorkingCopy.attach(NOTE_ID, made.store);
    noteWorkingCopy.load(NOTE_ID, STORED);
    noteWorkingCopy.edit(NOTE_ID, mine);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(persistNoteUpdate).toHaveBeenCalledTimes(1);
    // The primitive's one conflict state: both texts kept, nothing written.
    expect(entry(made.store)?.status).toBe("conflict");
    expect(entry(made.store)?.conflict).toMatchObject({ theirs, theirsVersion: 4, ancestor: STORED });
    expect(entry(made.store)?.value).toBe(mine);
    expect(record(made.store).content).toBe(mine);
    expect(toast.warning).toHaveBeenCalledWith("Note changed elsewhere", expect.anything());
    await jest.advanceTimersByTimeAsync(60_000);
    expect(persistNoteUpdate).toHaveBeenCalledTimes(1); // waits for the person
    return { ...made, release };
  }

  it("Keep mine writes mine on top of the version stored now", async () => {
    const { store, release } = await intoConflict();
    await noteWorkingCopy.resolveConflict(NOTE_ID, "mine");
    await jest.advanceTimersByTimeAsync(0);
    expect(persistNoteUpdate).toHaveBeenCalledTimes(2);
    expect(persistNoteUpdate.mock.calls[1][1]).toMatchObject({ content: mine });
    expect(persistNoteUpdate.mock.calls[1][2]).toMatchObject({ expectedVersion: 4 });
    expect(record(store)).toMatchObject({ content: mine, version: 5, _dirty: false });
    expect(entry(store)?.conflict).toBeNull();
    release();
  });

  it("Take theirs writes nothing and shows the stored text", async () => {
    const { store, release } = await intoConflict();
    await noteWorkingCopy.resolveConflict(NOTE_ID, "theirs");
    await jest.advanceTimersByTimeAsync(5_000);
    expect(persistNoteUpdate).toHaveBeenCalledTimes(1);
    expect(record(store)).toMatchObject({ content: theirs, version: 4, _dirty: false });
    expect(entry(store)?.value).toBe(theirs);
    expect(entry(store)?.dirty).toBe(false);
    release();
  });

  it("Merge keeps both edits", async () => {
    const { store, release } = await intoConflict();
    const merged = mergedConflictText(entry(store));
    expect(merged).toBe(`${mine}\n- send forms by text`);
    await noteWorkingCopy.resolveConflict(NOTE_ID, "merge", merged ?? undefined);
    await jest.advanceTimersByTimeAsync(0);
    expect(persistNoteUpdate).toHaveBeenCalledTimes(2);
    expect(persistNoteUpdate.mock.calls[1][1]).toMatchObject({ content: merged });
    expect(persistNoteUpdate.mock.calls[1][2]).toMatchObject({ expectedVersion: 4 });
    expect(record(store)).toMatchObject({ content: merged, version: 5, _dirty: false });
    release();
  });
});

it("Save before the debounce carries the generated label once, with one undo step per save", async () => {
  const { store, seen } = makeStore(row({ label: "New Note" }));
  persistNoteUpdate.mockImplementation(async (_id: string, updates: Partial<Note>) => storedReceipt(updates, { ...row({ label: "New Note" }), ...record(store), version: record(store).version }));
  const autoLabels = () =>
    seen.filter((a) => a.type === "notes/updateNoteLabel" && (a as { meta?: { notesAutoLabel?: boolean } }).meta?.notesAutoLabel).length;
  const contentUndoSteps = () => record(store)._undoPast.filter((step) => step.field === "content").length;

  const release = noteWorkingCopy.attach(NOTE_ID, store);
  noteWorkingCopy.load(NOTE_ID, STORED);
  for (const typed of [`${STORED}\n-`, `${STORED}\n- p`, `${STORED}\n- parking`]) noteWorkingCopy.edit(NOTE_ID, typed);
  // The editor's Save: flush the working copy, then save the note.
  void noteWorkingCopy.flush(NOTE_ID);
  await store.dispatch(saveNote(NOTE_ID)).unwrap();
  await jest.advanceTimersByTimeAsync(10_000);

  expect(persistNoteUpdate).toHaveBeenCalledTimes(1);
  expect(persistNoteUpdate.mock.calls[0][1]).toMatchObject({ content: `${STORED}\n- parking`, label: "Harbor Dental intake" });
  expect(autoLabels()).toBe(1);
  expect(contentUndoSteps()).toBe(1);
  expect(record(store)._dirty).toBe(false);

  // A second save: one more undo step, no second label.
  noteWorkingCopy.edit(NOTE_ID, `${STORED}\n- parking validation`);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(persistNoteUpdate).toHaveBeenCalledTimes(2);
  expect(persistNoteUpdate.mock.calls[1][1]).toEqual({ content: `${STORED}\n- parking validation` });
  expect(autoLabels()).toBe(1);
  expect(contentUndoSteps()).toBe(2);
  release();
});
