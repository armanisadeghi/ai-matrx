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
 * detail with an explicit Slides read — not a blank panel, and NOT the Sheets
 * reader, which is where `if (Doc) … else sheet` used to send it.
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
const mockReadPresentation = jest.fn();
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));
jest.mock("@/features/connected-sources/api", () => ({
  readGooglePresentation: (...args: unknown[]) =>
    mockReadPresentation(...args),
}));

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
  readGoogleSheet: (...args: unknown[]) => mockReadSheet(...args),
  registerSelectedGoogleFile: jest.fn(),
  sendReviewedGmail: jest.fn(),
  writeGoogleSheet: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
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

const secondDeck: GoogleConnectionResource = {
  ...deck,
  id: "resource-deck-two",
  resource_ref: "2DeckFileId",
  display_name: "Annual plan",
  metadata: {
    ...deck.metadata,
    web_view_link: "https://docs.google.com/presentation/d/2DeckFileId/edit",
  },
};

const secondConnection: GoogleConnectionSummary = {
  ...connection,
  id: "connection-two",
  provider_subject: "subject-two",
  account_email: "second@example.com",
};

const secondAccountDeck: GoogleConnectionResource = {
  ...secondDeck,
  id: "resource-second-account",
  connection_id: "connection-two",
  resource_ref: "AccountDeckFileId",
  display_name: "Second account deck",
};

const inventory: GoogleConnectionInventory = {
  connections: [connection],
  resources: [deck],
};
let currentInventory = inventory;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  currentInventory = inventory;
  mockReadPresentation.mockResolvedValue({
    file_id: deck.resource_ref,
    title: deck.display_name,
    slides: [],
    slides_with_notes: 0,
  });
  mockInventory.mockImplementation(() => ({
    data: currentInventory,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }));
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

function buttonNamed(name: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.includes(name));
  expect(button).toBeDefined();
  return button!;
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

it("shows the explicit Slides reader instead of a blank or a Sheets editor", () => {
  expect(GOOGLE_WORKSPACE_FILE_TYPES.google_presentation.clientRead).toBe(
    "presentation",
  );
  expect(GOOGLE_WORKSPACE_FILE_TYPES.google_presentation.readOnlyNote).toBeNull();
  expect(container.textContent).toContain("Read slides and notes");
  expect(container.textContent).toContain("slide text and speaker notes");
  expect(container.textContent).toContain("Last edited in Google");
  // The Sheets range editor is the wrong body for a deck and must be absent.
  expect(container.querySelector("#sheet-range")).toBeNull();
  expect(container.querySelector("#document-append")).toBeNull();
});

it("never asks the Sheets API for a deck", async () => {
  await act(async () => buttonNamed("Read slides and notes").click());
  expect(mockReadSheet).not.toHaveBeenCalled();
});

it("reads the fallback-selected registered deck with its exact connection and ref, then shows slide text and notes", async () => {
  mockReadPresentation.mockResolvedValue({
    file_id: "1DeckFileId",
    title: "Q4 board narrative",
    slides: [
      {
        slide_id: "slide-1",
        index: 0,
        title: "Opening",
        body_text: "Revenue grew in every region.",
        speaker_notes: "Pause for the regional chart.",
      },
    ],
    slides_with_notes: 1,
  });

  await act(async () => {
    buttonNamed("Read slides and notes").click();
  });

  expect(mockReadPresentation).toHaveBeenCalledWith(
    mockDispatch,
    "connection-one",
    "1DeckFileId",
  );
  expect(document.body.textContent).toContain("Slides and notes");
  expect(document.body.textContent).toContain("Revenue grew in every region.");
  expect(document.body.textContent).toContain("Pause for the regional chart.");
});

it("opens pending immediately and clears it when the read fails", async () => {
  let rejectRead: (reason: Error) => void = () => undefined;
  mockReadPresentation.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectRead = reject;
    }),
  );

  act(() => buttonNamed("Read slides and notes").click());
  expect(document.body.textContent).toContain(
    "Reading Q4 board narrative from Google",
  );

  await act(async () => rejectRead(new Error("Google could not read this deck.")));
  expect(document.body.textContent).not.toContain(
    "Reading Q4 board narrative from Google",
  );
  expect(container.textContent).toContain("Google could not read this deck.");
  expect(mockToastError).toHaveBeenCalledWith("Google could not read this deck.");
  expect(buttonNamed("Read slides and notes").disabled).toBe(false);
});

it("discards a late success after the selected deck changes", async () => {
  currentInventory = {
    connections: [connection],
    resources: [deck, secondDeck],
  };
  act(() => root.render(<GoogleWorkspaceReviewWorkspace />));
  let resolveRead: (value: unknown) => void = () => undefined;
  mockReadPresentation.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );

  act(() => buttonNamed("Read slides and notes").click());
  act(() => buttonNamed("Annual plan").click());
  await act(async () =>
    resolveRead({
      file_id: "1DeckFileId",
      title: "Q4 board narrative",
      slides: [
        {
          slide_id: "stale",
          index: 0,
          title: null,
          body_text: "Stale first-deck body",
          speaker_notes: "Stale first-deck notes",
        },
      ],
      slides_with_notes: 1,
    }),
  );

  expect(container.textContent).toContain("Annual plan");
  expect(document.body.textContent).not.toContain("Stale first-deck body");
  expect(mockToastError).not.toHaveBeenCalled();
});

it("discards a late error after the active account changes", async () => {
  currentInventory = {
    connections: [connection, secondConnection],
    resources: [deck, secondAccountDeck],
  };
  act(() => root.render(<GoogleWorkspaceReviewWorkspace />));
  let rejectRead: (reason: Error) => void = () => undefined;
  mockReadPresentation.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectRead = reject;
    }),
  );

  act(() => buttonNamed("Read slides and notes").click());
  act(() => buttonNamed("second@example.com").click());
  await act(async () => rejectRead(new Error("stale account failure")));

  expect(container.textContent).toContain("Second account deck");
  expect(container.textContent).not.toContain("stale account failure");
  expect(mockToastError).not.toHaveBeenCalled();
});

it("closing the pending read keeps its late success closed", async () => {
  let resolveRead: (value: unknown) => void = () => undefined;
  mockReadPresentation.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  act(() => buttonNamed("Read slides and notes").click());
  const close = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.trim() === "Close");
  expect(close).toBeDefined();
  act(() => close!.click());

  await act(async () =>
    resolveRead({
      file_id: "1DeckFileId",
      title: "Q4 board narrative",
      slides: [
        {
          slide_id: "late-close",
          index: 0,
          title: null,
          body_text: "Should stay closed",
          speaker_notes: "Should stay closed too",
        },
      ],
      slides_with_notes: 1,
    }),
  );
  expect(document.body.textContent).not.toContain("Should stay closed");
});

it("does not publish a result after unmount", async () => {
  let resolveRead: (value: unknown) => void = () => undefined;
  mockReadPresentation.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  act(() => buttonNamed("Read slides and notes").click());
  act(() => root.unmount());
  await act(async () =>
    resolveRead({
      file_id: "1DeckFileId",
      title: "Q4 board narrative",
      slides: [],
      slides_with_notes: 0,
    }),
  );
  expect(mockToastError).not.toHaveBeenCalled();
  // `afterEach` may call unmount again; React accepts the idempotent call.
});
