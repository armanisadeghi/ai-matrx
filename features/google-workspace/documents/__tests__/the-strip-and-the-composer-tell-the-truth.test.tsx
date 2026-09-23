/**
 * 🚨 PLAN §4.1 + §5.3 — THE HEALTH STRIP HAS A REAL SUBJECT, THE FOUR
 * UNAVAILABLE ACTIONS ARE HONEST, REFRESH SPENDS A CALL ONLY WHEN STALE, AND THE
 * APPEND SENDS EXACTLY THE BLOCK IT SHOWED.
 *
 * WHY THESE FOUR LIVE IN ONE SUITE: they are the four ways this panel could lie
 * to a person about someone else's document — by saying a file is fine when
 * Google refuses it, by offering a control that does nothing, by claiming
 * freshness it did not fetch, and by sending bytes it did not show.
 *
 * The connector half is deliberately HEALTHY here (a connected account, a
 * granted product), because the point is the file: a grant that works and a file
 * that Google will not hand over is precisely the case a product-level strip gets
 * wrong.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { DetailBody } from "@/lib/detail/core/DetailBody";
import { useDetailCore } from "@/lib/detail/core/useDetailCore";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import { resolveItemDetailType } from "@/features/item-presentation/detail";

import { CONNECTION_ID, DOC_ID, FILE_ID, googleDocumentRow } from "./fixtures";
import { GOOGLE_DOCUMENT_ITEM_TYPE } from "../itemType";
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

/** The row every read in one test returns. Set per test. */
let currentRow: GoogleDocumentRow = googleDocumentRow();

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
    maybeSingle: async () => ({ data: rowForRead(), error: null }),
  });
  return { supabase: chain, createClient: () => chain };
});

function rowForRead(): GoogleDocumentRow {
  return currentRow;
}

const postGoogleBackend = jest.fn(async (path: string, body: Record<string, unknown>) => ({
  status: 200,
  json: async () =>
    path.includes("/documents/refresh")
      ? {
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

/**
 * F-60 (N9): the unavailable notice's Reconnect and "Choose the file again" are
 * callbacks that act in place — the connector window and THE Google Picker.
 * `a-refusal-says-what-to-do.test.tsx` drives both; here they are stubbed.
 */
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => jest.fn(),
}));
jest.mock("@/lib/googlePicker", () => ({ pickGoogleWorkspaceFile: jest.fn() }));
jest.mock("@/features/google-workspace/drivePickerToken", () => ({
  getGoogleDrivePickerToken: jest.fn(),
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
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
}));

let refreshFloorSeconds = 300;
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (
    _org: unknown,
    _user: unknown,
    ref: { feature: string; key: string },
  ) => (ref.key === "on_open_min_age_seconds" ? floor() : "dated"),
}));
function floor(): number {
  return refreshFloorSeconds;
}

const toasts = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => toasts.success(...a), error: (...a: unknown[]) => toasts.error(...a), info: (...a: unknown[]) => toasts.info(...a) } }));

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

function refreshCalls(): number {
  return postGoogleBackend.mock.calls.filter(([path]) => path.includes("/documents/refresh"))
    .length;
}

beforeEach(() => {
  postGoogleBackend.mockClear();
  toasts.success.mockClear();
  toasts.error.mockClear();
  toasts.info.mockClear();
  refreshFloorSeconds = 300;
  currentRow = googleDocumentRow({ synced_at: new Date().toISOString() });
});

