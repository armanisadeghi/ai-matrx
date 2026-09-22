/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StorageSourcePickerWindow } from "@/features/window-panels/windows/files/StorageSourcePickerWindow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockAccounts = jest.fn();
const mockBrowse = jest.fn();
const mockImport = jest.fn();
const mockDeliver = jest.fn();
const mockDispose = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/features/files/storage-sources/inventory", () => ({
  loadStoragePickerAccounts: (...args: unknown[]) => mockAccounts(...args),
}));
jest.mock("@/features/files/storage-sources/service", () => ({
  STORAGE_BROWSE_PAGE_SIZE_KNOB: { feature: "files.storage_sources", key: "browse_page_size" },
  browseStorageSource: (...args: unknown[]) => mockBrowse(...args),
  importStorageSourceFiles: (...args: unknown[]) => mockImport(...args),
  safeStorageBasename: (name: string) => name || null,
}));
jest.mock("@/features/overlays/callbacks/storageSourcePicker", () => ({
  deliverStorageSourceImports: (...args: unknown[]) => mockDeliver(...args),
  disposeStorageSourcePickerCallbackGroup: (...args: unknown[]) => mockDispose(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ __test: true }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "org-1",
}));
// The picker resolves `files.storage_sources.browse_page_size` before it
// browses; the register itself is not what this test measures.
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: async () => 50,
  useEffectiveKnob: () => 50,
}));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
    <div>{children}<button onClick={onClose}>Window close</button></div>
  ),
}));
jest.mock("@/features/settings/doors/SettingDoor", () => ({
  SettingDoor: ({ label }: { label: string }) => <button>{label}</button>,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts.mockResolvedValue([
    {
      id: "connection-1",
      provider: "onedrive",
      label: "Work drive",
      email: "reader@example.com",
    },
  ]);
  mockDeliver.mockResolvedValue(undefined);
  mockBrowse.mockImplementation(async (args: { folderRef?: string | null; cursor?: string | null }) => {
    if (args.folderRef === "folder-1") {
      return {
        provider: "onedrive",
        connection_id: "connection-1",
        folder_ref: "folder-1",
        items: [{ kind: "file", item_ref: "inside", name: "inside.txt", mime_type: "text/plain" }],
        next_cursor: null,
      };
    }
    return {
      provider: "onedrive",
      connection_id: "connection-1",
      folder_ref: null,
      items: args.cursor
        ? [
            { kind: "file", item_ref: "file-a", name: "a.txt", mime_type: "text/plain" },
            { kind: "file", item_ref: "file-b", name: "b.txt", mime_type: "text/plain" },
          ]
        : [
            { kind: "folder", item_ref: "folder-1", name: "Folder" },
            { kind: "file", item_ref: "file-a", name: "a.txt", mime_type: "text/plain" },
          ],
      next_cursor: args.cursor ? null : "cursor-2",
    };
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderPicker(onClose = jest.fn()) {
  await act(async () => {
    root.render(
      <StorageSourcePickerWindow
        isOpen
        onClose={onClose}
        callbackGroupId="callback-1"
        destinationFolderPath="My Files/Imports"
      />,
    );
  });
}

function canonical(fileId: string, name: string) {
  return {
    fileId,
    filePath: `My Files/Imports/${name}`,
    checksum: null,
    versionNumber: 1,
    created: true,
    source: { provider: "dropbox", connection_id: "connection-1", source_ref: fileId },
    file: { id: fileId, fileName: name, parentFolderId: "folder-id" },
  };
}

function button(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((node) =>
    (node.textContent ?? "").includes(text),
  );
  if (!match) throw new Error(`No button containing ${text}`);
  return match as HTMLButtonElement;
}

test("root browse, cursor append/dedup, folder drill-in and breadcrumb back use opaque refs", async () => {
  await renderPicker();
  expect(container.textContent).toContain("a.txt");

  await act(async () => button("Load 50 more").click());
  expect(container.textContent?.match(/a\.txt/g)).toHaveLength(1);
  expect(container.textContent).toContain("b.txt");
  expect(mockBrowse).toHaveBeenCalledWith(
    expect.objectContaining({ cursor: "cursor-2", folderRef: null }),
  );

  await act(async () => button("Folder").click());
  expect(container.textContent).toContain("inside.txt");
  expect(mockBrowse).toHaveBeenCalledWith(
    expect.objectContaining({ folderRef: "folder-1" }),
  );

  await act(async () => button("Files").click());
  expect(container.textContent).toContain("a.txt");
});

test("an empty eligible account list points to Integrations and offers Retry", async () => {
  mockAccounts.mockResolvedValue([]);
  await renderPicker();
  expect(container.textContent).toContain("No eligible OneDrive account");
  expect(button("Open Integrations")).toBeTruthy();
  expect(button("Retry")).toBeTruthy();
  expect(mockBrowse).not.toHaveBeenCalled();
});

test("a late response from the prior provider cannot replace the active account listing", async () => {
  let releaseOneDrive!: (value: unknown) => void;
  const oneDrivePage = new Promise((resolve) => { releaseOneDrive = resolve; });
  mockAccounts.mockResolvedValue([
    { id: "connection-1", provider: "onedrive", label: "Work drive", email: null },
    { id: "connection-2", provider: "dropbox", label: "Dropbox", email: null },
  ]);
  mockBrowse.mockImplementation((args: { provider: string }) => {
    if (args.provider === "onedrive") return oneDrivePage;
    return Promise.resolve({
      provider: "dropbox",
      connection_id: "connection-2",
      folder_ref: null,
      items: [{ kind: "file", item_ref: "dropbox-file", name: "dropbox.txt", mime_type: "text/plain" }],
      next_cursor: null,
    });
  });
  await renderPicker();
  await act(async () => button("Dropbox").click());
  expect(container.textContent).toContain("dropbox.txt");

  await act(async () => releaseOneDrive({
    provider: "onedrive",
    connection_id: "connection-1",
    folder_ref: null,
    items: [{ kind: "file", item_ref: "stale", name: "stale.txt", mime_type: "text/plain" }],
    next_cursor: null,
  }));
  expect(container.textContent).toContain("dropbox.txt");
  expect(container.textContent).not.toContain("stale.txt");
});

test("acknowledged canonical imports update Files, dispose the callback, and close", async () => {
  const onClose = jest.fn();
  mockImport.mockResolvedValue({ files: [canonical("canonical-a", "a.txt")], failures: [] });
  await renderPicker(onClose);

  const checkbox = container.querySelector('[aria-label="Select a.txt"]') as HTMLButtonElement;
  await act(async () => checkbox.click());
  await act(async () => button("Import 1").click());

  expect(mockDeliver).toHaveBeenCalledWith("callback-1", [expect.objectContaining({ fileId: "canonical-a" })]);
  expect(mockDispatch).toHaveBeenCalledTimes(2);
  expect(mockDispose).toHaveBeenCalledWith("callback-1");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("cancel during flight waits for delivery, stops the next import, then closes", async () => {
  let releaseImport!: (value: unknown) => void;
  const firstImport = new Promise((resolve) => { releaseImport = resolve; });
  mockImport.mockReturnValueOnce(firstImport);
  const onClose = jest.fn();
  await renderPicker(onClose);
  await act(async () => button("Load 50 more").click());

  for (const name of ["a.txt", "b.txt"]) {
    const checkbox = container.querySelector(`[aria-label="Select ${name}"]`) as HTMLButtonElement;
    await act(async () => checkbox.click());
  }
  await act(async () => button("Import 2").click());
  await act(async () => button("Cancel after current file").click());
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => releaseImport({ files: [canonical("canonical-a", "a.txt")], failures: [] }));
  expect(mockImport).toHaveBeenCalledTimes(1);
  expect(mockDeliver).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
