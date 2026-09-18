/** @jest-environment jsdom */

/**
 * 🚨 F-77 (hostile verifier V-21, finding N1, HIGH) — A RECORD THAT WAS NEVER
 * WRITTEN IS NEVER CALLED "READY", AND ITS DOOR IS NEVER OFFERED.
 *
 * THE DEFECT: `registerSelectedGoogleFile`'s response carries `record_id` plus,
 * when the server could NOT write the `workbench.google_document` Record, a
 * plain-sentence `record_absent_reason` saying why (no Record table for a
 * Slides deck; no organization named; the write itself failed, naming the
 * exception class) — and when it could, an optional `record_sync_status` /
 * `record_sync_status_reason`. Both call sites parsed all four fields onto
 * `SelectedGoogleFile` (F-74) and then threw two of them away: `chooseFile` in
 * `GoogleWorkspaceConnectBody.tsx` and `GoogleWorkspaceReviewWorkspace.tsx`
 * captured only `recordId` / `recordSyncStatus` into `freshRecords`, said
 * "<name> is ready to use" regardless, and the row still offered "Open the
 * record" to a Record that was never made.
 *
 * What this proves, from the seat of a person who just picked a Google file:
 *
 *   (a) when the server could not write the Record, the row says the file is
 *       picked and usable, states the server's own sentence VERBATIM, offers
 *       NO "Open the record" door, and never claims the file "is ready to use";
 *   (b) when the Record was written but kept a sync status other than the
 *       healthy one, its reason is shown beside the row;
 *   (c) the ordinary healthy pick is unchanged: "ready to use"/"ready", the
 *       door is offered, no reason line appears.
 *
 * F-83 (Bugbot LOW on 80c8027b, thread on both files' ~279-287/327-335): the
 * no-Record toast in (a), and the sync-reason toast in (b), must go through
 * the SAME `recordToast` resource-identified helper the success path in (c)
 * uses (so they are dismissed with the file, never outliving it) and at a
 * level that reads as a notice — `info`, never `warning` — because a picked
 * file with no Record table (a Slides deck) is an EXPECTED outcome, not a
 * fault, and `warning`/`error` are the two levels that feed the Error
 * Inspector (`lib/toast.ts`'s own doc comment).
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GoogleWorkspaceConnectBody } from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import { GoogleWorkspaceReviewWorkspace } from "@/features/google-workspace/GoogleWorkspaceReviewWorkspace";
import type {
  GoogleConnectionInventory,
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import type { SelectedGoogleFile } from "@/features/google-workspace/types";
import { googleWorkspacePickLabel } from "@/features/google-workspace/resource-types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInventory = jest.fn();
const mockRegister = jest.fn();
const mockToastWarning = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
const mockRecordToastSuccess = jest.fn();
const mockRecordToastInfo = jest.fn();

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => mockInventory(),
  useConnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDisconnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({
    isGoogleLoaded: true,
    isAuthenticated: true,
    requestAuthorizationCode: jest.fn(),
    startAuthorizationCodeRedirect: jest.fn(),
  }),
}));
jest.mock("@/lib/googlePicker", () => ({
  pickGoogleWorkspaceFile: jest.fn(async () => ({ id: "1FileId" })),
  pickGoogleDriveFiles: jest.fn(),
}));
jest.mock("@/features/google-workspace/drivePickerToken", () => ({
  getGoogleDrivePickerToken: jest.fn(async () => "token"),
}));
jest.mock("@/features/google-workspace/import/materializeGoogleDriveFile", () => ({
  materializeGoogleDriveFiles: jest.fn(),
}));
jest.mock("@/features/overlays/callbacks/googleConnectWindow", () => ({
  emitGoogleConnectEvent: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-1",
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "org-1",
}));
jest.mock("@/features/google-workspace/service", () => ({
  DEFAULT_GOOGLE_SHEET_RANGE: "A1:C10",
  SENT_FOR_APPROVAL_MESSAGE: "Sent for approval.",
  approvalQueueHref: () => "/approvals",
  isGoogleWorkspaceInputError: () => false,
  readGoogleSheet: jest.fn(),
  registerSelectedGoogleFile: (...args: unknown[]) => mockRegister(...args),
  sendReviewedGmail: jest.fn(),
  writeGoogleSheet: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
  recordToast: {
    success: (...args: unknown[]) => mockRecordToastSuccess(...args),
    info: (...args: unknown[]) => mockRecordToastInfo(...args),
    error: jest.fn(),
  },
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea {...(props as object)} />
  ),
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: ReactNode }) => children,
}));
// THE ONE opener is observed rather than mounted (host binding lives in
// app/Providers.tsx) — this suite is about what the row shows, not the click.
jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => () => Promise.resolve("window"),
}));

const connection: GoogleConnectionSummary = {
  id: "connection-one",
  owner_type: "user",
  owner_user_id: "user-1",
  organization_id: null,
  provider: "google",
  provider_subject: "subject-one",
  account_email: "expert@example.com",
  account_name: "The Expert",
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  status: "connected",
  last_verified_at: "2026-09-18T09:00:00.000Z",
  last_error: null,
  created_at: "2026-09-10T09:00:00.000Z",
  updated_at: "2026-09-18T09:00:00.000Z",
  metadata: {},
  credential_present: true,
  credential_stable: true,
  health: "connected",
  capability_health: null,
};

/**
 * Standing in as the row a re-pick registers against — a resource already
 * listed on the inventory read, exactly what `chooseFile` merges its fresh
 * `freshRecords` entry onto (`pickedGoogleRecordResource({ ...file, ...fresh })`).
 * The two-repo boundary for a truly fresh pick's inventory update is a
 * TanStack Query refetch this suite does not model; the row-rendering logic
 * under test — hide the door, show the sentence — is identical either way.
 */
