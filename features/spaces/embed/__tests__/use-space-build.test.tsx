/**
 * @jest-environment jsdom
 */
/**
 * useSpaceBuild is the door /make (and others) use to run Build with AI. A reload or a paused tab must
 * never start a SECOND build: `onConversationCreated` hands the conversation id out the moment it exists,
 * and `reattach` returns a finished build (or follows a running one) through the same hook, never `run`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

const run = jest.fn();
const reattachRun = jest.fn();
const rootPageForConversation = jest.fn();

jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({
  useFloatingAgentRun: () => ({ run, reattach: reattachRun, isRunning: false }),
}));
jest.mock("../../ai/spaces-ai", () => ({ BUILD_KEY: "spaces.build" }));
jest.mock("../space-by-conversation", () => ({ rootPageForConversation: (id: string) => rootPageForConversation(id) }));

import { useSpaceBuild } from "../useSpaceBuild";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The hook is mounted in a real component, as its callers do; `result.current` is what it returned.
function renderHook(hook: () => ReturnType<typeof useSpaceBuild>) {
  const result = { current: undefined as unknown as ReturnType<typeof useSpaceBuild> };
  function Probe() {
    result.current = hook();
    return null;
  }
  const host = document.createElement("div");
  act(() => createRoot(host).render(<Probe />));
  return { result };
}

const built = { summary: "Agency OS built", root_space_id: "root-1", space_ids: ["root-1", "child-1"], table_ids: ["t1"] };

beforeEach(() => {
  run.mockReset();
  reattachRun.mockReset();
  rootPageForConversation.mockReset();
});

describe("useSpaceBuild", () => {
  it("passes onConversationCreated to the run so the id is saved as soon as the conversation exists", async () => {
    run.mockImplementation(async (opts: { onConversationCreated?: (id: string) => void }) => {
      opts.onConversationCreated?.("conv-1");
      return built;
    });
    const saved: string[] = [];
    const { result } = renderHook(() => useSpaceBuild());
    const outcome = await result.current.build({
      request: "an agency OS",
      organizationId: "org-1",
      onConversationCreated: (id) => saved.push(id),
    });
    expect(saved).toEqual(["conv-1"]);
    expect(outcome).toEqual({ summary: "Agency OS built", rootSpaceId: "root-1", url: "/spaces/root-1", spaceIds: ["root-1", "child-1"], tableIds: ["t1"] });
  });

  it("reattach on a finished conversation returns the outcome and starts no run", async () => {
    reattachRun.mockResolvedValue(built);
    const { result } = renderHook(() => useSpaceBuild());
    const outcome = await result.current.reattach("conv-1");
    expect(outcome.rootSpaceId).toBe("root-1");
    expect(outcome.url).toBe("/spaces/root-1");
    expect(reattachRun).toHaveBeenCalledWith("conv-1", expect.objectContaining({ expect: "json" }));
    expect(run).not.toHaveBeenCalled();
    expect(rootPageForConversation).not.toHaveBeenCalled();
  });

  it("falls back to the page stamped with the conversation when the result cannot be read again", async () => {
    reattachRun.mockRejectedValue(new Error("That run has no saved result to open."));
    rootPageForConversation.mockResolvedValue({ spaceId: "root-9", title: "Agency OS" });
    const { result } = renderHook(() => useSpaceBuild());
    const outcome = await result.current.reattach("conv-9");
    expect(outcome.rootSpaceId).toBe("root-9");
    expect(outcome.url).toBe("/spaces/root-9");
    expect(rootPageForConversation).toHaveBeenCalledWith("conv-9");
    expect(run).not.toHaveBeenCalled();
  });

  it("says the original reason when neither the result nor a stamped page exists", async () => {
    reattachRun.mockRejectedValue(new Error("That run has no saved result to open."));
    rootPageForConversation.mockResolvedValue(null);
    const { result } = renderHook(() => useSpaceBuild());
    await expect(result.current.reattach("conv-0")).rejects.toThrow("no saved result");
    expect(run).not.toHaveBeenCalled();
  });
});
