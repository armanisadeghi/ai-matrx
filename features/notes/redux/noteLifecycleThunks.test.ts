/**
 * features/notes/redux/noteLifecycleThunks.test.ts
 *
 * The seven thunks the 2026-09-14 audit found with NO coverage at all, tested
 * where they actually live: through the REAL thunk, the REAL notes reducer and
 * a mocked Supabase client — so each test asserts both the resulting store
 * state and the exact query the thunk emitted.
 *
 * What is mocked and why: the Supabase client (network), and the two
 * notesService functions the trash thunks delegate to (their own transport is
 * a different SUT with its own boundary). Nothing the thunks own — folder
 * admission, the optimistic field writes, the stale-result guard, the trash
 * sweep, which rows leave the store — is stubbed.
 *
 * Named breaks this suite catches:
 *  - `moveNoteToFolder` trusting the caller's folder name/id instead of the
 *    row RLS admitted, or moving a note across organizations.
 *  - `moveNoteToFolder` mutating the store when admission REFUSES.
 *  - `restoreNote` clearing the wrong column, or not putting the restored row
 *    back in the store.
 *  - `emptyTrashThunk` sweeping live notes out of the store alongside the
 *    deleted ones (or, on a no-op empty, sweeping anything at all).
 *  - `permanentlyDeleteNoteThunk` leaving the row on screen after the hard
 *    delete.
 *  - `fetchSharedNotesList` letting a SLOW earlier fetch overwrite a newer
 *    one, or dropping a sharee's dirty buffer when a share is revoked.
 *  - `saveNoteField` writing the field without persisting it.
 */

const schema = jest.fn();
const rpc = jest.fn();
const getSession = jest.fn();
const persistNoteUpdate = jest.fn();
const createFolder = jest.fn();
const permanentlyDeleteNote = jest.fn();
const emptyTrash = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema, rpc, auth: { getSession } },
}));
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "user-1",
  getUserId: () => "user-1",
}));
jest.mock("../service/notesService", () => {
  const actual =
    jest.requireActual<typeof import("../service/notesService")>(
      "../service/notesService",
    );
  return {
    ...actual,
    persistNoteUpdate: (...args: unknown[]) => persistNoteUpdate(...args),
    createFolder: (...args: unknown[]) => createFolder(...args),
    permanentlyDeleteNote: (...args: unknown[]) =>
      permanentlyDeleteNote(...args),
    emptyTrash: (...args: unknown[]) => emptyTrash(...args),
  };
});
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForSources: jest.fn(async () => ({ ok: true, data: { edges: [] } })),
    setTargets: jest.fn(async () => ({ ok: true, data: null })),
  },
}));

import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import type { Note } from "../types";
import { upsertNoteFromServer } from "./slice";
import {
  emptyTrashThunk,
  fetchSharedNotesList,
  moveNoteToFolder,
  moveNoteToNewFolder,
  permanentlyDeleteNoteThunk,
  restoreNote,
  saveNoteField,
} from "./thunks";

enableMapSet();

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_NOTE_ID = "77777777-7777-4777-8777-777777777777";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";

function note(overrides: Partial<Note> = {}): Note {
  return {
    custom_fields: {},
    id: NOTE_ID,
    content: "before",
    content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: "user-1",
    custom_fields: {},
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: "Draft",
    label: "Original",
    last_device_id: null,
    metadata: {},
    organization_id: ORG,
    position: 0,
    project_id: null,
    sync_version: 0,
    tags: [],
    task_id: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    version: 7,
    visibility: "personal",
    ...overrides,
  };
}

/** A PostgREST chain that records every call, so a test can assert the query. */
function query(result: unknown) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    not: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
    order: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };
  for (const key of [
    "select",
    "eq",
    "is",
    "not",
    "update",
    "delete",
    "insert",
    "order",
  ] as const) {
    chain[key].mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

/** The real slim root reducer, plus the one seam a suite needs: a signed-in
 *  identity. `getUserId` reads `state.userAuth.id` and a save refuses without
 *  it, so an unseeded store would prove nothing but the session guard. */
function testRootReducer() {
  const slim = createSlimRootReducer();
  return (state: RootState | undefined, action: UnknownAction): RootState => {
    const next = slim(state, action);
    if (action.type === "test/seed-user") {
      return { ...next, userAuth: { ...next.userAuth, id: "user-1" } };
    }
    return next;
  };
}

function store(seed: Note[] = [note()]) {
  const configured = configureStore({
    reducer: testRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  configured.dispatch({ type: "test/seed-user" });
  for (const row of seed) {
    configured.dispatch(upsertNoteFromServer({ note: row, fetchStatus: "full" }));
  }
  return configured;
}

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
    error: null,
  });
  // A faithful stand-in for the write: the row that comes back is the row
  // that was sent, with the version bumped — exactly what the CAS does. A
  // receipt that echoed the OLD row would make the reducer settle the note
  // back to its pre-move values, which is a different (real) behaviour and
  // not the one these tests are about.
  persistNoteUpdate.mockImplementation(
    async (id: string, updates: Record<string, unknown>) => ({
      note: note({
        id,
        ...updates,
        version: 8,
        updated_at: "2026-09-12T00:05:00.000Z",
      }),
      databaseWrite: "saved" as const,
      succeededFields: [],
      failedFields: [],
      safeCauses: {},
    }),
  );
});

