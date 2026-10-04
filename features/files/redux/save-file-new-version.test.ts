/**
 * Saving an edited file writes the NEXT VERSION of that SAME file — never a second file —
 * by FILE ID (`POST /files/{id}/versions`), the same way for the owner and for an editor
 * holding an edit grant on a file someone else owns.
 *
 * History: 2026-09-30 the editor re-uploaded through a path-keyed door whose collision
 * rename turned "notes.txt" into "notes (1).txt" (a second row, original stuck at v1,
 * UI said "Saved"). Then saves of a SHARED file were refused because the path door
 * resolves under the uploader. The id-keyed door fixes both.
 *
 * Breaks guarded:
 *   1. the editor save seam (`writeAny` on a stored file) keeps the file id, bumps the
 *      version, adds no row;
 *   2. two saves in a row are versions 2 and 3 of one file;
 *   3. the request is keyed by the file id and carries NO derived path;
 *   4. a file owned by SOMEONE ELSE saves through the very same call (no branch, no
 *      refusal) and the change summary rides along;
 *   5. an answer naming a different row (or `is_new`) is REFUSED, never "Saved".
 */

import { configureStore } from "@reduxjs/toolkit";

type UploadCall = { fileId: string; body: string; changeSummary?: string; keys: string[] };
const uploads: UploadCall[] = [];
// id -> the service's row, keyed the way the by-id door looks it up.
const serverRows = new Map<string, { version: number }>();
let forceForeignAnswer = false;

jest.mock("@/features/files/api/files", () => ({
  uploadNewVersion: async (
    fileId: string,
    p: { file: File; changeSummary?: string },
  ) => {
    const body = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(p.file);
    });
    uploads.push({
      fileId,
      body,
      changeSummary: p.changeSummary,
      keys: Object.keys(p).sort(),
    });
    const row = serverRows.get(fileId);
    if (!row) throw new Error("not found");
    row.version += 1;
    return {
      data: {
        file_id: forceForeignAnswer ? "some-other-file" : fileId,
        file_path: "Docs/notes.txt",
        version_number: row.version,
        size_bytes: p.file.size,
        checksum: `sha-${body.length}`,
        url: null,
        is_new: forceForeignAnswer,
      },
      meta: {},
    };
  },
  getFileMetadata: jest.fn(),
}));

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

jest.mock("@/features/files/filesDb", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    filesDb: () => ({ from: () => chain }),
    FILE_VERSIONS_TABLE_COLUMNS: "*",
  };
});

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

import { cloudFilesReducer, upsertFile, upsertFolder } from "./slice";
import { saveFileNewVersion } from "./thunks";
import { writeAny } from "./virtual-thunks";

const FILE_ID = "file-original";
const FOLDER_ID = "folder-docs";
const SHARED_ID = "file-owned-by-someone-else";

