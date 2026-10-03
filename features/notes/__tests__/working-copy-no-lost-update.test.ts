// A COLLABORATOR'S EDIT IS NEVER SILENTLY LOST IN THE DEBOUNCE WINDOW.
//
// Before 2026-10-03: words typed into a note's working copy reached the note
// record only after the debounce. A realtime row landing in that window found
// the record clean, merged the other device's body AND advanced its version /
// acknowledged base; the working copy then committed the person's text on the
// NEW version, the save's compare-and-swap passed, and the other device's
// edit was gone without a word.
//
// Now the base is held from the first keystroke: the record's body counts as
// edited, the realtime row is retained as an observation, and the commit lands
// on the version the edit started from — so the save's CAS rejects it and the
// note's own conflict window opens. Break that turns this red: the working
// copy not marking the record (`onDirtyChanged`), or the realtime upsert
// rebasing a record whose body has pending words.
jest.mock("@/lib/toast", () => ({ toast: new Proxy({}, { get: () => jest.fn() }) }));

import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import notesReducer, { upsertNoteFromServer } from "../redux/slice";
import workingCopiesReducer, { getWorkingCopy } from "@/lib/working-copy/workingCopySlice";
import { noteWorkingCopy } from "../utils/noteLiveContent";
import type { Note } from "../types";

enableMapSet();

const NOTE_ID = "7d2c4f1a-8b3e-4c5d-9a6f-1e2d3c4b5a69";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORED = "Harbor Dental intake:\n- confirm insurance\n- x-rays";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: NOTE_ID, organization_id: ORG, version: 3, content: STORED, label: "Intake checklist",
  folder_name: null, folder_id: null, tags: [], metadata: {}, published_to_web: false, position: 0,
  project_id: null, task_id: null, created_at: "2026-10-01T09:00:00.000Z", created_by: ACTOR,
  updated_at: "2026-10-01T09:00:00.000Z", updated_by: ACTOR,
  deleted_at: null, content_hash: null, file_path: null, last_device_id: null, custom_fields: {},
  sync_version: 0, search_engine_indexed: null, shown_to: null,
  ...overrides,
});

function makeStore() {
  const store = configureStore({
    reducer: {
      notes: notesReducer,
      workingCopies: workingCopiesReducer,
      userAuth: (state = { id: ACTOR, authReady: true }) => state,
    },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(upsertNoteFromServer({ note: note(), fetchStatus: "full" }));
  return store;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("a realtime row landing between a keystroke and its commit never moves the base the edit started from", () => {
  const store = makeStore();
  const release = noteWorkingCopy.attach(NOTE_ID, store);
  noteWorkingCopy.load(NOTE_ID, STORED);
  noteWorkingCopy.edit(NOTE_ID, `${STORED}\n- parking validation`); // typed on this tab

  // The phone saved first: its row arrives inside this tab's debounce window.
  const theirs = `${STORED}\n- send forms by text`;
  store.dispatch(
    upsertNoteFromServer({
      note: note({ content: theirs, version: 4, updated_at: "2026-10-01T09:05:00.000Z" }),
      fetchStatus: "full",
    }),
  );
  const held = store.getState().notes.notes[NOTE_ID];
  expect(held.version).toBe(3); // the base the edit started from
  expect(held.content).toBe(STORED);
  expect(held._remoteObservation?.version).toBe(4); // kept as evidence for the CAS

  jest.advanceTimersByTime(1_000); // the working copy's save comes due
  // Right before the write, the working copy compares the stored row it was
  // shown with the base its edit started from: the phone's edit is a
  // conflict for the person to decide — nothing is written over it.
  expect(noteWorkingCopy.entry(NOTE_ID)?.conflict).toMatchObject({ theirs, theirsVersion: 4, ancestor: STORED });
  const committed = store.getState().notes.notes[NOTE_ID];
  expect(committed.content).toBe(STORED);
  expect(committed.version).toBe(3);
  expect(committed._dirty).toBe(true);
  noteWorkingCopy.discard(NOTE_ID);
  release();
});

it("words typed and taken back leave the record clean", () => {
  const store = makeStore();
  const release = noteWorkingCopy.attach(NOTE_ID, store);
  noteWorkingCopy.load(NOTE_ID, STORED);
  noteWorkingCopy.edit(NOTE_ID, `${STORED}!`);
  expect(store.getState().notes.notes[NOTE_ID]._dirty).toBe(true);
  noteWorkingCopy.edit(NOTE_ID, STORED);
  expect(store.getState().notes.notes[NOTE_ID]._dirty).toBe(false);
  expect(getWorkingCopy(store.getState(), noteWorkingCopy.key(NOTE_ID))?.dirty).toBe(false);
  release();
});
