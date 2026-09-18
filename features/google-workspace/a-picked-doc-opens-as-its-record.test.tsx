/** @jest-environment jsdom */

/**
 * 🚨 A PICKED DOC OPENS AS ITS RECORD, IN THE DETAIL PRIMITIVE — AND THE BESPOKE
 * READ/APPEND BOX IS GONE.
 *
 * THE DEFECT, both halves, from the seat of a person looking at their connected
 * Google files (VERIFY-U-W1-U-W2, 2026-09-18):
 *
 *   N1 — `workbench.google_document` was a table with no reachable creator. The
 *        only writer is the refresh endpoint, and its only callers ran *after* a
 *        row existed, so the Record was created only from the Record and the live
 *        table held 0 rows. Picking a file registered a picked resource and
 *        nothing opened.
 *   N2 — the only Doc surface a person could reach was a read-only textarea
 *        ("Read selected Doc") plus a raw "Text to append" box on this same
 *        screen: no preview of the block, no dated heading, no Record.
 *
 * What this proves: the list offers ONE action per picked Doc; clicking it opens
 * the Record through THE ONE opener with the record's identity; a Doc with no
 * Record yet is BORN through the server's refresh door and the id the server
 * returns is the one that opens; and neither textarea exists any more.
 */

import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GoogleWorkspaceReviewWorkspace } from "@/features/google-workspace/GoogleWorkspaceReviewWorkspace";
import {
  useOpenGoogleDocumentRecord,
  type PickedGoogleRecordResource,
} from "@/features/google-workspace/documents/openRecord";
import type {
  GoogleConnectionInventory,
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInventory = jest.fn();
const mockOpenDetail = jest.fn();
const mockRefresh = jest.fn();
const mockToastError = jest.fn();
/** F-69: fires the moment the `existingRecordId` read is attempted, so a test can
 * assert the pre-F-57 read-then-refresh leg was NEVER entered. */
const mockExistingRecordRead = jest.fn();
/** What the `workbench.google_document` read answers for the picked resource. */
let existingRow: { id: string; title: string } | null = null;
let readError: string | null = null;

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => mockInventory(),
  useConnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDisconnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({
    isGoogleLoaded: true,
    requestAuthorizationCode: jest.fn(),
    startAuthorizationCodeRedirect: jest.fn(),
  }),
}));
jest.mock("@/lib/googlePicker", () => ({ pickGoogleWorkspaceFile: jest.fn() }));
jest.mock("@/features/google-workspace/service", () => ({
  DEFAULT_GOOGLE_SHEET_RANGE: "A1:C10",
  SENT_FOR_APPROVAL_MESSAGE: "Sent for approval.",
  appendGoogleDocument: jest.fn(),
  approvalQueueHref: () => "/approvals",
  isGoogleWorkspaceInputError: () => false,
  readGoogleSheet: jest.fn(),
  registerSelectedGoogleFile: jest.fn(),
  sendReviewedGmail: jest.fn(),
  writeGoogleSheet: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
    info: jest.fn(),
    warning: jest.fn(),
  },
  recordToast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea {...(props as object)} />
  ),
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: ReactNode }) => children,
}));
// THE ONE OPENER, observed rather than mounted: the host binding lives in
// app/Providers.tsx and this test is about what the click dispatches.
jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => (request: unknown) => {
    mockOpenDetail(request);
    return Promise.resolve("window");
  },
}));
jest.mock("@/features/google-workspace/documents/service", () => ({
  refreshGoogleDocument: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: (...args: unknown[]) => {
            mockExistingRecordRead(...args);
            return {
              is: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve(
                        readError
                          ? { data: null, error: { message: readError } }
                          : { data: existingRow, error: null },
                      ),
                  }),
                }),
              }),
            };
          },
        }),
      }),
    }),
  },
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

const doc: GoogleConnectionResource = {
  id: "resource-doc",
  connection_id: "connection-one",
  resource_type: "google_document",
  resource_ref: "1DocFileId",
  display_name: "Client onboarding notes",
  permission_level: "selected_by_user",
  discovered_at: "2026-09-18T09:00:00.000Z",
  metadata: {
    mime_type: "application/vnd.google-apps.document",
    web_view_link: "https://docs.google.com/document/d/1DocFileId/edit",
    modified_time: "2026-09-17T11:02:00.000Z",
    selection_source: "google_picker",
  },
};

const inventory: GoogleConnectionInventory = {
  connections: [connection],
  resources: [doc],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  existingRow = null;
  readError = null;
  mockInventory.mockReturnValue({
    data: inventory,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<GoogleWorkspaceReviewWorkspace />);
  });
  act(() => {
    for (const trigger of Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    )) {
      if (trigger.textContent?.includes("Test the file connection")) {
        trigger.click();
      }
    }
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function openAction(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[data-google-record-open="resource-doc"]',
  );
}

async function clickOpen() {
  const button = openAction();
  expect(button).not.toBeNull();
  await act(async () => {
    button!.click();
  });
}

it("offers the Record as the picked Doc's one in-app action", () => {
  expect(container.textContent).toContain("Client onboarding notes");
  const button = openAction();
  expect(button).not.toBeNull();
  expect(button!.textContent).toContain("Open the record");
  // The click's cost is stated before it is clicked.
  expect(container.textContent).toContain(
    "reads it from Google the first time and keeps a copy here",
  );
});

it("no longer carries a bespoke reader or a raw append box", () => {
  expect(container.querySelector("#document-content")).toBeNull();
  expect(container.querySelector("#document-append")).toBeNull();
  expect(container.textContent).not.toContain("Read selected Doc");
  expect(container.textContent).not.toContain("Text to append");
  expect(container.textContent).not.toContain("Append this text");
});

