import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const preventDefault = jest.fn();
const mockOpenGoogle = jest.fn();
const mockOpenStorage = jest.fn();
const mockDispatch = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button type="button" onClick={() => onSelect?.({ preventDefault })}>
      {children}
    </button>
  ),
}));

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: { connections: [] },
    isLoading: false,
  }),
}));

jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => mockOpenGoogle,
}));

jest.mock("@/features/overlays/openers/storageSourcePicker", () => ({
  useOpenStorageSourcePicker: () => mockOpenStorage,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => ({
    "folder-1": { folderPath: "My Files/Projects" },
  }),
}));

jest.mock("@/features/files/redux/selectors", () => ({
  selectAllFoldersMap: jest.fn(),
}));

import { FileAcquisitionActions } from "./FileAcquisitionActions";

describe("FileAcquisitionActions menu chooser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the menu input mounted until the native file selection returns", async () => {
    const onFiles = jest.fn();
    const onLocalSelectionComplete = jest.fn();

    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="menu"
          enableLocalFolder={false}
          enableGoogleDrive={false}
          onFiles={onFiles}
          onLocalSelectionComplete={onLocalSelectionComplete}
        />,
      );
    });

    const action = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Upload files"),
    );
    act(() => action?.click());
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    const selected = new File(["q30"], "q30.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [selected],
    });

    await act(async () =>
      input?.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(onFiles).toHaveBeenCalledWith([selected]);
    expect(onLocalSelectionComplete).toHaveBeenCalledTimes(1);
  });

  it("hydrates the canonical Files row and tree before handing an import to chat", async () => {
    const onStorageImported = jest
      .fn<Promise<void>, [unknown[]]>()
      .mockResolvedValue();
    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="buttons"
          onFiles={jest.fn()}
          storageImportParentFolderId="folder-1"
          onStorageImported={onStorageImported}
        />,
      );
    });

    const driveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google Drive"),
    );
    act(() => driveButton?.click());
    const options = mockOpenGoogle.mock.calls[0]?.[0];
    expect(options.importDestinationFolderPath).toBe("My Files/Projects");

    const imported = {
      fileId: "file-1",
      filePath: "My Files/Projects/report.pdf",
      checksum: "abc",
      versionNumber: 1,
      created: true,
      source: {
        provider: "google_drive",
        connection_id: "connection-1",
        source_ref: "provider-1",
        revision: "7",
        modified_at: null,
      },
      file: {
        id: "file-1",
        ownerId: "admin-user",
        organizationId: null,
        filePath: "My Files/Projects/report.pdf",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 117,
        checksum: "abc",
        visibility: "personal",
        currentVersion: 1,
        parentFolderId: "folder-1",
        metadata: {},
        createdAt: "2026-09-19T12:00:00Z",
        updatedAt: "2026-09-19T12:00:00Z",
        deletedAt: null,
        publicUrl: null,
        url: "https://server.example/files/file-1/download?inline=1",
        cdnUrl: null,
        downloadUrl: null,
        thumbnailUrl: null,
        source: { kind: "real" },
        parentFileId: null,
        derivationKind: null,
        derivationMetadata: null,
        duplicateOfFileId: null,
        canonicalProcessedDocumentId: null,
      },
    };

    await act(async () => {
      await options.onDriveImported({
        type: "drive-imported",
        files: [imported],
        failures: [],
      });
    });

    expect(mockDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "cloudFiles/upsertFiles",
        payload: [expect.objectContaining({ id: "file-1" })],
      }),
    );
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: "cloudFiles/attachChildToFolder",
      payload: { parentFolderId: "folder-1", kind: "file", id: "file-1" },
    });
    expect(onStorageImported).toHaveBeenCalledWith([imported]);
  });

  it("does not route an unresolved nested destination to the Files root", () => {
    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="buttons"
          onFiles={jest.fn()}
          storageImportParentFolderId="missing-folder"
        />,
      );
    });

    const driveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google Drive"),
    );
    act(() => driveButton?.click());

    expect(mockOpenGoogle).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "This destination folder is not available yet. Refresh Files and try again.",
    );
  });

  it("preserves an explicit Files root destination", () => {
    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="buttons"
          onFiles={jest.fn()}
          storageImportParentFolderId={null}
        />,
      );
    });

    const driveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google Drive"),
    );
    act(() => driveButton?.click());

    expect(mockOpenGoogle.mock.calls[0]?.[0]?.importDestinationFolderPath).toBe(
      "",
    );
  });

  it("refuses an invalid destination before opening the shared storage picker", () => {
    act(() => {
      root.render(
        <FileAcquisitionActions
          presentation="buttons"
          onFiles={jest.fn()}
          storageImportFolderPath="My Files/../Other"
        />,
      );
    });

    const storageButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("OneDrive, Dropbox or Box"),
    );
    act(() => storageButton?.click());

    expect(mockOpenStorage).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "The destination folder path is invalid.",
    );
  });
});
