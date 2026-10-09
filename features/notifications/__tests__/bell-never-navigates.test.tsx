/**
 * @jest-environment jsdom
 *
 * OWNER RULING 4 (2026-10-01) — THE BELL NEVER MOVES THE PAGE.
 * common-docs/systems/communications/notifications/FEATURE.md §0a, §3.9.
 *
 * Use case: a person is half-way through a form and opens the bell. Whatever they
 * click in it — a notice of any link kind, a source in All places, the footer —
 * opens a window over the form or a new tab. The router is never asked to move,
 * and no same-tab link is followed.
 *
 * The test renders the bell's body with one notice of EVERY link kind and clicks
 * every button and link it finds. It fails on any `router.push` / `router.replace`
 * / `router.back`, and on any click of an anchor that is not `target="_blank"`.
 * Red against the pre-2026-10-01 panel (InboxPanel); see FEATURE.md change log.
 *
 * A static half refuses `next/navigation`'s router, `next/link` and `AppLink` in
 * every file of the bell's tree.
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("server-only", () => ({}));

const routerCalls: string[] = [];
const router = {
  push: (href: string) => routerCalls.push(`push ${href}`),
  replace: (href: string) => routerCalls.push(`replace ${href}`),
  back: () => routerCalls.push("back"),
  forward: () => routerCalls.push("forward"),
  refresh: () => undefined,
  prefetch: () => undefined,
};
jest.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/form-in-progress",
  useSearchParams: () => new URLSearchParams(),
}));

const dispatched: unknown[] = [];
const dispatch = (action: unknown) => {
  dispatched.push(action);
  return action;
};
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => "user-1",
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

function notice(id: string, deep_link: string | null, extra: Record<string, unknown> = {}) {
  const at = new Date(Date.now() - Number(id.replace(/\D/g, "") || 1) * 60_000).toISOString();
  return {
    id,
    event_key: "hr.workflow.step_assigned",
    event_label: "Approval step assigned",
    bucket: "needs_you",
    subject: null,
    body: "Please look",
    deep_link,
    target_kind: null,
    target_id: null,
    organization_id: null,
    organization_name: null,
    actor_id: null,
    actor_name: null,
    actor_avatar: null,
    created_at: at,
    sort_at: at,
    seen_at: null,
    delivered_at: null,
    read_at: null,
    done_at: null,
    snoozed_until: null,
    acted_at: null,
    outcome: null,
    ...extra,
  };
}

const ROWS = [
  notice("n1", "/hr/tasks/abc?org=1"),
  notice("n2", "/somewhere?panels=no_such_window:x"),
  notice("n3", "https://example.com/x"),
  notice("n4", null),
  notice("n5", "/notifications", { bucket: "direct", event_key: "agent.work_completed" }),
  notice("n6", "/data/t1", { bucket: "updates", event_key: "records.changed", target_kind: "custom.record", target_id: "r1" }),
];

const noop = () => Promise.resolve();
jest.mock("../useInbox", () => ({
  // today's panel
  useInboxList: () => ({ rows: ROWS, error: null, isLoading: false, refetch: () => undefined, markRead: noop, markAllRead: () => Promise.resolve(0) }),
  // both
  useInboxCounts: () => ({
    notifications: 3,
    approvals: 2,
    work: 4,
    workByOrganization: [{ organization_id: "o1", organization_name: "Acme", waiting: 4, snoozed: 1, overdue: 0 }],
    workSnoozed: 1,
    summary: { unseenNeedsYou: 1, unseenDirect: 1, unseenUpdates: 1, unread: 3, inbox: 6, snoozed: 1, done: 2 },
    triage: true,
    badge: 2,
    updatesDot: true,
    total: 9,
    partial: false,
    markSeen: () => undefined,
  }),
  // the redesigned bell
  useInboxFeed: () => ({ rows: ROWS, triage: true, isLoading: false, error: null, refetch: () => undefined, hasMore: false, loadMore: () => undefined, loadingMore: false }),
  useInboxActions: () => ({ act: noop, undo: noop, canUndo: false, markAllRead: noop, clear: () => Promise.resolve(0) }),
  useInboxKinds: () => ({ data: [{ eventKey: "hr.workflow.request_submitted", label: "Request submitted", bucket: "needs_you", notices: 56, unseen: 0 }] }),
  useWorkWaiting: () => ({ data: [{ organization_id: "o1", organization_name: "Acme", waiting: 4, snoozed: 1, overdue: 0 }], isLoading: false, isError: false }),
  belongsIn: () => true,
}));
jest.mock("@/features/approvals/usePendingApprovalCount", () => ({ usePendingApprovalCount: () => ({ count: 2, unknown: false, storeCount: 0 }) }));
jest.mock("@/features/workflow-runtime/discovery/useWaitingRuns", () => ({ useWaitingRuns: () => ({ rows: [{}], loading: false, error: null, refresh: () => undefined }) }));
jest.mock("@/features/assists/service", () => ({ queryAssists: () => Promise.resolve({ rows: [], total: 3, unreadable: 0 }) }));
jest.mock("@/features/tasks/services/taskUserStateService", () => ({ listMyTaskUserStates: () => Promise.resolve([]) }));
jest.mock("@/features/overlays/openers/messagesWindow", () => ({ useOpenMessagesWindow: () => () => undefined }));
jest.mock("@/features/overlays/openers/approvalsWindow", () => ({ useOpenApprovalsWindow: () => () => undefined }));
jest.mock("../components/NotificationBody", () => ({ NotificationBody: ({ body }: { body: string }) => <span>{body}</span> }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));
jest.mock("@/lib/toast", () => ({ toast: Object.assign(() => undefined, { error: () => undefined, success: () => undefined }) }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: () => "captured" }));
jest.mock("@/features/settings/notification-preferences", () => ({ setNotificationPreference: () => Promise.resolve() }));
jest.mock("@/features/window-panels/url-sync/initUrlHydration", () => ({ initUrlHydration: () => undefined }));

import { BellPanel as Bell } from "../components/BellPanel";

let container: HTMLDivElement;
let root: Root;
const sameTabAnchors: string[] = [];
const onDocClick = (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement | null)?.closest?.("a");
  if (anchor && anchor.getAttribute("target") !== "_blank") sameTabAnchors.push(anchor.getAttribute("href") ?? "");
  if (anchor) event.preventDefault();
};

beforeEach(() => {
  routerCalls.length = 0;
  dispatched.length = 0;
  sameTabAnchors.length = 0;
  jest.spyOn(window, "open").mockImplementation(() => null);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  document.addEventListener("click", onDocClick, true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.removeEventListener("click", onDocClick, true);
  jest.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Every element that can act: buttons, links, tabs, and the items of every open menu. */
