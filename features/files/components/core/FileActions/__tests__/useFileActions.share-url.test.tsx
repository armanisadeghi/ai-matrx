/**
 * @jest-environment jsdom
 *
 * Getting a file's URL and copying it are two things. Duplicate only needs the URL to fetch the
 * bytes, so a refused clipboard (the kit copy resolves `false`; it never throws) must never stop
 * it — AP-2 regression: `copyShareUrl` returned null when the copy failed and Duplicate silently
 * did nothing. A refused copy of a share link shows the link for a manual copy.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copyText = jest.fn<Promise<boolean>, [string]>();
const showManualCopy = jest.fn();
jest.mock("@ai-matrx/kit/clipboard", () => ({ useClipboard: () => ({ copyText }) }));
jest.mock("@ai-matrx/kit/download", () => ({ downloadFile: jest.fn() }));
jest.mock("@/components/dialogs/clipboard-fallback/manualCopyOpener", () => ({
  showManualCopy: (...a: unknown[]) => showManualCopy(...a),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
const file = { id: "f1", fileName: "a.png", visibility: "private", publicUrl: null, source: { kind: "cloud" } };
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: { type: string }) => ({
    unwrap: async () => (action.type === "getFileUrl" ? { url: "https://signed.example/a.png" } : {}),
  }),
  useAppSelector: (selector: (s: unknown) => unknown) => selector({}),
  useAppStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/features/files/redux/thunks", () => ({
  createShareLink: () => ({ type: "createShareLink" }),
  deleteFile: () => ({ type: "deleteFile" }),
  getFileUrl: () => ({ type: "getFileUrl" }),
  loadShareLinks: () => ({ type: "loadShareLinks" }),
  moveFile: () => ({ type: "moveFile" }),
  renameFile: () => ({ type: "renameFile" }),
  restoreVersion: () => ({ type: "restoreVersion" }),
  updateFileMetadata: () => ({ type: "updateFileMetadata" }),
}));
jest.mock("@/features/files/redux/virtual-thunks", () => ({
  deleteAny: jest.fn(),
  moveAny: jest.fn(),
  renameAny: jest.fn(),
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectFileById: () => file,
  selectActiveShareLinksForResource: () => [{ permissionLevel: "viewer", shareToken: "tok123" }],
}));
jest.mock("@/features/files/virtual-sources/path", () => ({ isSyntheticId: () => false }));
jest.mock("@/features/files/api/files", () => ({ getFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock("@/features/files/handler/utils/python-base", () => ({
  pythonShareUrl: (token: string) => `https://py.example/share/${token}`,
}));
jest.mock("@/features/files/redux/converters", () => ({ apiFileRecordToCloudFile: jest.fn() }));

import { useFileActions, type FileActionHandlers } from "../useFileActions";

let actions: FileActionHandlers;
function Harness() {
  actions = useFileActions("f1");
  return null;
}
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  copyText.mockReset();
  showManualCopy.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(() => act(() => root.unmount()));

it("resolves the fetchable URL for Duplicate without touching the clipboard", async () => {
  copyText.mockResolvedValue(false);
  await expect(actions.resolveShareUrl({ fetchable: true })).resolves.toBe("https://signed.example/a.png");
  expect(copyText).not.toHaveBeenCalled();
});

it("puts the share link in front of the person when the clipboard refuses", async () => {
  copyText.mockResolvedValue(false);
  await expect(actions.copyShareUrl()).resolves.toBeNull();
  expect(showManualCopy).toHaveBeenCalledWith(
    expect.objectContaining({ text: "https://py.example/share/tok123" }),
  );
});

it("returns the link it copied when the copy landed", async () => {
  copyText.mockResolvedValue(true);
  await expect(actions.copyShareUrl()).resolves.toBe("https://py.example/share/tok123");
  expect(showManualCopy).not.toHaveBeenCalled();
});
