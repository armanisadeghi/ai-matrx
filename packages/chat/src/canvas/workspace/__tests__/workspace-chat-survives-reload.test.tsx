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

jest.mock("../../../agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchMandate, launchAgent }),
}));
jest.mock("../../../agents/redux/execution-system/thunks/resume-conversation.thunk", () => ({
  resumeConversation: (args: unknown) => {
    resumeConversation(args);
    return { type: "test/resume", args };
  },
}));
jest.mock("@host/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve() }),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      appContext: { organization_id: "org-1" },
      conversations: { byConversationId: new Proxy({}, { get: () => ({ cacheOnly }) }) },
    }),
}));
jest.mock("@host/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "org-1",
  selectShouldPromptForOrganization: () => false,
}));
jest.mock("@host/lib/organization/organization-gate", () => ({ ensureOrganizationContext: jest.fn() }));
jest.mock("@host/lib/organization/selection-cancelled", () => ({ isOrganizationSelectionCancelled: () => false }));

import {
  addressWithConversation,
  conversationInAddress,
  useCanvasWorkspaceConversation,
  type CanvasWorkspaceConversationController,
} from "../useCanvasWorkspaceConversation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED = "c1eccd75-aea8-4ba3-893b-ce71c42a6b41";
const FRESH = "0b7a8d0e-1111-4222-8333-944455556666";

function mount(): { current: CanvasWorkspaceConversationController; rerender: () => void } {
  const out = {} as { current: CanvasWorkspaceConversationController; rerender: () => void };
  const root = createRoot(document.createElement("div"));
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

describe("address helpers", () => {
  it("ignores anything that is not a conversation id", () => {
    expect(conversationInAddress("chat", "?chat=new")).toBeNull();
    expect(conversationInAddress("chat", `?chat=${SAVED}`)).toBe(SAVED);
    expect(addressWithConversation("chat", "?a=1", null)).toBe("?a=1");
  });
});
