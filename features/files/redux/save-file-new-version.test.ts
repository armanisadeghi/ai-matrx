/**
 * Saving an edited file writes the NEXT VERSION of that SAME file — never a second file.
 *
 * The 2026-09-30 defect (browser walk): open a text file, Edit tab, type, Save. The editor
 * re-uploaded through `uploadFiles`, whose Drive-style collision rename turned the taken
 * name "notes.txt" into "notes (1).txt". The files service saw a NEW path, created a
 * second row, the original stayed at version 1, and the UI said "Saved".
 *
 * The fake below is the files service's own rule (matrx-utils `managed_write_async`): an
 * upload to a path that already holds a row version-bumps THAT row; any other path is a
 * brand-new row. So a caller that derives or renames the path goes red here exactly the
 * way it went wrong live.
 *
 * Breaks guarded:
 *   1. the editor save seam (`writeAny` on a stored file, the same dispatch the Edit-tab
 *      editors make) keeps the file id, bumps the version, adds no row — whether the
 *      folder is loaded (old path: "notes (1).txt") or not (old path: "notes.txt" at root);
 *   2. two saves in a row are versions 2 and 3 of one file;
 *   3. the request carries the file's exact stored path, not one built from its folder;
 *   4. an answer naming a different row (or `is_new`) is REFUSED, never "Saved".
 */

import { configureStore } from "@reduxjs/toolkit";

type UploadCall = { fileId: string | null; filePath: string; body: string };
const uploads: UploadCall[] = [];
// path → { id, version } — the service's rows, keyed the way it looks them up.
const serverRows = new Map<string, { id: string; version: number }>();
let forceForeignAnswer = false;

function fakeServerWrite(filePath: string) {
  const existing = serverRows.get(filePath);
  if (existing && !forceForeignAnswer) {
    existing.version += 1;
    return { id: existing.id, version: existing.version, isNew: false };
  }
  const id = `new-${serverRows.size + 1}`;
  serverRows.set(filePath, { id, version: 1 });
  return { id, version: 1, isNew: true };
}

async function answer(fileId: string | null, file: File, filePath: string) {
  const body = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
  uploads.push({ fileId, filePath, body });
  const w = fakeServerWrite(filePath);
  return {
    data: {
      file_id: w.id,
      file_path: filePath,
      version_number: w.version,
      size_bytes: file.size,
      checksum: `sha-${body.length}`,
      url: null,
      is_new: w.isNew,
    },
    meta: {},
  };
}

jest.mock("@/features/files/api/files", () => ({
  uploadFileWithProgress: (p: { file: File; filePath: string }) =>
    answer(null, p.file, p.filePath),
  uploadFile: (p: { file: File; filePath: string }) =>
    answer(null, p.file, p.filePath),
  uploadNewVersion: (fileId: string, p: { file: File; filePath: string }) =>
    answer(fileId, p.file, p.filePath),
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
  serverRows.set("Docs/notes.txt", { id: FILE_ID, version: 1 });
  forceForeignAnswer = false;
});

describe("saving an edited file", () => {
  it("the editor save seam writes version 2 of the SAME file, no second row", async () => {
    const store = makeStore();

    await dispatchWriteAny(store, writeAny({ id: FILE_ID, content: "edited once" })).unwrap();

    expect(uploads).toHaveLength(1);
    expect(uploads[0].filePath).toBe("Docs/notes.txt");
    expect(uploads[0].body).toBe("edited once");
    expect(liveFileIds(store)).toEqual([FILE_ID]);
    expect(serverRows.size).toBe(1);
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.currentVersion).toBe(2);
    expect(store.getState().cloudFiles.filesById[FILE_ID]?.fileName).toBe("notes.txt");
  });

  it("with the folder loaded (the live repro) the save is still version 2, never \"notes (1).txt\"", async () => {
    const store = makeStore({ folderLoaded: true });

    await dispatchWriteAny(store, writeAny({ id: FILE_ID, content: "edited" })).unwrap();

    expect(uploads.map((u) => u.filePath)).toEqual(["Docs/notes.txt"]);
    expect(serverRows.size).toBe(1);
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
    expect(uploads.map((u) => u.filePath)).toEqual([
      "Docs/notes.txt",
      "Docs/notes.txt",
    ]);
    expect(uploads.every((u) => u.fileId === FILE_ID)).toBe(true);
    expect(serverRows.size).toBe(1);
    expect(liveFileIds(store)).toEqual([FILE_ID]);
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
