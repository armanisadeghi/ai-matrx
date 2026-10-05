/**
 * A PAGE'S OWN CONVERSATION NEVER RECEIVES ITS PAGE — across a route swap.
 *
 * Break this catches (seen live, 2026-09-30): after the first send on
 * /chat/new the app swaps to /chat/<id>, which mounts a NEW chat provider
 * around the composer. The composer's `useConversationFollowsPage` ran its
 * mount effect before the parent provider registered (a passive effect runs
 * children-first), so it saw "not the page's own conversation", stamped the
 * chat with its own page and read a page that was not mounted — and the chat
 * sent itself "Chat … has been closed" on turn 2. The real provider and the
 * real registry are used here: the seam IS React's commit order.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";

const dispatched: Array<{ type: string; payload?: unknown }> = [];
let state: Record<string, unknown> = {};

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
// The route is /chat/<id>: the page the person is looking at is the chat.
jest.mock("../useActivePageSurface", () => ({
  useActivePageSurface: () => ({ surfaceName: "matrx-user/chat" }),
}));
jest.mock("../../../agent-copy/AlchemySurfaceBridge", () => ({
  AlchemySurfaceBridge: ({ children }: { children: unknown }) => children,
  useAlchemySurfaceHandle: () => null,
}));
jest.mock("../../utils/surface-display", () => ({
  getSurfaceDisplayLabel: (n: string) => n,
}));

import {
  SurfaceRuntimeProvider,
  useIsPageOwnConversation,
} from "../SurfaceRuntimeContext";
import { useConversationFollowsPage } from "../useConversationFollowsPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function seed(conversationId: string, surfaceName: string | null) {
  state = {
    conversations: { byConversationId: { [conversationId]: { surfaceName } } },
    instanceUIState: { byConversationId: {}, pageContextOffByConversationId: {} },
  };
}

const types = () => dispatched.map((a) => a.type);

beforeEach(() => {
  dispatched.length = 0;
});

function Composer({ conversationId, seen }: { conversationId: string; seen: boolean[] }) {
  useConversationFollowsPage(conversationId);
  seen.push(useIsPageOwnConversation(conversationId));
  return null;
}

function ChatPage({ conversationId, seen }: { conversationId: string; seen: boolean[] }) {
  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/chat"
      getScope={() => ({})}
      ownConversationId={conversationId}
    >
      <Composer conversationId={conversationId} seen={seen} />
    </SurfaceRuntimeProvider>
  );
}

it("the chat's own conversation is not stamped with, or read from, its own page when the page mounts", () => {
  seed("thanksgiving-chat", null);
  const seen: boolean[] = [];
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<ChatPage conversationId="thanksgiving-chat" seen={seen} />));
  expect(types()).not.toContain("refreshSurfaceScope");
  expect(types().filter((t) => t.endsWith("patchConversation"))).toEqual([]);
  // The chip and the hook learn it is the page's own without a later render.
  expect(seen[seen.length - 1]).toBe(true);
  act(() => root.unmount());
});

it("a stale page stamp on the page's own conversation is cleared, with its page values", () => {
  seed("planet-chat", "matrx-user/chat");
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<ChatPage conversationId="planet-chat" seen={[]} />));
  expect(types()).not.toContain("refreshSurfaceScope");
  expect(dispatched.find((a) => a.type.endsWith("patchConversation"))?.payload).toEqual({
    conversationId: "planet-chat",
    surfaceName: null,
  });
  expect(types().some((t) => t.endsWith("replaceSurfaceContextEntries"))).toBe(true);
  act(() => root.unmount());
});

it("a chat that is NOT the page's own still follows the page it is shown on", () => {
  // Same tree, but the page owns a different conversation (a window beside it).
  seed("window-chat", null);
  function Page() {
    return (
      <SurfaceRuntimeProvider surfaceName="matrx-user/chat" getScope={() => ({})} ownConversationId="main-chat">
        <Composer conversationId="window-chat" seen={[]} />
      </SurfaceRuntimeProvider>
    );
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Page />));
  expect(dispatched.find((a) => a.type.endsWith("patchConversation"))?.payload).toEqual({
    conversationId: "window-chat",
    surfaceName: "matrx-user/chat",
  });
  expect(types()).toContain("refreshSurfaceScope");
  act(() => root.unmount());
});