describe("a file Google will not hand over, on a perfectly healthy account", () => {
  beforeEach(() => {
    currentRow = googleDocumentRow({
      synced_at: new Date().toISOString(),
      sync_status: "unavailable",
      sync_status_reason:
        "This file was moved to a folder we cannot reach, so Google would not open it.",
    });
  });

  it("does NOT say the record is fine because the grant is", async () => {
    const m = await mount();
    const strip = m.container.querySelector("[data-detail-health]")!;
    expect(strip.textContent).toContain("Google");
    expect(strip.textContent).toContain("moved to a folder we cannot reach");
    m.unmount();
  });

  it("offers the four actions, and never a control that does nothing", async () => {
    const m = await mount();
    const notice = m.container.querySelector("[data-google-document-unavailable]")!;
    const text = notice.textContent ?? "";
    expect(text).toContain("Reconnect Google");
    expect(text).toContain("Choose the file again");
    expect(text).toContain("Keep as AI Matrx data");
    expect(text).toContain("Archive this record");
    // ALL FOUR ARE REAL NOW (B-29) AND ALL FOUR ACT HERE (F-60, N9): the first two
    // were full-page anchors to a settings screen, which left the record the
    // person was reading and, for "Choose the file again", never reached the
    // Picker it promised. Nothing inside the primitive navigates away, so the
    // count of links out of the record is ZERO. Nothing here says "not wired up
    // yet" any more, and nothing here is a disabled-looking control.
    expect(notice.querySelectorAll("a").length).toBe(0);
    expect(text).not.toContain("not wired up yet");
    expect(notice.querySelectorAll("button[disabled]").length).toBe(0);
    expect(notice.querySelector("[data-google-document-keep]")).not.toBeNull();
    expect(notice.querySelector("[data-google-document-archive]")).not.toBeNull();
    m.unmount();
  });

  it("still shows the copy we hold — an unreachable file is not a blank screen", async () => {
    const m = await mount();
    expect(m.container.querySelector("[data-google-document-body]")?.textContent).toContain(
      "Ship the connector.",
    );
    m.unmount();
  });
});

