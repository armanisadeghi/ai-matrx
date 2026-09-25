/**
 * 🚨 LANE F-60 — WHAT THIS PANEL SAYS WHEN SOMETHING REFUSES, AND WHAT IT OFFERS
 * INSTEAD OF A LINK OUT.
 *
 * Five findings from VERIFY-U-W1-U-W2, each of which a person would feel:
 *
 *   * N7 — a wire-contract failure printed the DEVELOPER's sentence on the
 *     screen ("The Google refresh answered without a usable id.") with nothing to
 *     do about it. One plain sentence with a remedy now, and the developer detail
 *     travels on the error for the log.
 *   * N8 — the refusal was followed by the product's PROMISE ("…did not say why.
 *     Open, create and edit only the files you pick. We never see the rest of your
 *     Drive."), which answers "why can't I have this file?" with reassurance.
 *   * N9 — "Reconnect Google" and "Choose the file again" were full-page anchors
 *     INSIDE the Detail primitive, and the second one landed on a settings page
 *     rather than the Google Picker it promised.
 *   * N12 — a row whose `external_url` is null had no "Open in Google" anywhere,
 *     while the body copy told the person to open it in Google.
 *   * N14 — the one control that opens the file in Google was labelled "Open at
 *     source".
 *
 * The connector half is deliberately HEALTHY (a connected account, a granted
 * product), because every one of these is about the FILE, not the grant.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { DetailBody } from "@/lib/detail/core/DetailBody";
import { useDetailCore } from "@/lib/detail/core/useDetailCore";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import { resolveItemDetailType } from "@/features/item-presentation/detail";

import { CONNECTION_ID, DOC_ID, FILE_ID, googleDocumentRow } from "./fixtures";
import type { GoogleDocumentRow } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

/** The product promise a refusal must never be followed by (provider-config). */
const WORKSPACE_PROMISE =
  "Open, create and edit only the files you pick. We never see the rest of your Drive.";

let currentRow: GoogleDocumentRow = googleDocumentRow();
/** When set, every refresh answers 200 with a body that breaks the contract. */
let refreshAnswersGarbage = false;

jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    schema: self,
    from: self,
    select: self,
    eq: self,
    is: self,
    abortSignal: self,
    maybeSingle: async () => ({ data: currentRow, error: null }),
  });
  return { supabase: chain, createClient: () => chain };
});

const postGoogleBackend = jest.fn(async (path: string, body: Record<string, unknown>) => ({
  status: 200,
  json: async () =>
    path.includes("/documents/refresh")
      ? refreshAnswersGarbage
        ? { organization_id: currentRow.organization_id, sync_status: "available" }
        : {
            id: DOC_ID,
            organization_id: currentRow.organization_id,
            resource_id: currentRow.resource_id,
            external_id: currentRow.external_id,
            title: currentRow.title,
            mime_kind: "document",
            external_url: currentRow.external_url,
            owner_email: currentRow.owner_email,
            external_modified_at: currentRow.external_modified_at,
            body_chars: 42,
            synced_at: "2026-09-18T15:00:00Z",
            sync_status: "available",
            sync_status_reason: null,
            export_mime: "text/plain",
          }
      : { file_id: body.file_id, title: currentRow.title, text: "…", truncated: false },
}));

jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: jest.fn(async () => ({
    connections: [
      {
        id: "33333333-4444-5555-6666-777777777777",
        owner_type: "user",
        owner_user_id: "u1",
        organization_id: null,
        provider: "google",
        provider_subject: "sub-1",
        account_email: "maria.delgado@rinconplumbing.test",
        account_name: "Arman",
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        status: "connected",
        last_verified_at: "2026-09-18T14:00:00Z",
        last_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-09-18T14:00:00Z",
        metadata: {},
        credential_present: true,
        credential_stable: true,
        health: "connected",
        capability_health: null,
      },
    ],
    resources: [],
  })),
  listGoogleCapabilities: jest.fn(async () => [
    {
      key: "drive_files",
      rollout_phase: "available",
      eligible: true,
      required_scopes: [{ scope: "https://www.googleapis.com/auth/drive.file" }],
      admission_error: null,
    },
  ]),
  postGoogleBackend: (...args: Parameters<typeof postGoogleBackend>) =>
    postGoogleBackend(...args),
}));

/** The connector window the strip's own Reconnect opens — a callback, in place. */
const openGoogleConnect = jest.fn();
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => openGoogleConnect,
}));

