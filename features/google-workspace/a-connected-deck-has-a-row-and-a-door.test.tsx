/** @jest-environment jsdom */

/**
 * A GOOGLE SLIDES DECK A PERSON PICKED HAS A ROW, A NAME AND A DOOR.
 *
 * THE DEFECT (V13-3). The server has shipped `slides` as an `available`
 * capability whose eligible resource type is `google_presentation`, registers
 * such a row on a Picker selection, and had already made a successful
 * `slides.read` call on live connection `4a4f4ad5`. This screen's file list was
 * filtered by a hand-typed `google_document | google_spreadsheet` pair, so the
 * deck was accepted by the attach call and then rendered NOWHERE: no row, no
 * name, no door. A named identity that does not open is a dead end.
 *
 * What this proves, from the seat of a person looking at their connected files:
 * the deck is listed by its own name with its own kind, its "Open in Google"
 * door is present and points at the deck, and selecting it produces an honest
 * read-only detail — not a blank panel, and NOT the Sheets reader, which is
 * where `if (Doc) … else sheet` used to send it.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleWorkspaceReviewWorkspace } from "@/features/google-workspace/GoogleWorkspaceReviewWorkspace";
import {
  GOOGLE_WORKSPACE_FILE_TYPES,
  GOOGLE_WORKSPACE_RESOURCE_TYPES,
} from "@/features/google-workspace/resource-types";
import type {
  GoogleConnectionInventory,
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInventory = jest.fn();
const mockReadSheet = jest.fn();
const mockReadDocument = jest.fn();
const mockToastInfo = jest.fn();

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => mockInventory(),
  useConnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDisconnectGoogle: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({
    isGoogleLoaded: true,
    requestAuthorizationCode: jest.fn(),
    startAuthorizationCodeRedirect: jest.fn(),
  }),
}));
jest.mock("@/lib/googlePicker", () => ({
  pickGoogleWorkspaceFile: jest.fn(),
}));
jest.mock("@/features/google-workspace/service", () => ({
  DEFAULT_GOOGLE_SHEET_RANGE: "A1:C10",
  SENT_FOR_APPROVAL_MESSAGE: "Sent for approval.",
  appendGoogleDocument: jest.fn(),
  approvalQueueHref: () => "/approvals",
  isGoogleWorkspaceInputError: () => false,
  readGoogleDocument: (...args: unknown[]) => mockReadDocument(...args),
  readGoogleSheet: (...args: unknown[]) => mockReadSheet(...args),
  registerSelectedGoogleFile: jest.fn(),
  sendReviewedGmail: jest.fn(),
  writeGoogleSheet: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
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
  last_verified_at: "2026-09-17T20:48:03.195512Z",
  last_error: null,
  created_at: "2026-09-10T09:00:00.000Z",
  updated_at: "2026-09-17T20:48:03.195512Z",
  metadata: {},
  credential_present: true,
  credential_stable: true,
  health: "connected",
  capability_health: null,
};

/**
 * The row `register_selected_file` writes for a picked deck — a COMPLETE
 * `GoogleConnectionResource`, declared by annotation rather than a cast, so the
 * fixture cannot drift from the type the surfaces narrow on.
 */
const deck: GoogleConnectionResource = {
  id: "resource-deck",
  connection_id: "connection-one",
  resource_type: "google_presentation",
  resource_ref: "1DeckFileId",
  display_name: "Q4 board narrative",
  permission_level: "selected_by_user",
  discovered_at: "2026-09-17T20:48:03.195512Z",
  metadata: {
    mime_type: "application/vnd.google-apps.presentation",
    web_view_link: null,
    modified_time: "2026-09-16T11:02:00.000Z",
    selection_source: "google_picker",
  },
};

const inventory: GoogleConnectionInventory = {
  connections: [connection],
  resources: [deck],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
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
  // The file section is a collapsible; open every trigger so the list renders.
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

function deckDoor(): HTMLAnchorElement | null {
  return (
    Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.getAttribute("href")?.includes("1DeckFileId"),
    ) ?? null
  );
}

it("names every file type it can pick, in the button and the sentence beside it", () => {
  // The screen must not offer a type the Picker filters out, and must not stay
  // silent about one it offers: both strings are derived from the ONE record, and
  // a surface that regresses to a literal fails HERE (Bugbot round 21).
  for (const type of GOOGLE_WORKSPACE_RESOURCE_TYPES) {
    expect(container.textContent).toContain(
      GOOGLE_WORKSPACE_FILE_TYPES[type].plural,
    );
  }
});

it("lists the deck by name, with its own kind", () => {
  expect(container.textContent).toContain("Q4 board narrative");
  expect(container.textContent).toContain("Google Slides deck");
  // The wire token never reaches the person.
  expect(container.textContent).not.toContain("google_presentation");
});

it("gives the deck a door even though the row stored no web view link", () => {
  const door = deckDoor();
  expect(door).not.toBeNull();
  expect(door!.getAttribute("href")).toBe(
    "https://docs.google.com/presentation/d/1DeckFileId/edit",
  );
  expect(door!.textContent).toContain("Open in Google");
});

it("shows an honest read-only detail instead of a blank or a Sheets editor", () => {
  expect(container.textContent).toContain(
    "There is no deck viewer on this screen yet",
  );
  expect(container.textContent).toContain("Last edited in Google");
  // The Sheets range editor is the wrong body for a deck and must be absent.
  expect(container.querySelector("#sheet-range")).toBeNull();
  expect(container.querySelector("#document-append")).toBeNull();
});

it("never asks the Sheets or Docs API for a deck", () => {
  for (const button of Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  )) {
    if (/^Read/.test(button.textContent ?? "")) {
      act(() => button.click());
    }
  }
  expect(mockReadSheet).not.toHaveBeenCalled();
  expect(mockReadDocument).not.toHaveBeenCalled();
});
