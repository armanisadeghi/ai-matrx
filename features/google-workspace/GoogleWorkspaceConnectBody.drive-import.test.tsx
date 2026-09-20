/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleWorkspaceConnectBody } from "./GoogleWorkspaceConnectBody";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockImportBatch = jest.fn();
const mockLegacyImport = jest.fn();
const mockEmit = jest.fn();
const mockDispose = jest.fn();
const mockDispatch = jest.fn();
const mockPick = jest.fn();
const mockToastError = jest.fn();

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
jest.mock("@/features/files/storage-sources/service", () => ({
  importStorageSourceFiles: (...args: unknown[]) => mockImportBatch(...args),
  importGoogleDriveFiles: (...args: unknown[]) => mockLegacyImport(...args),
  safeStorageBasename: (name: string) =>
    name && !/[\\/]/.test(name) ? name : null,
}));
jest.mock("@/features/overlays/callbacks/googleConnectWindow", () => ({
  emitGoogleConnectEvent: (...args: unknown[]) => mockEmit(...args),
  disposeGoogleConnectCallbackGroup: (...args: unknown[]) =>
    mockDispose(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-1",
  useAppDispatch: () => mockDispatch,
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (message: string) => mockToastError(message),
    info: jest.fn(),
  },
  recordToast: { success: jest.fn(), info: jest.fn() },
}));

function canonical(fileId: string, name: string): CanonicalStorageImport {
  return {
    fileId,
    filePath: `My Files/Imports/${name}`,
    checksum: null,
    versionNumber: 1,
    created: true,
    source: {
      provider: "google_drive",
      connection_id: "google-connection",
      source_ref: fileId,
      revision: null,
      modified_at: null,
    },
    file: { id: fileId, fileName: name, parentFolderId: "imports-folder" },
  } as CanonicalStorageImport;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockPick.mockResolvedValue([
    { id: "provider-a", name: "a.png", mimeType: "image/png" },
    { id: "provider-b", name: "b.png", mimeType: "image/png" },
  ]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  if (!found) throw new Error(`No button containing ${label}`);
  return found;
}

test("retains Google successes for delivery-only retry and retries only failed imports", async () => {
  const a = canonical("canonical-a", "a.png");
  const b = canonical("canonical-b", "b.png");
  mockLegacyImport.mockResolvedValue({
    files: [a],
    failures: [{ name: "b.png", error: "provider timed out" }],
  });
  mockImportBatch
    .mockResolvedValueOnce({ files: [a], failures: [] })
    .mockResolvedValueOnce({
      files: [],
      failures: [
        {
          selection: {
            sourceRef: "provider-b",
            name: "b.png",
            mimeType: "image/png",
          },
          error: "provider timed out",
        },
      ],
    })
    .mockResolvedValueOnce({ files: [b], failures: [] });
  mockEmit
    .mockRejectedValueOnce(new Error("image selection failed"))
    .mockResolvedValue(undefined);
  const onClose = jest.fn();

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        accept="image/*"
        multiple
        onClose={onClose}
      />,
    );
  });
  await act(async () => button("Choose files to import").click());

  expect(mockImportBatch).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("b.png: provider timed out");
  expect(container.textContent).toContain("image selection failed");
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => button("Retry failed imports").click());
  expect(mockImportBatch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selections: [expect.objectContaining({ sourceRef: "provider-b" })],
    }),
  );
  expect(mockImportBatch).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("image selection failed");

  await act(async () => button("Retry attaching").click());
  expect(mockEmit).toHaveBeenCalledWith(
    "google-callback",
    expect.objectContaining({
      files: [expect.objectContaining({ fileId: "canonical-a" })],
    }),
  );
  expect(mockEmit).toHaveBeenLastCalledWith("google-callback", {
    type: "window-close",
  });
  expect(mockImportBatch).toHaveBeenCalledTimes(3);
  expect(mockDispose).toHaveBeenCalledWith("google-callback");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a close request while Google Picker is open cancels before the first import", async () => {
  let releasePicker!: (
    files: Array<{ id: string; name: string; mimeType: string }>,
  ) => void;
  mockPick.mockReturnValue(
    new Promise((resolve) => {
      releasePicker = resolve;
    }),
  );
  let closeRequest: (() => void) | null = null;
  const onClose = jest.fn();

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        multiple
        onClose={onClose}
        registerCloseRequest={(request) => {
          closeRequest = request;
        }}
      />,
    );
  });
  act(() => button("Choose files to import").click());
  await act(async () => closeRequest?.());
  expect(onClose).not.toHaveBeenCalled();

  await act(async () =>
    releasePicker([{ id: "provider-a", name: "a.png", mimeType: "image/png" }]),
  );

  expect(mockImportBatch).not.toHaveBeenCalled();
  expect(mockEmit).toHaveBeenLastCalledWith("google-callback", {
    type: "window-close",
  });
  expect(mockDispose).toHaveBeenCalledWith("google-callback");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a close request waits for the active import and delivery before disposing callbacks", async () => {
  const importedA = canonical("canonical-a", "a.png");
  let releaseImport!: (result: {
    files: CanonicalStorageImport[];
    failures: never[];
  }) => void;
  mockPick.mockResolvedValue([
    { id: "provider-a", name: "a.png", mimeType: "image/png" },
    { id: "provider-b", name: "b.png", mimeType: "image/png" },
  ]);
  mockImportBatch.mockReturnValueOnce(
    new Promise((resolve) => {
      releaseImport = resolve;
    }),
  );
  mockEmit.mockResolvedValue(undefined);
  let closeRequest: (() => void) | null = null;
  const onClose = jest.fn();

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        multiple
        onClose={onClose}
        registerCloseRequest={(request) => {
          closeRequest = request;
        }}
      />,
    );
  });
  act(() => button("Choose files to import").click());
  await act(async () => Promise.resolve());
  expect(mockImportBatch).toHaveBeenCalledTimes(1);

  await act(async () => closeRequest?.());
  expect(mockDispose).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => releaseImport({ files: [importedA], failures: [] }));

  expect(mockEmit).toHaveBeenCalledWith(
    "google-callback",
    expect.objectContaining({
      files: [expect.objectContaining({ fileId: "canonical-a" })],
    }),
  );
  expect(mockImportBatch).toHaveBeenCalledTimes(1);
  expect(mockEmit).toHaveBeenLastCalledWith("google-callback", {
    type: "window-close",
  });
  expect(mockDispose).toHaveBeenCalledWith("google-callback");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a Google collision retry uses the confirmed Matrx basename without re-picking", async () => {
  const importedA = canonical("canonical-a", "a-renamed.png");
  mockPick.mockResolvedValue([
    { id: "provider-a", name: "a.png", mimeType: "image/png" },
  ]);
  mockImportBatch
    .mockResolvedValueOnce({
      files: [],
      failures: [
        {
          selection: {
            sourceRef: "provider-a",
            name: "a.png",
            mimeType: "image/png",
          },
          error: "That path belongs to another source.",
          collisionProposal: "a-01234567.png",
        },
      ],
    })
    .mockResolvedValueOnce({ files: [importedA], failures: [] });
  mockEmit.mockResolvedValue(undefined);

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        accept="image/*"
        multiple={false}
        onClose={jest.fn()}
      />,
    );
  });
  await act(async () => button("Choose files to import").click());

  const rename = container.querySelector(
    '[aria-label="New name for a.png"]',
  ) as HTMLInputElement;
  expect(rename.value).toBe("a-01234567.png");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(rename, "a-renamed.png");
    rename.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Retry failed imports").click());

  expect(mockPick).toHaveBeenCalledTimes(1);
  expect(mockImportBatch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selections: [
        expect.objectContaining({ destinationName: "a-renamed.png" }),
      ],
    }),
  );
});

