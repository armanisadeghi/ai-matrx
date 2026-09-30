/**
 * @jest-environment jsdom
 *
 * Mandate Candidates F1 — A NOTICE NEVER MOVES THE PAGE (Arman, 2026-09-30: "I want to get a window
 * panel and a link to open whatever I need in a new tab. never disrupt the page we're on.").
 *
 * Use case: a person is half-way through a form; the bell says a candidate pair finished. Clicking
 * the notice opens the pair's window over the form — the router is never asked to navigate — and the
 * notice is marked read. The ↗ control opens the same link in a new tab, where `?panels=` hydrates.
 * A notice whose window key this build cannot open navigates instead, and says so out loud.
 *
 * The hydrator table is the REAL registry (`UrlPanelRegistry`) and the token grammar is the REAL
 * `parseParams`; only the table's population (`initUrlHydration`, which imports every window
 * family) is replaced by one registered test window.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("server-only", () => ({}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const dispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => undefined,
}));

const markRead = jest.fn(() => Promise.resolve());
let rows: Array<Record<string, unknown>> = [];
jest.mock("../useInbox", () => ({
  useInboxCounts: () => ({
    notifications: 1,
    conversations: 0,
    approvals: 0,
    workByOrganization: [],
    partial: false,
  }),
  useInboxList: () => ({
    rows,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
    markRead,
    markAllRead: jest.fn(() => Promise.resolve(0)),
  }),
}));

jest.mock("@/features/overlays/openers/messagesWindow", () => ({ useOpenMessagesWindow: () => jest.fn() }));
jest.mock("@/features/overlays/openers/approvalsWindow", () => ({ useOpenApprovalsWindow: () => jest.fn() }));
jest.mock("../components/NotificationBody", () => ({
  NotificationBody: ({ body }: { body: string }) => <span>{body}</span>,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const captureError = jest.fn(() => "captured");
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: (...a: unknown[]) => captureError(...(a as [])) }));

const testHydrator = jest.fn();
jest.mock("@/features/window-panels/url-sync/initUrlHydration", () => ({
  initUrlHydration: () => {
    const { registerPanelHydrator } = require("@/features/window-panels/url-sync/UrlPanelRegistry");
    registerPanelHydrator("test_window", testHydrator);
  },
}));

import { InboxPanel } from "../components/InboxPanel";

function notice(deep_link: string | null): Record<string, unknown> {
  return {
    id: "n-1",
    event_key: "mandate.candidate.pair_finished",
    subject: "Candidate pair finished",
    body: "2 of 3 in",
    deep_link,
    target_kind: null,
    target_id: null,
    organization_id: null,
    created_at: new Date().toISOString(),
    delivered_at: null,
    read_at: null,
    acted_at: null,
    outcome: null,
  };
}

let container: HTMLDivElement;
let root: Root;
let consoleError: jest.SpyInstance;
beforeEach(() => {
  push.mockClear();
  dispatch.mockClear();
  markRead.mockClear();
  testHydrator.mockClear();
  captureError.mockClear();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  consoleError.mockRestore();
});

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function renderWith(link: string | null) {
  rows = [notice(link)];
  await act(async () => { root.render(<InboxPanel variant="page" />); });
}

function rowButton(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('button[aria-label^="Unread: "]');
  if (!btn) throw new Error("notice row not rendered");
  return btn;
}

it("opens a ?panels= window in place and never asks the router to navigate", async () => {
  await renderWith("/detail/mandate_candidate_run.abc?panels=test_window:abc:as-window");
  await act(async () => { rowButton().click(); });
  await flush();
  expect(push).not.toHaveBeenCalled();
  expect(testHydrator).toHaveBeenCalledWith(dispatch, "abc", { as: "window" });
  expect(markRead).toHaveBeenCalledWith("n-1");
});

it("falls back to navigating — and announces it — when the window key has no hydrator", async () => {
  const link = "/somewhere?panels=no_such_window:x";
  await renderWith(link);
  await act(async () => { rowButton().click(); });
  await flush();
  expect(testHydrator).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith(link);
  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("no_such_window"));
  expect(captureError).toHaveBeenCalledWith(
    expect.objectContaining({ code: "notice-no-hydrator", source: "url-panel-unopened" }),
  );
});

it("keeps today's behaviour for an internal link with no window token", async () => {
  await renderWith("/agents/all");
  await act(async () => { rowButton().click(); });
  await flush();
  expect(push).toHaveBeenCalledWith("/agents/all");
});

it("gives every linked row an Open-in-new-tab control that carries the same link and marks it read", async () => {
  const link = "/detail/x.1?panels=test_window:1";
  await renderWith(link);
  const found = container.querySelector<HTMLAnchorElement>('a[aria-label^="Open in new tab"]');
  expect(found).not.toBeNull();
  const a = found as HTMLAnchorElement;
  expect(a.getAttribute("target")).toBe("_blank");
  expect(a.getAttribute("rel")).toContain("noopener");
  expect(a.href).toBe(`${window.location.origin}${link}`);
  a.addEventListener("click", (e) => e.preventDefault());
  await act(async () => { a.click(); });
  expect(markRead).toHaveBeenCalledWith("n-1");
  expect(push).not.toHaveBeenCalled();
});

it("shows no new-tab control on a row with no link (absent, never dead)", async () => {
  await renderWith(null);
  expect(container.querySelector('a[aria-label^="Open in new tab"]')).toBeNull();
});