/** The ONE Google Picker (lib/googlePicker), opened in place. */
let pickedFile: { id: string; name: string; mimeType: string; url: string | null } | null = null;
const pickGoogleWorkspaceFile = jest.fn(async () => pickedFile);
jest.mock("@/lib/googlePicker", () => ({
  pickGoogleWorkspaceFile: (...args: unknown[]) => pickGoogleWorkspaceFile(...(args as [])),
}));
jest.mock("@/features/google-workspace/drivePickerToken", () => ({
  getGoogleDrivePickerToken: jest.fn(async () => "picker-token"),
}));

const registerSelectedGoogleFile = jest.fn(async () => ({ id: "resource-1" }));
jest.mock("@/features/google-workspace/service", () => ({
  appendGoogleDocument: jest.fn(),
  approvalQueueHref: () => "/administration/approvals",
  SENT_FOR_APPROVAL_MESSAGE: "Sent for approval.",
  registerSelectedGoogleFile: (...args: unknown[]) =>
    registerSelectedGoogleFile(...(args as [])),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (id: string | null) => {
    if (!id) throw new Error("no organization");
    return id;
  },
}));
// The organization gate reads `state.appContext.organization_id` itself.
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" } }),
  }),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_org: unknown, _user: unknown, ref: { key: string }) =>
    ref.key === "on_open_min_age_seconds" ? 300 : "dated",
}));

const toasts = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toasts.success(...a),
    error: (...a: unknown[]) => toasts.error(...a),
    info: (...a: unknown[]) => toasts.info(...a),
  },
}));

function ports(): DetailHostPorts {
  return {
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/google_document/${DOC_ID}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells: {},
    doors: {
      RecordDoors: () => null,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
    reconnectSource: jest.fn(),
  } as unknown as DetailHostPorts;
}

function Detail() {
  const core = useDetailCore(
    { type: "google_document", id: DOC_ID, seed: null, list: null },
    "window",
    { onClose: () => {} },
  );
  return <DetailBody core={core} />;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports()}>
        <Detail />
      </DetailHostProvider>,
    );
  });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function click(container: HTMLElement, selector: string): Promise<void> {
  const control = container.querySelector<HTMLElement>(selector);
  if (!control) throw new Error(`no control matched ${selector}`);
  await act(async () => {
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const UNAVAILABLE_REASON =
  "This file was moved to a folder we cannot reach, so Google would not open it.";

beforeEach(() => {
  postGoogleBackend.mockClear();
  openGoogleConnect.mockClear();
  pickGoogleWorkspaceFile.mockClear();
  registerSelectedGoogleFile.mockClear();
  toasts.success.mockClear();
  toasts.error.mockClear();
  refreshAnswersGarbage = false;
  pickedFile = null;
  currentRow = googleDocumentRow({ synced_at: new Date().toISOString() });
});

describe("N7 — a wire-contract failure is one plain sentence with a remedy", () => {
  it("never prints the developer's sentence, and keeps it for the log", async () => {
    refreshAnswersGarbage = true;
    // Stale enough that opening the record spends the refresh that breaks.
    currentRow = googleDocumentRow({ synced_at: "2020-01-01T00:00:00Z" });
    const m = await mount();
    const shown = m.container.textContent ?? "";
    expect(shown).toContain("AI Matrx could not read Google's answer.");
    expect(shown).toContain("Try Refresh");
    expect(shown).not.toContain("without a usable");
    expect(shown).not.toContain("sync_status");
    m.unmount();
  });

  it("carries the developer detail on the error itself", async () => {
    const { GoogleWireContractError } = await import("../service");
    const error = new GoogleWireContractError(
      "The Google refresh answered without a usable id.",
    );
    expect(error.message).toBe(
      "AI Matrx could not read Google's answer. Try Refresh; if it keeps happening, reconnect the account.",
    );
    expect(error.developerDetail).toContain("without a usable id");
  });
});

describe("N8 — a refusal is followed by its remedy, never by reassurance", () => {
  beforeEach(() => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      sync_status: "unavailable",
      sync_status_reason: UNAVAILABLE_REASON,
    });
  });

  it("does not glue the product's promise onto the refusal", async () => {
    const m = await mount();
    const strip = m.container.querySelector("[data-detail-health]")!;
    const text = strip.textContent ?? "";
    expect(text).toContain("moved to a folder we cannot reach");
    expect(text).not.toContain("We never see the rest of your Drive");
    expect(text).not.toContain(WORKSPACE_PROMISE);
    m.unmount();
  });

  it("states what the person can do instead", async () => {
    const m = await mount();
    const text = m.container.querySelector("[data-detail-health]")!.textContent ?? "";
    expect(text).toMatch(/Try Refresh/);
    m.unmount();
  });
});

