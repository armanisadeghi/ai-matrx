/** @jest-environment jsdom */

import React, {
  act,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleWorkspaceConnectBody } from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import {
  createGoogleConnectCallbackGroup,
} from "@/features/overlays/callbacks/googleConnectWindow";
import type { OpenGoogleConnectOptions } from "@/features/overlays/openers/googleConnectWindow";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";
import { FileAcquisitionActions } from "./FileAcquisitionActions";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockOpenGoogle = jest.fn();
const mockImportBatch = jest.fn();
const mockPick = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => mockOpenGoogle,
}));
jest.mock("@/features/overlays/openers/storageSourcePicker", () => ({
  useOpenStorageSourcePicker: () => jest.fn(),
}));
jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));
jest.mock("@/providers/google-provider/useGoogleAuthorizationWindow", () => ({
  useGoogleAuthorizationWindow: () => ({
    openAuthorizationWindow: jest.fn(),
    openAuthorizationRedirect: jest.fn(),
    beginAuthorization: jest.fn(),
  }),
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useConnectGoogle: () => ({ mutateAsync: jest.fn() }),
  useGoogleConnectionInventory: () => ({
    isLoading: false,
    data: {
      connections: [
        {
          id: "google-connection",
          owner_type: "user",
          owner_user_id: "admin-user",
          organization_id: null,
          provider: "google",
          provider_subject: "subject",
          account_email: "admin@admin.com",
          account_name: "Admin",
          scopes: ["https://www.googleapis.com/auth/drive.file"],
          status: "connected",
          last_verified_at: null,
          last_error: null,
          created_at: "2026-09-19T12:00:00Z",
          updated_at: "2026-09-19T12:00:00Z",
          metadata: {},
          credential_present: true,
          credential_stable: true,
          health: "connected",
          capability_health: null,
        },
      ],
      resources: [],
    },
    refetch: jest.fn(),
  }),
}));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: () => null,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/lib/googlePicker", () => ({
  pickGoogleDriveFiles: (...args: unknown[]) => mockPick(...args),
  pickGoogleWorkspaceFile: jest.fn(),
}));
jest.mock("@/features/google-workspace/drivePickerToken", () => ({
  getGoogleDrivePickerToken: jest.fn(async () => "picker-token"),
}));
jest.mock("@/features/files/storage-sources/service", () => {
  const actual = jest.requireActual(
    "@/features/files/storage-sources/service",
  );
  return {
    ...actual,
    importStorageSourceFiles: (...args: unknown[]) => mockImportBatch(...args),
    importGoogleDriveFiles: jest.fn(),
  };
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => ({
    "folder-1": { folderPath: "My Files/Projects" },
  }),
  useAppDispatch: () => mockDispatch,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  recordToast: { success: jest.fn(), info: jest.fn() },
}));

type OpenWindow = {
  callbackGroupId: string;
};

let openWindow: ((options: OpenGoogleConnectOptions) => void) | null = null;

function ConsumerHarness({
  onStorageImported,
}: {
  onStorageImported: (files: CanonicalStorageImport[]) => Promise<void>;
}) {
  const [window, setWindow] = useState<OpenWindow | null>(null);
  const closeRequestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    openWindow = (options) => {
      const callbacks = createGoogleConnectCallbackGroup(options);
      setWindow({ callbackGroupId: callbacks.callbackGroupId });
    };
    return () => {
      openWindow = null;
    };
  }, []);

  return (
    <>
      <FileAcquisitionActions
        presentation="inline"
        enableLocalFiles={false}
        enableLocalFolder={false}
        enableStorageProviders={false}
        onFiles={jest.fn()}
        storageImportParentFolderId="folder-1"
        onStorageImported={onStorageImported}
      />
      {window ? (
        <>
          <button
            type="button"
            onClick={() => closeRequestRef.current?.()}
          >
            Close Google window
          </button>
          <GoogleWorkspaceConnectBody
            mode="drive-import"
            callbackGroupId={window.callbackGroupId}
            importDestinationFolderPath="My Files/Projects"
            multiple
            onClose={() => setWindow(null)}
            registerCloseRequest={(request) => {
              closeRequestRef.current = request;
            }}
          />
        </>
      ) : null}
    </>
  );
}

function canonicalImport(): CanonicalStorageImport {
  return {
    fileId: "canonical-a",
    filePath: "My Files/Projects/a.png",
    checksum: null,
    versionNumber: 1,
    created: true,
    source: {
      provider: "google_drive",
      connection_id: "google-connection",
      source_ref: "provider-a",
      revision: null,
      modified_at: null,
    },
    file: {
      id: "canonical-a",
      fileName: "a.png",
      parentFolderId: "folder-1",
    },
  } as CanonicalStorageImport;
}

describe("FileAcquisitionActions Google terminal settlement", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockOpenGoogle.mockImplementation((options: OpenGoogleConnectOptions) => {
      openWindow?.(options);
      return { close: jest.fn(), dispose: jest.fn() };
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    openWindow = null;
    container.remove();
  });

  function button(label: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes(label),
    );
    if (!found) throw new Error(`No button containing ${label}`);
    return found;
  }

  function googleAction(): HTMLButtonElement {
    return button("Google Drive");
  }

  it("re-enables and reopens Google after cancellation and Keep in Files", async () => {
    const onStorageImported = jest.fn().mockResolvedValue(undefined);
    let releasePicker!: (
      files: Array<{ id: string; name: string; mimeType: string }>,
    ) => void;
    mockPick.mockReturnValueOnce(
      new Promise((resolve) => {
        releasePicker = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <ConsumerHarness onStorageImported={onStorageImported} />,
      );
    });

    act(() => googleAction().click());
    expect(googleAction().disabled).toBe(true);
    act(() => button("Choose files to import").click());
    await act(async () => Promise.resolve());
    act(() => button("Close Google window").click());
    expect(googleAction().disabled).toBe(true);

    await act(async () =>
      releasePicker([
        { id: "provider-cancel", name: "cancel.png", mimeType: "image/png" },
      ]),
    );

    expect(mockImportBatch).not.toHaveBeenCalled();
    expect(googleAction().disabled).toBe(false);
    act(() => googleAction().click());
    expect(mockOpenGoogle).toHaveBeenCalledTimes(2);

    const imported = canonicalImport();
    onStorageImported.mockRejectedValueOnce(new Error("consumer unavailable"));
    mockPick.mockResolvedValueOnce([
      { id: "provider-a", name: "a.png", mimeType: "image/png" },
    ]);
    mockImportBatch.mockResolvedValueOnce({ files: [imported], failures: [] });

    await act(async () => button("Choose files to import").click());
    expect(onStorageImported).toHaveBeenCalledTimes(1);
    expect(mockImportBatch).toHaveBeenCalledTimes(1);
    expect(googleAction().disabled).toBe(true);

    await act(async () => button("Keep in Files and close").click());

    expect(googleAction().disabled).toBe(false);
    act(() => googleAction().click());
    expect(mockOpenGoogle).toHaveBeenCalledTimes(3);
    expect(mockImportBatch).toHaveBeenCalledTimes(1);
    expect(onStorageImported).toHaveBeenCalledTimes(1);
  });
});