const doc: GoogleConnectionResource = {
  id: "resource-doc",
  connection_id: "connection-one",
  resource_type: "google_document",
  resource_ref: "1FileId",
  display_name: "Client onboarding notes",
  permission_level: "selected_by_user",
  discovered_at: "2026-09-18T09:00:00.000Z",
  metadata: {
    mime_type: "application/vnd.google-apps.document",
    web_view_link: "https://docs.google.com/document/d/1FileId/edit",
    modified_time: "2026-09-17T11:02:00.000Z",
    selection_source: "google_picker",
  },
};

const emptyInventory: GoogleConnectionInventory = {
  connections: [connection],
  resources: [doc],
};

function selectedFile(
  overrides: Partial<SelectedGoogleFile>,
): SelectedGoogleFile {
  return {
    id: "resource-doc",
    connectionId: "connection-one",
    resourceType: "google_document",
    fileId: "1FileId",
    name: "Client onboarding notes",
    mimeType: "application/vnd.google-apps.document",
    webViewLink: "https://docs.google.com/document/d/1FileId/edit",
    recordId: "record-1",
    recordSyncStatus: "available",
    recordSyncStatusReason: null,
    recordAbsentReason: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function pickInto(
  ui: ReactNode,
  openLabel: string,
): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(ui as never);
  });
  act(() => {
    for (const trigger of Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    )) {
      if (trigger.textContent?.includes(openLabel)) trigger.click();
    }
  });
  const pickLabel = googleWorkspacePickLabel();
  const pickButton = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.trim() === pickLabel);
  expect(pickButton).toBeTruthy();
  await act(async () => {
    pickButton!.click();
  });
}

