/**
 * @jest-environment jsdom
 *
 * A NOTICE NEVER MOVES THE PAGE (Arman, 2026-09-30; widened by ruling 4, 2026-10-01).
 *
 * `useOpenNotice` is the one opener behind the bell, the phone sheet and the inbox.
 *   ?panels= with a hydrator → the window opens in place through the REAL registry
 *   ?panels= with no hydrator → a NEW TAB, announced (notice-no-hydrator)
 *   a route with a window      → that window, in place
 *   any other route            → a NEW TAB, announced once (notice-no-window)
 *   external                   → a new tab
 * Before 2026-10-01 the last two navigated the page with router.push.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatched: Array<{ type: string; payload?: { overlayId?: string } }> = [];
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: { type: string }) => {
    dispatched.push(action);
    return action;
  },
}));
const captureError = jest.fn(() => "captured");
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: (...a: unknown[]) => captureError(...(a as [])) }));
const testHydrator = jest.fn();
jest.mock("@/features/window-panels/url-sync/initUrlHydration", () => ({
  initUrlHydration: () => {
    const { registerPanelHydrator } = require("@/features/window-panels/url-sync/UrlPanelRegistry");
    registerPanelHydrator("test_window", testHydrator);
  },
}));

import { useOpenNotice } from "../openNotice";
import type { InboxNotification } from "../types";

function notice(deep_link: string | null, event_key = "mandate.candidate.pair_finished"): InboxNotification {
  const at = new Date().toISOString();
  return {
    id: "n-1", event_key, event_label: null, bucket: "direct", subject: "x", body: null, deep_link,
    target_kind: null, target_id: null, organization_id: null, organization_name: null,
    actor_id: null, actor_name: null, actor_avatar: null, created_at: at, sort_at: at,
    seen_at: null, read_at: null, done_at: null, snoozed_until: null, acted_at: null, outcome: null,
  };
}

let open: ReturnType<typeof useOpenNotice> | null = null;
function Probe() {
  open = useOpenNotice();
  return null;
}

let container: HTMLDivElement;
let root: Root;
let windowOpen: jest.SpyInstance;
beforeEach(async () => {
  dispatched.length = 0;
  captureError.mockClear();
  testHydrator.mockClear();
  windowOpen = jest.spyOn(window, "open").mockImplementation(() => null);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => { root.render(<Probe />); });
});
afterEach(() => {
  act(() => root.unmount());
  jest.restoreAllMocks();
});
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

it("opens a ?panels= window in place through its hydrator", async () => {
  open?.(notice("/detail/x.abc?panels=test_window:abc:as-window"));
  await flush();
  expect(testHydrator).toHaveBeenCalledWith(expect.any(Function), "abc", { as: "window" });
  expect(windowOpen).not.toHaveBeenCalled();
});

it("opens a new tab, announced, when the window key has no hydrator", async () => {
  open?.(notice("/somewhere?panels=no_such_window:x"));
  await flush();
  expect(testHydrator).not.toHaveBeenCalled();
  expect(windowOpen).toHaveBeenCalledWith(`${window.location.origin}/somewhere?panels=no_such_window:x`, "_blank", "noopener,noreferrer");
  expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ code: "notice-no-hydrator" }));
});

it("opens a route's own window in place", () => {
  expect(open?.(notice("/notifications"))).toBe("window");
  expect(dispatched[0]?.payload?.overlayId).toBe("notificationsInboxWindow");
  expect(windowOpen).not.toHaveBeenCalled();
});

it("opens any other route in a new tab and announces the missing window once per event type", () => {
  expect(open?.(notice("/hr/tasks/1", "hr.workflow.step_assigned"))).toBe("tab");
  open?.(notice("/hr/tasks/2", "hr.workflow.step_assigned"));
  expect(windowOpen).toHaveBeenCalledTimes(2);
  expect(captureError).toHaveBeenCalledTimes(1);
  expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ code: "notice-no-window" }));
});

it("opens an external link in a new tab and a link-less notice nowhere", () => {
  expect(open?.(notice("https://example.com/a"))).toBe("tab");
  expect(open?.(notice(null))).toBe("none");
  expect(windowOpen).toHaveBeenCalledTimes(1);
});

it("opens nothing for a link that is not the web or ours (javascript:, data:, /\\host)", () => {
  expect(open?.(notice("javascript:alert(1)"))).toBe("none");
  expect(open?.(notice("data:text/html,x"))).toBe("none");
  expect(open?.(notice("/\\evil.example"))).toBe("none");
  expect(windowOpen).not.toHaveBeenCalled();
});