function actionable(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="menuitem"], [role="tab"]'));
}

function keyOf(el: HTMLElement): string {
  return `${el.tagName}|${el.getAttribute("role") ?? ""}|${el.getAttribute("aria-label") ?? ""}|${el.textContent?.trim().slice(0, 60) ?? ""}`;
}

async function openMenu(trigger: HTMLElement) {
  // Radix opens a menu on pointerdown/keydown, never on a synthetic click.
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await flush();
}

it("no click anywhere in the bell moves the page — rows, tabs, every menu item, sources, footer", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Bell variant="compact" onNavigate={() => undefined} />
        </QueryClientProvider>,
      );
    });
    await flush();
  };
  await render();

  const clicked = new Set<string>();
  // Re-query after every click: a tab or an expand reveals new controls.
  for (let guard = 0; guard < 400; guard++) {
    const next = actionable().find((el) => el.isConnected && !clicked.has(keyOf(el)));
    if (!next) break;
    clicked.add(keyOf(next));
    if (next.getAttribute("aria-haspopup") === "menu") {
      await openMenu(next);
      // Click each item of this menu, re-opening it before each.
      const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(keyOf);
      for (const item of items) {
        if (clicked.has(item)) continue;
        clicked.add(item);
        if (!next.isConnected) break;
        if (!document.querySelector('[role="menu"]')) await openMenu(next);
        const el = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((m) => keyOf(m) === item);
        if (!el) continue;
        await act(async () => { el.click(); });
        await flush();
      }
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await flush();
      continue;
    }
    await act(async () => { next.click(); });
    await flush();
    // A control that closed the panel (it opened a window) — bring the bell back.
    if (!container.querySelector("[data-inbox-panel]")) await render();
  }

  expect(clicked.size).toBeGreaterThan(20);
  // The menus were really exercised, not skipped.
  expect([...clicked].some((k) => k.includes("Mark all read"))).toBe(true);
  expect([...clicked].some((k) => k.includes("Turn off this type"))).toBe(true);
  expect([...clicked].some((k) => k.includes("Tomorrow"))).toBe(true);
  expect({ routerCalls, sameTabAnchors }).toEqual({ routerCalls: [], sameTabAnchors: [] });
  // Something DID open: windows were dispatched and new tabs were asked for.
  expect(dispatched.length).toBeGreaterThan(0);
  expect((window.open as jest.Mock).mock.calls.length).toBeGreaterThan(0);
});

it("no file of the feature (outside the /notifications page host) can reach the router, a same-tab link or the location", () => {
  const { readdirSync, statSync } = jest.requireActual<typeof import("node:fs")>("node:fs");
  const root = join(__dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  // The page host owns ONLY its own address (?org_filter=), by design.
  const files = walk(root).filter((f) => !f.endsWith("components/InboxPage.tsx"));
  expect(files.length).toBeGreaterThan(10);
  const offenders = files.flatMap((file) => {
    const src = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .join("\n");
    return [/\buseRouter\b/, /from "next\/link"/, /AppLink/, /router\.(push|replace|back)/, /location\.(assign|replace|href\s*=)/]
      .filter((pattern) => pattern.test(src))
      .map((pattern) => `${file.slice(root.length + 1)}: ${pattern}`);
  });
  expect(offenders).toEqual([]);
});
