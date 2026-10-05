/**
 * A RELOAD RETURNS TO THE CONVERSATION (board chat column, 2026-10-01).
 *
 * The board's chat column showed "New chat" after every reload: the workspace
 * conversation lived only in component state and every mount launched a fresh
 * one. `/chat/<id>` and the window panels both keep it in the address. The
 * workspace now does too (`?chat=<id>`): read once on mount, written once the
 * server has the conversation, removed by New chat.
 *
 * Real hook, real effects; only the launcher, the resume thunk and the store
 * are stand-ins, so what is asserted is exactly what the hook asks for.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

const launchMandate = jest.fn();
const launchAgent = jest.fn();
const resumeConversation = jest.fn();
let cacheOnly = true;
let resumeFails = false;

jest.mock("../../../agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchMandate, launchAgent }),
}));
jest.mock("../../../agents/redux/execution-system/thunks/resume-conversation.thunk", () => ({
  resumeConversation: (args: unknown) => {
    resumeConversation(args);
    return { type: "test/resume", args };
  },
}));
jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => () => ({
    unwrap: () => (resumeFails ? Promise.reject(new Error("not found")) : Promise.resolve()),
  }),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      appContext: { organization_id: "org-1" },
      conversations: { byConversationId: new Proxy({}, { get: () => ({ cacheOnly }) }) },
    }),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.


// The org seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("../../../host/org", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  selectOrganizationId: () => "org-1",
  selectShouldPromptForOrganization: () => false,
}))(),
    ...(() => ({ ensureOrganizationContext: jest.fn() }))(),
    ...(() => ({ isOrganizationSelectionCancelled: () => false }))(),
  };
  const moved = ["selectOrganizationId","selectOrganizationName","ensureOrgId","getActiveOrgId","isOrganizationSelectionCancelled","ensureOrganizationContext","ensureOrganizationForRequest"];
  return {
    ...jest.requireActual("../../../host/org"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

import {
  addressWithConversation,
  conversationInAddress,
  useCanvasWorkspaceConversation,
  type CanvasWorkspaceConversationController,
} from "../useCanvasWorkspaceConversation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED = "c1eccd75-aea8-4ba3-893b-ce71c42a6b41";
const FRESH = "0b7a8d0e-1111-4222-8333-944455556666";

function mount(): {
  current: CanvasWorkspaceConversationController;
  rerender: () => void;
  unmount: () => void;
} {
  const out = {} as {
    current: CanvasWorkspaceConversationController;
    rerender: () => void;
    unmount: () => void;
  };
  const root = createRoot(document.createElement("div"));
  out.unmount = () => act(() => root.unmount());
  function Probe() {
    out.current = useCanvasWorkspaceConversation("canvas-workspace:board-x", {
      enabled: true,
      addressParam: "chat",
    });
    return null;
  }
  out.rerender = () => act(() => root.render(<Probe />));
  out.rerender();
  return out;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  launchMandate.mockReset().mockResolvedValue({ conversationId: FRESH });
  launchAgent.mockReset();
  resumeConversation.mockReset();
  cacheOnly = true;
  resumeFails = false;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/board/b1#c=0,0,1");
});

describe("the workspace chat lives at ?chat=<id>", () => {
  it("a reload reopens the conversation the address names — and starts no new one", async () => {
    window.history.replaceState(null, "", `/board/b1?chat=${SAVED}#c=0,0,1`);
    const hook = mount();
    await settle();
    expect(launchMandate).not.toHaveBeenCalled();
    expect(resumeConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: SAVED }),
    );
    expect(hook.current.conversationId).toBe(SAVED);
    // the address is left naming it, hash untouched
    expect(window.location.search).toBe(`?chat=${SAVED}`);
    expect(window.location.hash).toBe("#c=0,0,1");
  });

  it("a new chat is written to the address once the server has it", async () => {
    const hook = mount();
    await settle();
    expect(launchMandate).toHaveBeenCalledTimes(1);
    expect(hook.current.conversationId).toBe(FRESH);
    expect(window.location.search).toBe(""); // not sent yet: nothing to come back to
    cacheOnly = false; // the first turn reached the server
    hook.rerender();
    await settle();
    expect(window.location.search).toBe(`?chat=${FRESH}`);
  });

  it("New chat takes the old conversation out of the address", async () => {
    window.history.replaceState(null, "", `/board/b1?chat=${SAVED}&panels=chat_history:x`);
    const hook = mount();
    await settle();
    act(() => hook.current.startNew());
    await settle();
    expect(hook.current.conversationId).toBe(FRESH);
    expect(window.location.search).toBe("?panels=chat_history%3Ax");
  });
});

describe("the column reopens its conversation when the address names none (2026-10-05)", () => {
  // Live: a board chat finished, the page was opened again at an address with
  // no `?chat=` (`?panels=chat_history:quickChatHistory#cam=…`) and the column
  // showed "New chat" — the conversation was only ever kept in the address.
  async function chatThenLeave() {
    const first = mount();
    await settle();
    cacheOnly = false; // the first turn reached the server
    first.rerender();
    await settle();
    expect(window.location.search).toBe(`?chat=${FRESH}`);
    first.unmount();
    launchMandate.mockClear();
    resumeConversation.mockClear();
  }

  it("an address without ?chat= reopens the conversation this chat last showed", async () => {
    await chatThenLeave();
    window.history.replaceState(null, "", "/board/b1?panels=chat_history%3AquickChatHistory#cam=1,2,0.5");
    const hook = mount();
    await settle();
    expect(launchMandate).not.toHaveBeenCalled();
    expect(resumeConversation).toHaveBeenCalledWith(expect.objectContaining({ conversationId: FRESH }));
    expect(hook.current.conversationId).toBe(FRESH);
    expect(window.location.search).toBe(`?panels=chat_history%3AquickChatHistory&chat=${FRESH}`);
  });

  it("New chat is what comes back after New chat", async () => {
    await chatThenLeave();
    window.history.replaceState(null, "", "/board/b1");
    const hook = mount();
    await settle();
    cacheOnly = true; // the new chat has not been sent
    launchMandate.mockResolvedValue({ conversationId: SAVED });
    act(() => hook.current.startNew());
    await settle();
    hook.unmount();
    resumeConversation.mockClear();
    window.history.replaceState(null, "", "/board/b1");
    mount();
    await settle();
    expect(resumeConversation).not.toHaveBeenCalled();
  });

  it("a remembered conversation that no longer opens gives a new chat, not an error", async () => {
    await chatThenLeave();
    resumeFails = true;
    window.history.replaceState(null, "", "/board/b1");
    const hook = mount();
    await settle();
    await settle();
    expect(launchMandate).toHaveBeenCalledTimes(1);
    expect(hook.current.conversation.state).not.toBe("failed");
  });
});

describe("address helpers", () => {
  it("ignores anything that is not a conversation id", () => {
    expect(conversationInAddress("chat", "?chat=new")).toBeNull();
    expect(conversationInAddress("chat", `?chat=${SAVED}`)).toBe(SAVED);
    expect(addressWithConversation("chat", "?a=1", null)).toBe("?a=1");
  });
});