describe("GoogleWorkspaceConnectBody — a record write failure says so", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInventory.mockReturnValue({
      data: emptyInventory,
      isLoading: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });
  });

  it(
    "(a) no Record: says picked-and-usable, shows the server's own sentence " +
      "verbatim, offers no Open-the-record door, and never claims 'ready to use'",
    async () => {
      mockRegister.mockResolvedValue(
        selectedFile({
          recordId: null,
          recordSyncStatus: null,
          recordAbsentReason:
            "This file's record could not be written (TimeoutError).",
        }),
      );
      await pickInto(
        <GoogleWorkspaceConnectBody onClose={jest.fn()} />,
        "Connect Google",
      );
      expect(container.textContent).toContain(
        "This file's record could not be written (TimeoutError).",
      );
      expect(container.textContent).not.toContain("is ready to use");
      expect(
        container.querySelector('[data-google-record-open="resource-doc"]'),
      ).toBeNull();
      // F-83: the no-Record notice is `recordToast.info`, carrying the SAME
      // resource identity ({ id: "resource-doc" }) the success toast in (c)
      // uses — never `toast.warning`, which would (1) risk outliving the file
      // on screen and (2) feed the Error Inspector for an EXPECTED absence.
      expect(mockRecordToastInfo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "resource-doc" }),
        expect.stringContaining("picked and usable"),
        expect.objectContaining({
          description:
            "This file's record could not be written (TimeoutError).",
        }),
      );
      expect(mockToastWarning).not.toHaveBeenCalled();
      expect(mockRecordToastSuccess).not.toHaveBeenCalled();
    },
  );

  it(
    "(b) Record written but unhealthy: shows the sync reason beside the row",
    async () => {
      mockRegister.mockResolvedValue(
        selectedFile({
          recordId: "record-1",
          recordSyncStatus: "unavailable",
          recordSyncStatusReason: "Google reports this file was deleted.",
        }),
      );
      await pickInto(
        <GoogleWorkspaceConnectBody onClose={jest.fn()} />,
        "Connect Google",
      );
      expect(container.textContent).toContain(
        "Google reports this file was deleted.",
      );
      expect(mockToastWarning).not.toHaveBeenCalled();
      expect(
        container.querySelector('[data-google-record-open="resource-doc"]'),
      ).not.toBeNull();
      expect(mockRecordToastSuccess).toHaveBeenCalled();
      // F-83: the sync-reason notice also rides `recordToast.info` with the
      // same picked-file identity, not a bare `toast.info` with no identity.
      expect(mockRecordToastInfo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "resource-doc" }),
        "Google reports this file was deleted.",
      );
    },
  );

  it("(c) the healthy pick is unchanged", async () => {
    mockRegister.mockResolvedValue(selectedFile({}));
    await pickInto(
      <GoogleWorkspaceConnectBody onClose={jest.fn()} />,
      "Connect Google",
    );
    expect(mockRecordToastSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "resource-doc" }),
      "Client onboarding notes is ready to use.",
    );
    expect(mockToastWarning).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-google-record-open="resource-doc"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("could not be created");
  });
});

const reviewInventory: GoogleConnectionInventory = {
  connections: [connection],
  resources: [doc],
};

describe("GoogleWorkspaceReviewWorkspace — a record write failure says so", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInventory.mockReturnValue({
      data: reviewInventory,
      isLoading: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });
  });

  it(
    "(a) no Record: says picked-and-usable, shows the server's own sentence " +
      "verbatim, offers no Open-the-record door, and never claims 'ready'",
    async () => {
      mockRegister.mockResolvedValue(
        selectedFile({
          recordId: null,
          recordSyncStatus: null,
          recordAbsentReason:
            "This file's record could not be written (TimeoutError).",
        }),
      );
      await pickInto(
        <GoogleWorkspaceReviewWorkspace />,
        "Test the file connection",
      );
      expect(container.textContent).toContain(
        "This file's record could not be written (TimeoutError).",
      );
      expect(container.textContent).not.toContain("Client onboarding notes is ready.");
      expect(
        container.querySelector('[data-google-record-open="resource-doc"]'),
      ).toBeNull();
      // F-83: same as ConnectBody — `recordToast.info` with the picked-file
      // identity, never `toast.warning`.
      expect(mockRecordToastInfo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "resource-doc" }),
        expect.stringContaining("picked and usable"),
        expect.objectContaining({
          description:
            "This file's record could not be written (TimeoutError).",
        }),
      );
      expect(mockToastWarning).not.toHaveBeenCalled();
      expect(mockRecordToastSuccess).not.toHaveBeenCalled();
    },
  );

  it(
    "(b) Record written but unhealthy: shows the sync reason beside the row",
    async () => {
      mockRegister.mockResolvedValue(
        selectedFile({
          recordId: "record-1",
          recordSyncStatus: "unavailable",
          recordSyncStatusReason: "Google reports this file was deleted.",
        }),
      );
      await pickInto(
        <GoogleWorkspaceReviewWorkspace />,
        "Test the file connection",
      );
      expect(container.textContent).toContain(
        "Google reports this file was deleted.",
      );
      expect(mockToastWarning).not.toHaveBeenCalled();
      expect(
        container.querySelector('[data-google-record-open="resource-doc"]'),
      ).not.toBeNull();
      expect(mockRecordToastSuccess).toHaveBeenCalled();
      expect(mockRecordToastInfo).toHaveBeenCalledWith(
        expect.objectContaining({ id: "resource-doc" }),
        "Google reports this file was deleted.",
      );
    },
  );

  it("(c) the healthy pick is unchanged", async () => {
    mockRegister.mockResolvedValue(selectedFile({}));
    await pickInto(
      <GoogleWorkspaceReviewWorkspace />,
      "Test the file connection",
    );
    expect(mockRecordToastSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "resource-doc" }),
      "Client onboarding notes is ready.",
    );
    expect(mockToastWarning).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-google-record-open="resource-doc"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("could not be created");
  });
});