function makeStore({ folderLoaded = false }: { folderLoaded?: boolean } = {}) {
  const store = configureStore({
    reducer: {
      cloudFiles: cloudFilesReducer,
      // writeAny's state type reads `userAuth` for virtual sources.
      userAuth: (state: { id?: string | null } = { id: "user-1" }) => state,
    },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    upsertFile({
      id: FILE_ID,
      ownerId: "user-1",
      fileName: "notes.txt",
      filePath: "Docs/notes.txt",
      mimeType: "text/plain",
      currentVersion: 1,
      // The folder is NOT loaded in this view — the old path fell back to an
      // empty prefix and uploaded to the root under a new name.
      parentFolderId: FOLDER_ID,
      visibility: "personal",
      deletedAt: null,
    }),
  );
  if (folderLoaded) {
    store.dispatch(
      upsertFolder({ id: FOLDER_ID, folderPath: "Docs", folderName: "Docs", deletedAt: null }),
    );
  }
  return store;
}

/**
 * `writeAny` is typed against the app's full `AppDispatch`; this test store holds only the
 * slices the save path reads. The thunk itself runs unchanged — only the dispatch type is
 * narrowed to the one action it receives.
 */
function dispatchWriteAny(
  store: ReturnType<typeof makeStore>,
  action: ReturnType<typeof writeAny>,
): ReturnType<ReturnType<typeof writeAny>> {
  const dispatch = store.dispatch as unknown as (
    a: ReturnType<typeof writeAny>,
  ) => ReturnType<ReturnType<typeof writeAny>>;
  return dispatch(action);
}

function liveFileIds(store: ReturnType<typeof makeStore>): string[] {
  return Object.values(store.getState().cloudFiles.filesById)
    .flatMap((f) => (f && !f.deletedAt ? [f.id] : []));
}

beforeEach(() => {
  uploads.length = 0;
  serverRows.clear();
  serverRows.set(FILE_ID, { version: 1 });
  serverRows.set(SHARED_ID, { version: 1 });
  forceForeignAnswer = false;
});

describe("saving an edited file", () => {
  it("the editor save seam writes version 2 of the SAME file, no second row", async () => {
    const store = makeStore();

    await dispatchWriteAny(store, writeAny({ id: FILE_ID, content: "edited once" })).unwrap();

    expect(uploads).toHaveLength(1);
    expect(uploads[0].fileId).toBe(FILE_ID);
    expect(uploads[0].body).toBe("edited once");
    expect(liveFileIds(store)).toEqual([FILE_ID]);
    expect(serverRows.size).toBe(2);
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.currentVersion).toBe(2);
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.fileName).toBe("notes.txt");
  });

  it("with the folder loaded (the live repro) the save is still version 2, never \"notes (1).txt\"", async () => {
    const store = makeStore({ folderLoaded: true });

    await dispatchWriteAny(store, writeAny({ id: FILE_ID, content: "edited" })).unwrap();

    expect(uploads.map((u) => u.fileId)).toEqual([FILE_ID]);
    expect(liveFileIds(store)).toEqual([FILE_ID]);
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.currentVersion).toBe(2);
  });

  it("two saves are versions 2 and 3 of one file", async () => {
    const store = makeStore();

    const first = await store
      .dispatch(saveFileNewVersion({ fileId: FILE_ID, content: "one" }))
      .unwrap();
    const second = await store
      .dispatch(saveFileNewVersion({ fileId: FILE_ID, content: "two" }))
      .unwrap();

    expect(first).toEqual({ fileId: FILE_ID, versionNumber: 2 });
    expect(second).toEqual({ fileId: FILE_ID, versionNumber: 3 });
    expect(uploads.every((u) => u.fileId === FILE_ID)).toBe(true);
    // keyed by id: the request carries the bytes and the summary, never a path
    expect(uploads.every((u) => u.keys.join() === "changeSummary,file")).toBe(true);
    expect(liveFileIds(store)).toEqual([FILE_ID]);
  });

  it("saves a file someone else owns through the same call, with the change summary", async () => {
    const store = makeStore();
    // A row shared with me: owned by another person, hydrated without its path.
    store.dispatch(
      upsertFile({
        id: SHARED_ID,
        ownerId: "someone-else",
        fileName: "plan.md",
        filePath: undefined as unknown as string,
        mimeType: "text/markdown",
        currentVersion: 1,
        visibility: "shared",
        deletedAt: null,
      }),
    );

    const result = await store
      .dispatch(
        saveFileNewVersion({
          fileId: SHARED_ID,
          content: "# plan v2",
          changeSummary: "Tightened the plan",
        }),
      )
      .unwrap();

    expect(result).toEqual({ fileId: SHARED_ID, versionNumber: 2 });
    expect(uploads).toEqual([
      expect.objectContaining({
        fileId: SHARED_ID,
        body: "# plan v2",
        changeSummary: "Tightened the plan",
      }),
    ]);
    expect(store.getState().cloudFiles.filesById[SHARED_ID]?.currentVersion).toBe(2);
  });

  it("refuses an answer that names a different row — never reports Saved", async () => {
    const store = makeStore();
    forceForeignAnswer = true;

    await expect(
      store
        .dispatch(saveFileNewVersion({ fileId: FILE_ID, content: "x" }))
        .unwrap(),
    ).rejects.toMatchObject({ message: expect.stringMatching(/did not update it/) });
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.currentVersion).toBe(1);
  });
});
