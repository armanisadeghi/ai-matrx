/**
 * THE MCP-ATTACHED-BUT-NEVER-SENT TRAP, as a guard.
 *
 * The break this catches (live, 2026-09-13, conversation 99d5b990…): a user
 * attached the GitHub MCP from the Smart Input tools menu mid-chat. The pick
 * landed in `builderAdvancedSettings.addedMcpServers`, but every chat
 * continue turn goes through `executeInstance` → `buildToolInjection`, which
 * only folded `addedTools` into the envelope — `client.mcp` was emitted by
 * the Builder's manual thunk alone. The slug never left the browser, the
 * server logged nothing, and the model truthfully said "no GitHub MCP tool
 * in my toolset".
 *
 * SUT: the real `buildToolInjection`. Only its network/registry dependencies
 * are stubbed (no surface mounted, no capabilities registered), so the
 * `client` envelope it returns is produced by the real assembly.
 *
 * Forcing function: the two cases assert opposite shapes from the same
 * harness — a conversation with attached MCP slugs MUST carry them as
 * `client.mcp` (deduped), and one without MUST NOT emit `client.mcp` at all.
 */

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: () => undefined,
}));

jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/register-all",
  () => ({}),
);

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { buildToolInjection } from "../build-tool-injection";
import type { RootState } from "@/lib/redux/store";

const SURFACE = "matrx-user/chat";

function makeState(args: {
  conversationId: string;
  addedMcpServers?: string[];
}): RootState {
  const agentId = "agent-mcp-test";
  return {
    agentDefinition: {
      agents: {
        [agentId]: {
          id: agentId,
          name: "Chat agent",
          tools: [],
          customTools: [],
          mcpServers: [],
          _loadedFields: { name: true, modelId: true, tools: true },
        },
      },
    },
    conversations: {
      byConversationId: {
        [args.conversationId]: {
          agentId,
          mandateKey: null,
          surfaceName: SURFACE,
        },
      },
    },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: {
      byConversationId: {
        [args.conversationId]: {
          builderAdvancedSettings:
            args.addedMcpServers === undefined
              ? undefined
              : { addedMcpServers: args.addedMcpServers },
        },
      },
    },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as RootState;
}

describe("an MCP attached to the conversation rides every continue turn as client.mcp", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("carries the attached slugs (deduped) on the additive continue-turn path", async () => {
    const state = makeState({
      conversationId: "conv-with-github",
      addedMcpServers: ["github", "github", "deepwiki"],
    });

    const result = await buildToolInjection(state, "conv-with-github", {
      mode: "additive",
    });

    expect(result.client).toBeDefined();
    expect(result.client?.mcp).toEqual(["github", "deepwiki"]);
    // The surface is still declared alongside — attaching an MCP never
    // replaces the chat surface's own tool set.
    expect(result.client?.surface).toBe(SURFACE);
  });

  it("emits no client.mcp key when nothing is attached", async () => {
    const state = makeState({ conversationId: "conv-plain" });

    const result = await buildToolInjection(state, "conv-plain", {
      mode: "additive",
    });

    expect(result.client).toBeDefined();
    expect(result.client).not.toHaveProperty("mcp");
  });
});
