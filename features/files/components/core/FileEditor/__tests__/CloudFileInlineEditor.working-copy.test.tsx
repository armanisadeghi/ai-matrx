/**
 * The file editor is a VIEW of the file's one working copy in the store.
 *
 * SUT: the real `CloudFileInlineEditor` over the real cloudFiles slice and THE
 * working-copy primitive (`lib/working-copy`: the workingCopies slice, the
 * `file` kind's one save path), the real `useFileWorkingCopy` / `useFileBlob`
 * / blob cache and the real `saveFileNewVersion` thunk. The stand-ins are the service boundary only —
 * the files API (download / upload-new-version), the IndexedDB and
 * service-worker cache tiers — and Monaco itself (a textarea per view that
 * reports typing the way Monaco's onChange does).
 *
 * Breaks it catches (each was live):
 *   - the typed text lived in the editor component's state, so a second view
 *     of the file showed other text, and a remount while the save was still
 *     in flight showed the OLD bytes;
 *   - a save dropped the cached bytes, so every view downloaded back what it
 *     had just uploaded, and every remount downloaded again;
 *   - leaving (hide, unmount, pagehide) saved once per view, or never;
 *   - unsaved text was gone after a reload when the leaving save failed.
 */
import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── The files service: one stored text per file, versioned ────────────────
const server = new Map<string, { text: string; version: number; path: string }>();
const downloads: string[] = [];
const uploads: Array<{ fileId: string; text: string }> = [];
let holdUploads: Array<() => void> | null = null;
let failUploads = false;

async function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

jest.mock("@/features/files/api/files", () => ({
  downloadFileWithProgress: async (fileId: string) => {
    downloads.push(fileId);
    const row = server.get(fileId);
    if (!row) throw new Error("not found");
    return { blob: new Blob([row.text], { type: "text/markdown" }), filename: null, meta: {} };
  },
  uploadNewVersion: async (fileId: string, p: { file: File; filePath: string }) => {
    const text = await readText(p.file);
    if (holdUploads) await new Promise<void>((resolve) => holdUploads!.push(resolve));
    if (failUploads) throw new Error("The files service is unreachable");
    uploads.push({ fileId, text });
    const row = server.get(fileId)!;
    row.text = text;
    row.version += 1;
    return {
      data: {
        file_id: fileId,
        file_path: row.path,
        version_number: row.version,
        size_bytes: text.length,
        checksum: `sha-${text.length}`,
        url: null,
        is_new: false,
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
  return { filesDb: () => ({ from: () => chain }), FILE_VERSIONS_TABLE_COLUMNS: "*" };
});
jest.mock("@/features/files/cache/idb-store", () => ({
  deleteEntriesForFile: jest.fn(async () => undefined),
  clearForUser: jest.fn(async () => undefined),
  getEntry: jest.fn(async () => null),
  putEntry: jest.fn(async () => undefined),
  openBlobCacheDb: jest.fn(async () => null),
}));
jest.mock("@/features/files/cache/register-service-worker", () => ({
  postBlobCacheInvalidate: jest.fn(async () => undefined),
  postBlobCacheClearUser: jest.fn(async () => undefined),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

// ── Monaco: one textarea per view, reporting typing like Monaco's onChange ──
const views: Array<{ path: string; type: (next: string) => void }> = [];
jest.mock("next/dynamic", () => () =>
  function MonacoStub(props: { value: string; path: string; onChange: (next: string) => void }) {
    views.push({ path: props.path, type: props.onChange });
    return <textarea readOnly value={props.value} data-testid="editor-view" />;
  },
);
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/files/components/surfaces/FileViewerControlsContext", () => ({
  useFileViewerControls: () => null,
}));

import { cloudFilesReducer, upsertFile } from "@/features/files/redux/slice";
import workingCopiesReducer from "@/lib/working-copy/workingCopySlice";
import { CloudFileInlineEditor } from "../CloudFileInlineEditor";

let objectUrls = 0;
beforeAll(() => {
  // jsdom gaps every browser fills: Blob#text and object URLs.
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return readText(this);
    };
  }
  Object.assign(URL, {
    createObjectURL: () => `blob:test/${++objectUrls}`,
    revokeObjectURL: () => undefined,
  });
});

function makeStore(fileId: string) {
  const store = configureStore({
    reducer: { cloudFiles: cloudFilesReducer, workingCopies: workingCopiesReducer },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const row = server.get(fileId)!;
  store.dispatch(
    upsertFile({
      id: fileId,
      ownerId: "user-1",
      fileName: "unit-4b-move-in.md",
      filePath: row.path,
      mimeType: "text/markdown",
      currentVersion: row.version,
      visibility: "personal",
      deletedAt: null,
    }),
  );
  return store;
}

const ORIGINAL = "# Unit 4B move-in\n\n- Keys: 2 front, 1 mailbox";
const TYPED = `${ORIGINAL}\n- Garage remote handed over`;

let fileCounter = 0;
function newFile(): string {
  const id = `file-${++fileCounter}`;
  server.set(id, { text: ORIGINAL, version: 1, path: `Turnovers/${id}.md` });
  return id;
}

let root: Root;
let host: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function app(children: ReactNode) {
  return <Provider store={store}>{children}</Provider>;
}

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

async function show(ui: ReactNode) {
  await act(async () => root.render(app(ui)));
  await settle();
}

const shown = () =>
  Array.from(host.querySelectorAll<HTMLTextAreaElement>("[data-testid=editor-view]")).map((v) => v.value);
const lastView = () => views[views.length - 1];
const copyOf = (fileId: string) => store.getState().workingCopies.byKey[`file:${fileId}`];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  downloads.length = 0;
  uploads.length = 0;
  views.length = 0;
  holdUploads = null;
  failUploads = false;
  window.sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  await settle(); // let a leaving save land before the next case counts
  host.remove();
});

it("two views of one file edit ONE copy, from one download", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(
    <>
      <CloudFileInlineEditor fileId={fileId} />
      <CloudFileInlineEditor fileId={fileId} />
    </>,
  );
  expect(shown()).toEqual([ORIGINAL, ORIGINAL]);

  await act(async () => lastView().type(TYPED));
  await settle();

  expect(shown()).toEqual([TYPED, TYPED]);
  expect(copyOf(fileId)?.value).toBe(TYPED);
  expect(downloads).toEqual([fileId]);
});

it("hide, show and a full remount keep the typed text; one save, and nothing is downloaded again", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  const editor = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <CloudFileInlineEditor fileId={fileId} />
    </Activity>
  );
  await show(editor("visible"));
  await act(async () => lastView().type(TYPED));
  await settle();

  await show(editor("hidden")); // a sleeping tile: leaving saves once
  await show(editor("visible"));
  expect(shown()).toEqual([TYPED]);
  expect(host.textContent).not.toContain("Unsaved changes");

  await show(null); // the tile is discarded …
  await show(editor("visible")); // … and mounted again
  expect(shown()).toEqual([TYPED]);

  await show(editor("hidden")); // a second sleep saves nothing new
  await show(editor("visible"));
  expect(uploads).toEqual([{ fileId, text: TYPED }]);
  expect(downloads).toEqual([fileId]);
  expect(copyOf(fileId)?.baseVersion).toBe(2);
});

