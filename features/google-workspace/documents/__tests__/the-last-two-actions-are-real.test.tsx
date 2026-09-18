/**
 * 🚨 PLAN §4.1 — THE LAST TWO OF THE FOUR UNAVAILABLE ACTIONS ARE REAL CALLS.
 *
 * Until B-29 built the server half, "Keep as AI Matrx data" and "Archive this
 * record" were honest words ("not wired up yet"). They are buttons now, and these
 * tests are about the three ways a button like that lies to a person: by running
 * without saying what it costs, by sending the wrong record or the wrong
 * workspace, and by claiming it worked when the server refused.
 *
 * Every test here was run against the code with the behaviour it names removed,
 * and every one of them failed first (see features/google-workspace/FEATURE.md).
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { GoogleDocumentPanel } from "../GoogleDocumentPanel";
import { DOC_ID, ORG_ID, googleDocumentRow } from "./fixtures";
import type { GoogleDocumentRow } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentRow: GoogleDocumentRow = googleDocumentRow({
  sync_status: "unavailable",
  sync_status_reason: "Google says you no longer have access to this file.",
});

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

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
let nextResponse: (path: string) => unknown = () => ({});
let failWith: string | null = null;

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body });
    if (failWith) throw new Error(failWith);
    return { status: 200, json: async () => nextResponse(path) };
  },
}));

jest.mock("@/features/google-workspace/service", () => ({
  appendGoogleDocument: jest.fn(),
  approvalQueueHref: () => "/administration/approvals",
  SENT_FOR_APPROVAL_MESSAGE: "Sent for approval.",
}));

jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (id: string | null) => {
    if (!id) throw new Error("no organization");
    return id;
  },
}));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => ORG_ID }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => ORG_ID,
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_o: unknown, _u: unknown, ref: { key: string }) =>
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

/** What the confirm dialog was asked, and what it answers. */
const confirmations: Array<{ title?: string; description?: string; confirmLabel?: string }> = [];
let confirmAnswer = true;
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async (options: { title?: string; description?: string; confirmLabel?: string }) => {
    confirmations.push(options);
    return confirmAnswer;
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function mount(row: GoogleDocumentRow): Promise<void> {
  currentRow = row;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<GoogleDocumentPanel initialRow={row} />);
  });
}