describe("an available file", () => {
  it("renders the strip with the grant AND no file complaint", async () => {
    const m = await mount();
    const strip = m.container.querySelector("[data-detail-health]")!;
    expect(strip.textContent).toContain("Google");
    expect(strip.textContent).not.toContain("would not give us");
    expect(m.container.querySelector("[data-google-document-unavailable]")).toBeNull();
    m.unmount();
  });

  it("offers Refresh on the strip — the primitive's own control, wired", async () => {
    const m = await mount();
    const strip = m.container.querySelector("[data-detail-health]")!;
    const button = Array.from(strip.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Refresh"),
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(refreshCalls()).toBe(1);
    const [path, body] = postGoogleBackend.mock.calls.find(([p]) =>
      p.includes("/documents/refresh"),
    )!;
    expect(path).toBe("/google-sync/documents/refresh");
    // The organization is SENT: the server chooses nothing.
    expect(body).toMatchObject({ file_id: FILE_ID });
    expect(typeof (body as { organization_id?: unknown }).organization_id).toBe("string");
    m.unmount();
  });
});

describe("refresh on open", () => {
  it("spends NO Google call for a record refreshed a minute ago", async () => {
    currentRow = googleDocumentRow({ synced_at: new Date(Date.now() - 60_000).toISOString() });
    const m = await mount();
    expect(refreshCalls()).toBe(0);
    m.unmount();
  });

  it("spends ONE Google call for a record older than the floor", async () => {
    currentRow = googleDocumentRow({ synced_at: new Date(Date.now() - 3_600_000).toISOString() });
    const m = await mount();
    expect(refreshCalls()).toBe(1);
    m.unmount();
  });

  it("spends ONE Google call for a record that has never been refreshed", async () => {
    currentRow = googleDocumentRow({ synced_at: null, body_text: null });
    const m = await mount();
    expect(refreshCalls()).toBe(1);
    m.unmount();
  });

  it("honours an organization that raised the floor above the record's age", async () => {
    refreshFloorSeconds = 86_400;
    currentRow = googleDocumentRow({ synced_at: new Date(Date.now() - 3_600_000).toISOString() });
    const m = await mount();
    expect(refreshCalls()).toBe(0);
    m.unmount();
  });
});

describe("the Append composer", () => {
  async function type(container: HTMLElement, text: string) {
    const field = container.querySelector(
      "[data-google-document-append] textarea",
    ) as HTMLTextAreaElement;
    // React tracks the controlled value on the node; assigning `.value`
    // directly hides the change from it, so go through the native setter.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return field;
  }

  it("shows no preview and no Append until there is something to add", async () => {
    const m = await mount();
    expect(m.container.querySelector("[data-google-document-append-preview]")).toBeNull();
    m.unmount();
  });

  it("shows the exact block, naming the document and the dated heading", async () => {
    const m = await mount();
    await type(m.container, "We agreed to ship Friday.");
    const preview = m.container.querySelector("[data-google-document-append-preview]")!;
    expect(preview.textContent).toContain("Added from AI Matrx");
    expect(preview.textContent).toContain("We agreed to ship Friday.");
    expect(m.container.textContent).toContain("Q3 Plan");
    m.unmount();
  });

  it("sends EXACTLY the bytes it showed, to the file the record names", async () => {
    const m = await mount();
    await type(m.container, "We agreed to ship Friday.");
    const shown = m.container.querySelector("[data-google-document-append-preview]")!.textContent;
    const append = Array.from(
      m.container.querySelectorAll("[data-google-document-append] button"),
    ).find((b) => b.textContent === "Append")!;
    await act(async () => {
      append.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    const call = postGoogleBackend.mock.calls.find(([p]) => p.includes("/documents/append"));
    expect(call).toBeDefined();
    const body = call![1] as { file_id: string; text: string; connection_id: string };
    expect(body.file_id).toBe(FILE_ID);
    expect(body.connection_id).toBe(CONNECTION_ID);
    expect(body.text).toBe(shown);
    m.unmount();
  });
});

/**
 * 🚨 Cursor Bugbot, B-29 review — the item card's "In Google" line must not
 * flatten every non-`available` status into "Not reachable right now". A
 * detached record is a CHOICE, not an outage, and the card must not contradict
 * the health strip's own honest "kept as AI Matrx data" state.
 */
describe("the item card's In Google line (itemType.enrich)", () => {
  it("gives a detached record its own sentence, not the outage sentence", async () => {
    currentRow = googleDocumentRow({
      sync_status: "detached",
      sync_status_reason: "Kept as Matrx data on 2026-09-18.",
    });
    const item = await GOOGLE_DOCUMENT_ITEM_TYPE.enrich!({} as never, DOC_ID);
    if ("notFound" in item) throw new Error("expected an enriched item");
    const line = item.details?.find((d) => d.label === "In Google");
    expect(line?.value).toBe("Kept as Matrx data on 2026-09-18.");
    expect(line?.value).not.toContain("Not reachable");
  });

  it("falls back to a plain 'Kept as AI Matrx data' when detached with no reason", async () => {
    currentRow = googleDocumentRow({ sync_status: "detached", sync_status_reason: null });
    const item = await GOOGLE_DOCUMENT_ITEM_TYPE.enrich!({} as never, DOC_ID);
    if ("notFound" in item) throw new Error("expected an enriched item");
    const line = item.details?.find((d) => d.label === "In Google");
    expect(line?.value).toBe("Kept as AI Matrx data");
  });

  it("keeps the unavailable sentence unchanged", async () => {
    currentRow = googleDocumentRow({
      sync_status: "unavailable",
      sync_status_reason: "Google would not open this file.",
    });
    const item = await GOOGLE_DOCUMENT_ITEM_TYPE.enrich!({} as never, DOC_ID);
    if ("notFound" in item) throw new Error("expected an enriched item");
    const line = item.details?.find((d) => d.label === "In Google");
    expect(line?.value).toBe("Not reachable right now");
  });

  it("says nothing about Google reachability for an available record", async () => {
    currentRow = googleDocumentRow({ sync_status: "available" });
    const item = await GOOGLE_DOCUMENT_ITEM_TYPE.enrich!({} as never, DOC_ID);
    if ("notFound" in item) throw new Error("expected an enriched item");
    expect(item.details?.find((d) => d.label === "In Google")).toBeUndefined();
  });
});
