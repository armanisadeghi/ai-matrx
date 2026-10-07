/**
 * CLEAR ALL CLEARS EVERY PLACE, FOLDED OR NOT (review of BELL-OWNER, 2026-10-07).
 *
 * The strip mounts only the first four places until More opens. Clear all used to clear only the
 * places that had rendered, so a counting place past the fold kept its number and the person could
 * not reach zero in one click. The bell now reads every place once (`usePlaceStates`) and Clear all
 * marks every one of them. Red on 486208c8d8 (mounted-only), green after.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Table2 } from "lucide-react";

const clearCalls: unknown[][] = [];
const savedCleared: { counts: Record<string, number>; ids: Record<string, readonly string[]> }[] = [];
jest.mock("../useInboxMemory", () => ({
  useInboxMemory: () => ({
    ready: true,
    seen: { counts: {}, ids: {} },
    cleared: { counts: {}, ids: {} },
    hiddenSources: [],
    saveSeen: () => undefined,
    saveCleared: (marks: { counts: Record<string, number>; ids: Record<string, readonly string[]> }) => {
      savedCleared.push(marks);
    },
    saveHidden: () => undefined,
    // The pre-review memory API, so the same test can be run against the old bell (red proof).
    sourcesCleared: {},
    save: (patch: { sourcesCleared?: Record<string, number> }) => {
      if (patch.sourcesCleared) savedCleared.push({ counts: patch.sourcesCleared, ids: {} });
    },
  }),
}));
// Six counting places: the strip shows four, two sit folded under More and never mount.
const PLACE_KEYS = ["p1", "p2", "p3", "p4", "p5_folded", "p6_folded"];
jest.mock("../sources/registry", () => {
  const actual = jest.requireActual("../sources/registry");
  const sources = PLACE_KEYS.map((key) => ({
    key,
    label: key,
    icon: Table2,
    bucket: "needs_you",
    opensIn: "window",
    open: () => undefined,
    // What the pre-review registry rendered per mounted place (red proof only; unused now).
    Indicator: () => null,
  }));
  return {
    ...actual,
    NOTICE_SOURCES: sources,
    visibleSources: () => sources,
    usePlaceStates: () =>
      Object.fromEntries(
        PLACE_KEYS.map((key, i) => [
          key,
          { count: 10 + i, hidden: null, loading: false, error: false, ids: key === "p6_folded" ? ["run-a", "run-b"] : null },
        ]),
      ),
  };
});

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
  useInboxActions: () => ({ act: noop, undo: noop, canUndo: false, markAllRead: noop, clear: (...args: unknown[]) => { clearCalls.push(args); return Promise.resolve(0); } }),
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
beforeEach(() => {
  clearCalls.length = 0;
  savedCleared.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

it("one Clear all clears every notice and every place, the folded ones included", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Bell variant="compact" onNavigate={() => undefined} />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  // Only four places are on screen.
  expect(container.querySelectorAll("[data-notice-source]").length).toBe(4);

  const clearAll = container.querySelector<HTMLButtonElement>("[data-inbox-clear-all]");
  expect(clearAll).not.toBeNull();
  await act(async () => {
    clearAll?.click();
  });

  expect(clearCalls).toEqual([[null, "Cleared", expect.any(Function)]]);
  expect(savedCleared).toHaveLength(1);
  expect(savedCleared[0].counts).toEqual({ p1: 10, p2: 11, p3: 12, p4: 13, p5_folded: 14, p6_folded: 15 });
  expect(savedCleared[0].ids.p6_folded).toEqual(["run-a", "run-b"]);
});
