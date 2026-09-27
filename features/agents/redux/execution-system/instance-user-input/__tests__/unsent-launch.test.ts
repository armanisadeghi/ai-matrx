/**
 * AN UNSENT AGENT WINDOW SURVIVES THE RELOAD (2026-09-27).
 *
 * The defect: a window whose conversation was never sent came back from its
 * address as "Couldn't load this conversation" — the agent, the variables and
 * the context attached to it were gone, and the composer never mounted to
 * restore the typed text. These pin the recipe that fixes it: what it keeps,
 * who it is for, and that it dies the moment the conversation is sent.
 */
import { buildUnsentLaunchRecipe } from "../unsent-launch.middleware";
import {
  clearUnsentLaunch,
  readUnsentLaunch,
  writeUnsentLaunch,
} from "../unsent-launch-store";
import type { RootState } from "@/lib/redux/rootReducer";

function stateWith(opts: { cacheOnly?: boolean; displayMode?: string }): RootState {
  return {
    conversations: {
      byConversationId: {
        c1: {
          agentId: "agent-1",
          cacheOnly: opts.cacheOnly ?? true,
          mandateKey: null,
          sourceFeature: "agent-runner",
          surfaceKey: "send-to-agent:agent-1",
          surfaceName: null,
        },
      },
    },
    instanceUIState: {
      byConversationId: {
        c1: { displayMode: opts.displayMode ?? "floating-chat", allowChat: true, showVariablePanel: false },
      },
    },
    instanceVariableValues: {
      byConversationId: {
        c1: { userValues: { topic: "from the host", note: "typed by the person" }, hostValueNames: ["topic"] },
      },
    },
    instanceContext: {
      byConversationId: {
        c1: { user_tagged_context: { key: "user_tagged_context", value: { content: "tagged" } } },
      },
    },
  } as unknown as RootState;
}

describe("the unsent-window recipe", () => {
  it("keeps the agent, window, host and typed values apart, and the context as held", () => {
    const recipe = buildUnsentLaunchRecipe(stateWith({}), "c1");
    expect(recipe).toMatchObject({
      agentId: "agent-1",
      displayMode: "floating-chat",
      surfaceName: null,
      hostValues: { topic: "from the host" },
      userValues: { note: "typed by the person" },
      context: { user_tagged_context: { content: "tagged" } },
    });
  });

  it("is never kept for a SENT conversation — that one loads from the server", () => {
    expect(buildUnsentLaunchRecipe(stateWith({ cacheOnly: false }), "c1")).toBeNull();
  });

  it("is only for a window: a page composer has no address to come back from", () => {
    expect(buildUnsentLaunchRecipe(stateWith({ displayMode: "direct" }), "c1")).toBeNull();
  });

  it("round-trips through the tab's storage and clears", () => {
    const recipe = buildUnsentLaunchRecipe(stateWith({}), "c1");
    writeUnsentLaunch("c1", recipe!);
    expect(readUnsentLaunch("c1")?.agentId).toBe("agent-1");
    clearUnsentLaunch("c1");
    expect(readUnsentLaunch("c1")).toBeNull();
  });
});