it("a remount while the save is still in flight shows the typed text, never the old bytes", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(<CloudFileInlineEditor fileId={fileId} />);
  await act(async () => lastView().type(TYPED));
  holdUploads = [];
  await show(null); // leaving starts the save; the service has not answered
  await show(<CloudFileInlineEditor fileId={fileId} />);
  expect(shown()).toEqual([TYPED]);

  const release = holdUploads;
  holdUploads = null;
  await act(async () => release.forEach((go) => go()));
  await settle();
  expect(uploads).toEqual([{ fileId, text: TYPED }]);
  expect(shown()).toEqual([TYPED]);
  expect(host.textContent).not.toContain("Unsaved changes");
});

it("pagehide from two views saves once", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(
    <>
      <CloudFileInlineEditor fileId={fileId} />
      <CloudFileInlineEditor fileId={fileId} />
    </>,
  );
  await act(async () => lastView().type(TYPED));
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await settle();
  await show(null);
  expect(uploads).toEqual([{ fileId, text: TYPED }]);
});

it("unsaved text survives a reload when the leaving save could not reach the service", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(<CloudFileInlineEditor fileId={fileId} />);
  await act(async () => lastView().type(TYPED));
  failUploads = true;
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await settle();
  await show(null);

  // The reload: a fresh store, the same tab.
  failUploads = false;
  store = makeStore(fileId);
  await show(<CloudFileInlineEditor fileId={fileId} />);
  expect(shown()).toEqual([TYPED]);
  expect(host.textContent).toContain("Unsaved changes");
});

it("nothing typed means nothing saved", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(<CloudFileInlineEditor fileId={fileId} />);
  await show(null);
  expect(uploads).toEqual([]);
});

it("a new version from elsewhere shows when nothing is unsaved, and never replaces unsaved text", async () => {
  const fileId = newFile();
  store = makeStore(fileId);
  await show(<CloudFileInlineEditor fileId={fileId} />);

  // Another device saves version 2.
  server.set(fileId, { ...server.get(fileId)!, text: "Changed on the office laptop", version: 2 });
  await act(async () => {
    store.dispatch(upsertFile({ id: fileId, currentVersion: 2 }));
  });
  await settle();
  expect(shown()).toEqual(["Changed on the office laptop"]);

  await act(async () => lastView().type(TYPED));
  server.set(fileId, { ...server.get(fileId)!, text: "Changed again on the phone", version: 3 });
  await act(async () => {
    store.dispatch(upsertFile({ id: fileId, currentVersion: 3 }));
  });
  await settle();
  expect(shown()).toEqual([TYPED]);
  expect(host.textContent).toContain("Unsaved changes");
  expect(copyOf(fileId)?.base).toBe("Changed again on the phone");
  expect(downloads).toEqual([fileId, fileId, fileId]);
});