it("opens the Record it already has, with that record's identity, and spends no Google call", async () => {
  existingRow = { id: "record-1", title: "Client onboarding notes" };
  await clickOpen();
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(mockOpenDetail).toHaveBeenCalledTimes(1);
  expect(mockOpenDetail).toHaveBeenCalledWith({
    type: "google_document",
    id: "record-1",
    seed: { name: "Client onboarding notes", about: null },
  });
});

it("brings the Record into existence through the server's door when there is none, and opens the id the server returns", async () => {
  existingRow = null;
  mockRefresh.mockResolvedValue({
    id: "record-born",
    title: "Client onboarding notes",
  });
  await clickOpen();
  expect(mockRefresh).toHaveBeenCalledWith({ fileId: "1DocFileId" });
  expect(mockOpenDetail).toHaveBeenCalledWith({
    type: "google_document",
    id: "record-born",
    seed: { name: "Client onboarding notes", about: null },
  });
});

it(
  "says a plain sentence, never the raw PostgREST message, and opens nothing " +
    "when the Record cannot be reached (Cursor Bugbot, PR 228)",
  async () => {
    readError = "permission denied for table google_document";
    await clickOpen();
    expect(mockOpenDetail).not.toHaveBeenCalled();
    // The raw PostgREST sentence is not one a person can act on — it never
    // reaches the toast. The same shape `readGoogleDocumentRow` gives this
    // class of failure (`documents/service.ts`, F-60): a plain sentence with
    // a remedy, the raw response kept only as `cause` for devtools.
    expect(mockToastError).toHaveBeenCalledWith(
      "AI Matrx could not check whether this file already has a record here. Try again; if it keeps happening, tell us.",
    );
    expect(mockToastError).not.toHaveBeenCalledWith(
      expect.stringContaining("permission denied"),
    );
  },
);

/**
 * 🚨 F-69 — THE REGISTRATION RESPONSE IS ALREADY THE BIRTH DOOR (aidream F-57, R29).
 *
 * These three exercise `useOpenGoogleDocumentRecord` directly rather than through
 * the mounted workspace's "Open the record" button: the resource a caller hands
 * this hook right after a fresh pick or re-pick is the registration response
 * (`SelectedFileResponse`), not the plain inventory row `pickedGoogleRecordResource`
 * narrows — that row has never carried `record_id` and still takes the
 * read-then-refresh leg, proven by the two tests above and by the third case here.
 */
function OpenHarness({
  resource,
  onDone,
}: {
  resource: PickedGoogleRecordResource;
  onDone: (opened: boolean) => void;
}) {
  const openRecord = useOpenGoogleDocumentRecord();
  useEffect(() => {
    void openRecord(resource).then(onDone);
    // Exactly one open attempt per mount — this harness exists to observe it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

async function runHarness(resource: PickedGoogleRecordResource): Promise<boolean> {
  let result = false;
  const done = (opened: boolean) => {
    result = opened;
  };
  const harnessContainer = document.createElement("div");
  document.body.appendChild(harnessContainer);
  const harnessRoot = createRoot(harnessContainer);
  await act(async () => {
    harnessRoot.render(<OpenHarness resource={resource} onDone={done} />);
  });
  act(() => harnessRoot.unmount());
  harnessContainer.remove();
  return result;
}

it(
  "opens the record_id the registration response already carries — no second " +
    "read, no refresh call (red on HEAD: the pre-F-57 leg always reads first)",
  async () => {
    const opened = await runHarness({
      id: "resource-doc",
      resource_ref: "1DocFileId",
      resource_type: "google_document",
      display_name: "Client onboarding notes",
      record_id: "record-from-registration",
      record_sync_status: "available",
    });
    expect(opened).toBe(true);
    expect(mockExistingRecordRead).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockOpenDetail).toHaveBeenCalledTimes(1);
    expect(mockOpenDetail).toHaveBeenCalledWith({
      type: "google_document",
      id: "record-from-registration",
      seed: { name: "Client onboarding notes", about: null },
    });
  },
);

it(
  "opens a detached record as its kept Record, without calling refresh " +
    "(F-68's record_sync_status === \"detached\")",
  async () => {
    const opened = await runHarness({
      id: "resource-doc",
      resource_ref: "1DocFileId",
      resource_type: "google_document",
      display_name: "Client onboarding notes",
      record_id: "record-detached",
      record_sync_status: "detached",
    });
    expect(opened).toBe(true);
    expect(mockExistingRecordRead).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockOpenDetail).toHaveBeenCalledWith({
      type: "google_document",
      id: "record-detached",
      seed: { name: "Client onboarding notes", about: null },
    });
  },
);

it(
  "a picked-resource row with no record_id — registered before F-57 shipped " +
    "the field — still takes the read-then-refresh leg (positive control)",
  async () => {
    existingRow = null;
    mockRefresh.mockResolvedValue({
      id: "record-born-pre-f57",
      title: "Client onboarding notes",
    });
    const opened = await runHarness({
      id: "resource-doc",
      resource_ref: "1DocFileId",
      resource_type: "google_document",
      display_name: "Client onboarding notes",
      // No record_id: exactly what a plain inventory row (or one registered
      // before F-57) hands this hook.
    });
    expect(opened).toBe(true);
    expect(mockExistingRecordRead).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith({ fileId: "1DocFileId" });
    expect(mockOpenDetail).toHaveBeenCalledWith({
      type: "google_document",
      id: "record-born-pre-f57",
      seed: { name: "Client onboarding notes", about: null },
    });
  },
);