describe("N9 — the unavailable actions are callbacks, and they act in place", () => {
  beforeEach(() => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      sync_status: "unavailable",
      sync_status_reason: UNAVAILABLE_REASON,
    });
  });

  it("puts no link out of the record inside the primitive", async () => {
    const m = await mount();
    const notice = m.container.querySelector("[data-google-document-unavailable]")!;
    expect(notice.querySelectorAll("a").length).toBe(0);
    const text = notice.textContent ?? "";
    expect(text).toContain("Reconnect Google");
    expect(text).toContain("Choose the file again");
    expect(text).toContain("Keep as AI Matrx data");
    expect(text).toContain("Archive this record");
    expect(notice.querySelectorAll("button[disabled]").length).toBe(0);
    m.unmount();
  });

  it("opens the connector window in place, naming this record", async () => {
    const m = await mount();
    await click(m.container, "[data-google-document-reconnect]");
    expect(openGoogleConnect).toHaveBeenCalledTimes(1);
    const options = openGoogleConnect.mock.calls[0][0] as {
      reason?: string;
      initialConnectionId?: string | null;
    };
    expect(options.reason).toContain("Google Doc");
    expect(options.initialConnectionId).toBe(CONNECTION_ID);
    m.unmount();
  });

  it("opens the Google Picker in place and re-registers the same file", async () => {
    pickedFile = {
      id: FILE_ID,
      name: "Q3 Plan",
      mimeType: "application/vnd.google-apps.document",
      url: null,
    };
    const m = await mount();
    await click(m.container, "[data-google-document-repick]");
    expect(pickGoogleWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(registerSelectedGoogleFile).toHaveBeenCalledWith(CONNECTION_ID, FILE_ID);
    // And the record is refreshed from the file it just regained access to.
    expect(
      postGoogleBackend.mock.calls.filter(([path]) => path.includes("/documents/refresh")).length,
    ).toBeGreaterThan(0);
    m.unmount();
  });

  it("says so plainly when the person picked a different file", async () => {
    pickedFile = {
      id: "some-other-file-id",
      name: "Somebody else's doc",
      mimeType: "application/vnd.google-apps.document",
      url: null,
    };
    const m = await mount();
    await click(m.container, "[data-google-document-repick]");
    expect(registerSelectedGoogleFile).not.toHaveBeenCalled();
    const text = m.container.querySelector("[data-google-document-unavailable]")!.textContent ?? "";
    expect(text).toContain("different file");
    expect(text).toContain("Somebody else's doc");
    m.unmount();
  });
});

describe("N12 + N14 — the door to Google, and what it is called", () => {
  it("derives the link from the file id when the row has no url", async () => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      external_url: null,
    });
    const m = await mount();
    const link = m.container.querySelector<HTMLAnchorElement>("[data-detail-health] a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(
      `https://docs.google.com/document/d/${FILE_ID}/edit`,
    );
    m.unmount();
  });

  it("derives a Sheet's link from the same id, in the Sheets shape", async () => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      external_url: null,
      mime_kind: "spreadsheet",
    });
    const m = await mount();
    const link = m.container.querySelector<HTMLAnchorElement>("[data-detail-health] a");
    expect(link!.getAttribute("href")).toBe(
      `https://docs.google.com/spreadsheets/d/${FILE_ID}/edit`,
    );
    m.unmount();
  });

  it("names the provider on the control instead of saying 'Open at source'", async () => {
    currentRow = googleDocumentRow({ synced_at: new Date().toISOString() });
    const m = await mount();
    const link = m.container.querySelector<HTMLAnchorElement>("[data-detail-health] a");
    expect(link!.textContent).toContain("Open in Google");
    expect(link!.textContent).not.toContain("Open at source");
    m.unmount();
  });

  it("never tells the person to open it in Google with no way to do so", async () => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      external_url: null,
      body_text: null,
    });
    const m = await mount();
    const empty = m.container.querySelector("[data-google-document-body-empty]")!;
    expect(empty.textContent).toContain("open it in Google");
    // The instruction the copy gives is honoured on the same screen.
    expect(
      m.container.querySelector<HTMLAnchorElement>("[data-google-document-open-in-google]")!
        .getAttribute("href"),
    ).toBe(`https://docs.google.com/document/d/${FILE_ID}/edit`);
    m.unmount();
  });
});