async function click(selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`no control matched ${selector}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {});
}

beforeEach(() => {
  calls.length = 0;
  confirmations.length = 0;
  confirmAnswer = true;
  failWith = null;
  toasts.success.mockClear();
  toasts.error.mockClear();
  nextResponse = () => ({});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const UNAVAILABLE = googleDocumentRow({
  sync_status: "unavailable",
  sync_status_reason: "Google says you no longer have access to this file.",
});

test("Keep as AI Matrx data names what it costs, then detaches this record in its own organization", async () => {
  nextResponse = () => ({
    id: DOC_ID,
    table: "workbench.google_document",
    entity_token: "google_document",
    organization_id: ORG_ID,
    label: "Q3 Plan",
    sync_status: "detached",
    sync_status_reason: "Kept as Matrx data on 2026-09-18: this Google document no longer refreshes from Google.",
    archived: false,
    changed: true,
  });
  await mount(UNAVAILABLE);

  await click("[data-google-document-keep]");

  // THE CONSEQUENCE IS NAMED FIRST, and not as a generic "Are you sure?".
  expect(confirmations).toHaveLength(1);
  const asked = confirmations[0];
  expect(asked.title).toBe("Keep as AI Matrx data");
  expect(asked.description).toContain("stops refreshing from Google");
  expect(asked.description).toContain("keeps exactly what it has today");
  expect(asked.description).toContain("Nothing changes in your Google account");
  expect(asked.description).toContain("cannot be undone");
  expect(asked.confirmLabel).toBe("Keep as AI Matrx data");

  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe(
    `/google-sync/records/workbench.google_document/${DOC_ID}/detach`,
  );
  // THE RECORD'S OWN ORGANIZATION, carried on the request — never resolved server-side.
  expect(calls[0].body).toEqual({ organization_id: ORG_ID });
  expect(toasts.success).toHaveBeenCalled();
  expect(toasts.error).not.toHaveBeenCalled();
});

test("Archive names that it is recoverable, then archives this record", async () => {
  nextResponse = () => ({
    id: DOC_ID,
    table: "workbench.google_document",
    entity_token: "google_document",
    organization_id: ORG_ID,
    label: "Q3 Plan",
    sync_status: "unavailable",
    sync_status_reason: "Google says you no longer have access to this file.",
    archived: true,
    changed: true,
  });
  await mount(UNAVAILABLE);

  await click("[data-google-document-archive]");

  const asked = confirmations[0];
  expect(asked.title).toBe("Archive this record");
  expect(asked.description).toContain("recoverable from the archive");
  expect(asked.description).toContain("nothing here is destroyed");
  expect(asked.description).toContain("Google is untouched");
  expect(calls[0].path).toBe(
    `/google-sync/records/workbench.google_document/${DOC_ID}/archive`,
  );
  expect(calls[0].body).toEqual({ organization_id: ORG_ID });
  // The panel does not pretend the record is still live underneath it.
  expect(container.querySelector("[data-google-document-archived]")?.textContent).toContain(
    "recoverable from the archive",
  );
});

test("declining the dialog calls nothing at all", async () => {
  confirmAnswer = false;
  await mount(UNAVAILABLE);

  await click("[data-google-document-keep]");
  await click("[data-google-document-archive]");

  expect(confirmations).toHaveLength(2);
  expect(calls).toEqual([]);
  expect(toasts.success).not.toHaveBeenCalled();
});

test("a server refusal is shown and nothing on screen pretends it worked", async () => {
  failWith = "You do not have editor access to this Google document, so it cannot be kept as Matrx data.";
  await mount(UNAVAILABLE);

  await click("[data-google-document-keep]");

  expect(toasts.error).toHaveBeenCalledWith(
    expect.stringContaining("do not have editor access"),
  );
  expect(toasts.success).not.toHaveBeenCalled();
  expect(container.querySelector("[data-google-document-archived]")).toBeNull();
  expect(container.querySelector("[data-google-document-unavailable]")).not.toBeNull();
});

test("a record already kept as AI Matrx data says so, offers no Keep, and never refreshes on open", async () => {
  const detached = googleDocumentRow({
    sync_status: "detached",
    sync_status_reason:
      "Kept as Matrx data on 2026-09-18: this Google document no longer refreshes from Google and keeps what it had that day.",
    // Stale enough that an `available` record would have spent a refresh on open.
    synced_at: "2020-01-01T00:00:00Z",
  });
  await mount(detached);

  const notice = container.querySelector("[data-google-document-detached]");
  expect(notice?.textContent).toContain("no longer refreshes from Google");
  expect(notice?.textContent).toContain("pick the file in Google once more");
  expect(container.querySelector("[data-google-document-keep]")).toBeNull();
  expect(container.querySelector("[data-google-document-archive]")).not.toBeNull();
  // A refresh-on-open here would be the screen undoing the person's choice.
  expect(calls).toEqual([]);
});

test("a record kept as AI Matrx data renders no Append composer, and says why (Cursor Bugbot, B-29 review)", async () => {
  const detached = googleDocumentRow({
    sync_status: "detached",
    sync_status_reason:
      "Kept as Matrx data on 2026-09-18: this Google document no longer refreshes from Google and keeps what it had that day.",
  });
  await mount(detached);

  // Appending would either call a Google file this record no longer reaches, or
  // toast success while the detached body silently never updates — so the
  // composer is gone, not disabled-looking (Law 4).
  expect(container.querySelector("[data-google-document-append]")).toBeNull();
  const disabledNotice = container.querySelector("[data-google-document-append-disabled]");
  expect(disabledNotice).not.toBeNull();
  expect(disabledNotice?.textContent).toContain("Appends go to the Google file");
  expect(disabledNotice?.textContent).toContain("this record no longer does");
});

test("an available record still renders the Append composer (positive control)", async () => {
  const available = googleDocumentRow({ sync_status: "available" });
  await mount(available);

  expect(container.querySelector("[data-google-document-append]")).not.toBeNull();
  expect(container.querySelector("[data-google-document-append-disabled]")).toBeNull();
});