describe("moveNoteToFolder", () => {
  it("moves the note onto the folder row RLS admitted, not the name the caller passed", async () => {
    const configured = store();
    const admission = query({
      data: { id: FOLDER_ID, organization_id: ORG, name: "Research" },
      error: null,
    });
    const from = jest.fn().mockReturnValue(admission);
    schema.mockReturnValue({ from });
    // The forcing point: what the note looked like at the moment the write
    // went out. The receipt echoes it back rather than inventing an answer, so
    // a thunk that trusted the caller's label would show it here.
    let nameAtWrite: string | null = null;
    persistNoteUpdate.mockImplementation(async (id: string, updates: Record<string, unknown>) => {
      nameAtWrite = configured.getState().notes.notes[NOTE_ID].folder_name;
      return {
        note: note({ id, ...updates, folder_name: nameAtWrite, version: 8 }),
        databaseWrite: "saved" as const,
        succeededFields: [],
        failedFields: [],
        safeCauses: {},
      };
    });

    const result = await configured.dispatch(
      moveNoteToFolder({
        noteId: NOTE_ID,
        // The caller's label is a REQUEST. The admitted row says "Research".
        folder: { id: FOLDER_ID, organizationId: ORG, name: "whatever I typed" },
      }),
    );

    expect(moveNoteToFolder.fulfilled.match(result)).toBe(true);
    expect(schema).toHaveBeenCalledWith("workbench");
    expect(from).toHaveBeenCalledWith("note_folders");
    expect(admission.select).toHaveBeenCalledWith("id, organization_id, name");
    expect(admission.eq).toHaveBeenCalledWith("id", FOLDER_ID);
    expect(admission.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(admission.is).toHaveBeenCalledWith("deleted_at", null);

    expect(nameAtWrite).toBe("Research");
    const moved = configured.getState().notes.notes[NOTE_ID];
    expect(moved.folder_id).toBe(FOLDER_ID);
    expect(moved.folder_name).toBe("Research");
    // The move is only real once it is persisted.
    expect(persistNoteUpdate).toHaveBeenCalledWith(
      NOTE_ID,
      expect.objectContaining({ folder_id: FOLDER_ID }),
      expect.objectContaining({ expectedOrganizationId: ORG }),
    );
  });

  it("refuses a folder RLS does not admit and leaves the note where it was", async () => {
    const configured = store();
    const admission = query({ data: null, error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValue(admission) });

    const result = await configured.dispatch(
      moveNoteToFolder({
        noteId: NOTE_ID,
        folder: { id: FOLDER_ID, organizationId: ORG, name: "Research" },
      }),
    );

    expect(moveNoteToFolder.rejected.match(result)).toBe(true);
    const unmoved = configured.getState().notes.notes[NOTE_ID];
    expect(unmoved.folder_id).toBeNull();
    expect(unmoved.folder_name).toBe("Draft");
    expect(persistNoteUpdate).not.toHaveBeenCalled();
  });

  it("refuses a folder in another organization before it reads anything", async () => {
    const configured = store();
    schema.mockImplementation(() => {
      throw new Error("a cross-organization move must never reach the database");
    });

    const result = await configured.dispatch(
      moveNoteToFolder({
        noteId: NOTE_ID,
        folder: { id: FOLDER_ID, organizationId: OTHER_ORG, name: "Theirs" },
      }),
    );

    expect(moveNoteToFolder.rejected.match(result)).toBe(true);
    expect(schema).not.toHaveBeenCalled();
    expect(configured.getState().notes.notes[NOTE_ID].folder_id).toBeNull();
  });
});

describe("moveNoteToNewFolder", () => {
  it("creates the folder in the NOTE's organization and moves the note into the created id", async () => {
    const configured = store();
    createFolder.mockResolvedValue(FOLDER_ID);
    const admission = query({
      data: { id: FOLDER_ID, organization_id: ORG, name: "Ideas" },
      error: null,
    });
    schema.mockReturnValue({ from: jest.fn().mockReturnValue(admission) });

    const result = await configured.dispatch(
      moveNoteToNewFolder({ noteId: NOTE_ID, folderName: "  Ideas  " }),
    );

    expect(moveNoteToNewFolder.fulfilled.match(result)).toBe(true);
    // Trimmed, and filed under the note's organization — not an active-org
    // picker value that may have changed while the dialog was open.
    expect(createFolder).toHaveBeenCalledWith("Ideas", ORG);
    expect(configured.getState().notes.notes[NOTE_ID].folder_id).toBe(FOLDER_ID);
  });

  it("refuses a blank folder name without creating anything", async () => {
    const configured = store();

    const result = await configured.dispatch(
      moveNoteToNewFolder({ noteId: NOTE_ID, folderName: "   " }),
    );

    expect(moveNoteToNewFolder.rejected.match(result)).toBe(true);
    expect(createFolder).not.toHaveBeenCalled();
  });
});

describe("saveNoteField", () => {
  it("writes the field into the store and persists that same value", async () => {
    const configured = store();

    const result = await configured.dispatch(
      saveNoteField({ noteId: NOTE_ID, field: "label", value: "Renamed" }),
    );

    expect(saveNoteField.fulfilled.match(result)).toBe(true);
    expect(configured.getState().notes.notes[NOTE_ID].label).toBe("Renamed");
    expect(persistNoteUpdate).toHaveBeenCalledWith(
      NOTE_ID,
      { label: "Renamed" },
      expect.objectContaining({ expectedVersion: 7 }),
    );
    // Persisted means no longer dirty — a rename that stayed dirty would be
    // re-sent forever by the autosave middleware.
    expect(configured.getState().notes.notes[NOTE_ID]._dirty).toBe(false);
  });
});

describe("restoreNote", () => {
  it("clears deleted_at on that row and puts the restored note back in the store", async () => {
    const configured = store([]);
    const restored = note({ deleted_at: null, label: "Back" });
    const chain = query({ data: restored, error: null });
    const from = jest.fn().mockReturnValue(chain);
    schema.mockReturnValue({ from });

    const result = await configured.dispatch(restoreNote(NOTE_ID));

    expect(restoreNote.fulfilled.match(result)).toBe(true);
    expect(schema).toHaveBeenCalledWith("workbench");
    expect(from).toHaveBeenCalledWith("notes");
    expect(chain.update).toHaveBeenCalledWith({ deleted_at: null });
    expect(chain.eq).toHaveBeenCalledWith("id", NOTE_ID);
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(configured.getState().notes.notes[NOTE_ID]).toMatchObject({
      id: NOTE_ID,
      label: "Back",
      deleted_at: null,
    });
  });

  it("rejects and stores nothing when the restore is refused", async () => {
    const configured = store([]);
    const chain = query({ data: null, error: { message: "row level security" } });
    schema.mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

    const result = await configured.dispatch(restoreNote(NOTE_ID));

    expect(restoreNote.rejected.match(result)).toBe(true);
    expect(configured.getState().notes.notes[NOTE_ID]).toBeUndefined();
  });
});

describe("permanentlyDeleteNoteThunk", () => {
  it("hard-deletes that note and takes it off the screen", async () => {
    const configured = store([note(), note({ id: OTHER_NOTE_ID })]);
    permanentlyDeleteNote.mockResolvedValue(undefined);

    const result = await configured.dispatch(permanentlyDeleteNoteThunk(NOTE_ID));

    expect(permanentlyDeleteNoteThunk.fulfilled.match(result)).toBe(true);
    expect(permanentlyDeleteNote).toHaveBeenCalledWith(NOTE_ID);
    expect(configured.getState().notes.notes[NOTE_ID]).toBeUndefined();
    expect(configured.getState().notes.notes[OTHER_NOTE_ID]).toBeDefined();
  });

  it("leaves the note on screen when the hard delete fails", async () => {
    const configured = store();
    permanentlyDeleteNote.mockRejectedValue(new Error("not the owner"));

    const result = await configured.dispatch(permanentlyDeleteNoteThunk(NOTE_ID));

    expect(permanentlyDeleteNoteThunk.rejected.match(result)).toBe(true);
    expect(configured.getState().notes.notes[NOTE_ID]).toBeDefined();
  });
});

describe("emptyTrashThunk", () => {
  it("drops only the soft-deleted notes from the store and reports how many rows went", async () => {
    const configured = store([
      note({ id: NOTE_ID, deleted_at: "2026-09-13T00:00:00.000Z" }),
      note({ id: OTHER_NOTE_ID, deleted_at: null }),
    ]);
    emptyTrash.mockResolvedValue(1);

    const result = await configured.dispatch(emptyTrashThunk());

    expect(emptyTrashThunk.fulfilled.match(result)).toBe(true);
    expect(result.payload).toBe(1);
    expect(configured.getState().notes.notes[NOTE_ID]).toBeUndefined();
    // The live note is the whole point: a sweep that took it would be data loss.
    expect(configured.getState().notes.notes[OTHER_NOTE_ID]).toBeDefined();
  });

  it("touches nothing when the trash was already empty", async () => {
    const configured = store([
      note({ id: NOTE_ID, deleted_at: "2026-09-13T00:00:00.000Z" }),
    ]);
    emptyTrash.mockResolvedValue(0);

    const result = await configured.dispatch(emptyTrashThunk());

    expect(result.payload).toBe(0);
    expect(configured.getState().notes.notes[NOTE_ID]).toBeDefined();
  });
});

describe("fetchSharedNotesList", () => {
  const sharedRow = (overrides: Record<string, unknown> = {}) => ({
    id: OTHER_NOTE_ID,
    label: "Shared plan",
    folder_name: "Shared",
    tags: [],
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    organization_id: ORG,
    project_id: null,
    task_id: null,
    visibility: "personal",
    version: 3,
    created_by: "user-2",
    permission_level: "editor",
    owner_email: "owner@example.com",
    ...overrides,
  });

  it("lands each shared row with the owner and permission the RPC reported", async () => {
    const configured = store([]);
    rpc.mockResolvedValue({ data: [sharedRow()], error: null });

    const result = await configured.dispatch(fetchSharedNotesList());

    expect(fetchSharedNotesList.fulfilled.match(result)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_notes_shared_with_me");
    expect(configured.getState().notes.notes[OTHER_NOTE_ID]).toMatchObject({
      _sharedWithMe: true,
      _sharedMeta: {
        permissionLevel: "editor",
        ownerEmail: "owner@example.com",
      },
    });
  });

  it("drops a slow earlier result so it cannot overwrite a newer fetch", async () => {
    const configured = store([]);
    let releaseFirst: ((value: unknown) => void) | undefined;
    rpc.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = resolve; }),
    );
    rpc.mockImplementationOnce(async () => ({
      data: [sharedRow({ label: "Newer answer" })],
      error: null,
    }));

    const first = configured.dispatch(fetchSharedNotesList());
    await configured.dispatch(fetchSharedNotesList());
    releaseFirst?.({
      data: [sharedRow({ label: "Stale answer" })],
      error: null,
    });
    await first;

    // The second fetch's answer is the one on screen. Without the seq guard the
    // late first result lands last and the list silently goes backwards.
    expect(configured.getState().notes.notes[OTHER_NOTE_ID].label).toBe(
      "Newer answer",
    );
  });

  it("removes a revoked share but keeps one with unsaved edits", async () => {
    const configured = store([]);
    rpc.mockResolvedValue({ data: [sharedRow()], error: null });
    await configured.dispatch(fetchSharedNotesList());

    // A second sharee's note, revoked while the user was typing in it.
    const dirtyId = "88888888-8888-4888-8888-888888888888";
    configured.dispatch(
      upsertNoteFromServer({
        note: note({ id: dirtyId, created_by: "user-2" }),
        fetchStatus: "full",
        sharedMeta: { permissionLevel: "editor", ownerEmail: "o@example.com" },
      }),
    );
    configured.dispatch({
      type: "notes/setNoteField",
      payload: { id: dirtyId, field: "content", value: "half-typed" },
    });
    expect(configured.getState().notes.notes[dirtyId]._dirty).toBe(true);

    rpc.mockResolvedValue({ data: [], error: null });
    await configured.dispatch(fetchSharedNotesList());

    expect(configured.getState().notes.notes[OTHER_NOTE_ID]).toBeUndefined();
    expect(configured.getState().notes.notes[dirtyId]).toMatchObject({
      content: "half-typed",
    });
  });
});
