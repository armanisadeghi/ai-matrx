/**
 * THE PAGE-FOLLOW RULE (Arman, 2026-09-30): every conversation shown in a
 * composer gets the page it is shown on — a chat loaded from history into a
 * window included — except the page's OWN conversation, which never receives
 * itself. An unregistered page never wipes a launch's own values; only the
 * person's switch does.
 *
 * WHAT WAS SEEN: an existing chat reopened in a window over the Agent Builder
 * showed "Agent Builder 0" while a new chat beside it showed 38 values — the
 * follow rule only ran in two hosts, and a stamped-but-unread chat was never
 * read until its next send.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";

const dispatched: Array<{ type: string; payload?: unknown }> = [];
let state: Record<string, unknown> = {};
let activePage: string | null = null;
let ownConversation = false;

jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action as { type: string });
    return action;
  },
  useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../store/hooks"));
jest.mock("../../../agents/redux/execution-system/thunks/refresh-surface-scope.thunk", () => ({
  refreshSurfaceScope: (arg: { conversationId: string }) => ({ type: "refreshSurfaceScope", payload: arg }),
}));
jest.mock("../useActivePageSurface", () => ({
  useActivePageSurface: () => ({ surfaceName: activePage }),
}));
jest.mock("../SurfaceRuntimeContext", () => ({
  isPageOwnConversation: () => ownConversation,
  useIsPageOwnConversation: () => ownConversation,
}));
jest.mock("../../utils/surface-display", () => ({
  getSurfaceDisplayLabel: (n: string) => n,
}));

import { useConversationFollowsPage } from "../useConversationFollowsPage";

function setConversation(surfaceName: string | null) {
  state = {
    conversations: { byConversationId: { c1: { surfaceName } } },
    instanceUIState: { byConversationId: {}, pageContextOffByConversationId: {} },
  };
}

const types = () => dispatched.map((a) => a.type);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Mount the hook once, flush its effects, unmount. */
function renderHook(use: () => unknown) {
  function Probe() {
    use();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  act(() => root.unmount());
}

beforeEach(() => {
  dispatched.length = 0;
  activePage = null;
  ownConversation = false;
});

it("a chat loaded from history that already carries the page's stamp reads the page at once", () => {
  activePage = "matrx-user/agent-builder";
  setConversation("matrx-user/agent-builder");
  renderHook(() => useConversationFollowsPage("c1"));
  expect(types()).toContain("refreshSurfaceScope");
});

it("a chat shown on a page it is not stamped with follows that page and reads it", () => {
  activePage = "matrx-user/agent-builder";
  setConversation(null);
  renderHook(() => useConversationFollowsPage("c1"));
  expect(dispatched.find((a) => a.type.endsWith("patchConversation"))?.payload).toEqual({
    conversationId: "c1",
    surfaceName: "matrx-user/agent-builder",
  });
  expect(types()).toContain("refreshSurfaceScope");
});

it("the page's OWN conversation never receives itself", () => {
  activePage = "matrx-user/agent-builder";
  setConversation(null);
  ownConversation = true;
  renderHook(() => useConversationFollowsPage("c1"));
  expect(dispatched).toEqual([]);
});

it("an unregistered page leaves a launch's own surface and values alone", () => {
  activePage = null;
  setConversation("matrx-user/records");
  renderHook(() => useConversationFollowsPage("c1"));
  expect(types().some((t) => t.endsWith("patchConversation"))).toBe(false);
  expect(types().some((t) => t.endsWith("replaceSurfaceContextEntries"))).toBe(false);
});