test("terminal settlement is single-flight across Keep, delivery completion, and close", async () => {
  const importedA = canonical("canonical-a", "a.png");
  let driveDeliveryCalls = 0;
  let releaseDelivery!: () => void;
  const releaseWindowCloses: Array<() => void> = [];
  mockPick.mockResolvedValue([
    { id: "provider-a", name: "a.png", mimeType: "image/png" },
  ]);
  mockImportBatch.mockResolvedValue({ files: [importedA], failures: [] });
  mockEmit.mockImplementation(
    (_callbackGroupId: string, event: { type: string }) => {
      if (event.type === "drive-imported") {
        driveDeliveryCalls += 1;
        if (driveDeliveryCalls === 1) {
          return Promise.reject(new Error("consumer unavailable"));
        }
        return new Promise<void>((resolve) => {
          releaseDelivery = resolve;
        });
      }
      return new Promise<void>((resolve) => {
        releaseWindowCloses.push(resolve);
      });
    },
  );
  let closeRequest: (() => void) | null = null;
  const onClose = jest.fn();

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        key="first-session"
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        multiple
        onClose={onClose}
        registerCloseRequest={(request) => {
          closeRequest = request;
        }}
      />,
    );
  });
  await act(async () => button("Choose files to import").click());

  act(() => button("Retry attaching").click());
  act(() => {
    button("Keep in Files and close").click();
    button("Keep in Files and close").click();
  });

  const windowCloseCalls = () =>
    mockEmit.mock.calls.filter((call) => call[1]?.type === "window-close");
  expect(windowCloseCalls()).toHaveLength(1);
  expect(mockDispose).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    releaseDelivery();
    await Promise.resolve();
  });
  act(() => closeRequest?.());
  await act(async () => {
    for (const release of releaseWindowCloses) release();
  });
  expect(windowCloseCalls()).toHaveLength(1);
  expect(mockDispose).toHaveBeenCalledTimes(1);
  expect(mockDispose).toHaveBeenCalledWith("google-callback");
  expect(onClose).toHaveBeenCalledTimes(1);

  let nextCloseRequest: (() => void) | null = null;
  const nextOnClose = jest.fn();
  mockEmit.mockResolvedValue(undefined);
  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        key="next-session"
        mode="drive-import"
        callbackGroupId="google-callback-next"
        importDestinationFolderPath="My Files/Imports"
        multiple
        onClose={nextOnClose}
        registerCloseRequest={(request) => {
          nextCloseRequest = request;
        }}
      />,
    );
  });
  await act(async () => nextCloseRequest?.());

  expect(windowCloseCalls()).toHaveLength(2);
  expect(mockDispose).toHaveBeenCalledTimes(2);
  expect(mockDispose).toHaveBeenLastCalledWith("google-callback-next");
  expect(nextOnClose).toHaveBeenCalledTimes(1);
});

test("terminal callback failure is reported after final cleanup", async () => {
  mockEmit.mockRejectedValue(new Error("close callback unavailable"));
  let closeRequest: (() => void) | null = null;
  const onClose = jest.fn();

  await act(async () => {
    root.render(
      <GoogleWorkspaceConnectBody
        mode="drive-import"
        callbackGroupId="google-callback"
        importDestinationFolderPath="My Files/Imports"
        multiple
        onClose={onClose}
        registerCloseRequest={(request) => {
          closeRequest = request;
        }}
      />,
    );
  });
  await act(async () => closeRequest?.());

  expect(mockToastError).toHaveBeenCalledWith("close callback unavailable");
  expect(mockDispose).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
