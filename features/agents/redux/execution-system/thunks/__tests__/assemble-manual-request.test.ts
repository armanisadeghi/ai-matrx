/**
 * Pins the live-read contract for the Agent Builder's manual execution path.
 *
 * What this test enforces (the bug class it prevents):
 *   - The manual payload reflects the LIVE `state.agentDefinition.agents[id]`
 *     at submit time — modelId, messages, tools, customTools, mcpServers,
 *     settings. Changes made after instance creation MUST appear in the
 *     payload without re-snapshotting.
 *   - Settings spread FLAT at top level. There is no `config_overrides` field.
 *   - The wire `conversation_id` is fresh per call.
 *   - `state.instanceModelOverrides` is NOT read at all.
 *
 * If a future refactor re-introduces snapshotting, the override delta layer,
 * or wire-level conversation continuation, this file fails CI loudly.
 */

// Stub `uuid` — its v13 ESM build trips Jest's CommonJS loader. Returning a
// monotonically-increasing string also makes the "fresh conversation_id per
// call" assertion deterministic.
let __uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: () => `uuid-stub-${++__uuidCounter}`,
}));

import { assembleManualRequest } from "../execute-manual-instance.thunk";
import type { RootState } from "@/lib/redux/store";

// ---------------------------------------------------------------------------
// State fixtures
// ---------------------------------------------------------------------------

const AGENT_ID = "agent-1";
const CONVERSATION_ID = "conv-1";

/**
 * Builds a minimal RootState shape sufficient for `assembleManualRequest`.
 * Cast through `unknown` because we only populate the slices the function
 * reads — every other slice is irrelevant.
 */
function makeState(
  partial: {
    modelId?: string | null;
    messages?: Array<{ role: string; content: unknown }>;
    tools?: string[];
    customTools?: Array<Record<string, unknown>>;
    mcpServers?: string[];
    settings?: Record<string, unknown>;
    parentAgentId?: string | null;
    isVersion?: boolean;
    history?: Array<{ id: string; role: string; content: unknown }>;
    userInput?: string;
  } = {},
): RootState {
  const orderedIds = (partial.history ?? []).map((m) => m.id);
  const byId: Record<string, unknown> = {};
  for (const m of partial.history ?? []) {
    byId[m.id] = {
      id: m.id,
      conversationId: CONVERSATION_ID,
      agentId: AGENT_ID,
      role: m.role,
      content: m.content,
      contentHistory: null,
      userContent: null,
      position: 0,
      source: "test",
      status: "active",
      isVisibleToModel: true,
      isVisibleToUser: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
  }

  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          agentId: AGENT_ID,
          agentType: "user",
          origin: "manual",
          sourceFeature: "agent-builder",
          sourceApp: undefined,
          status: "idle",
          isEphemeral: false,
          initialAgentVersionId: null,
        },
      },
      allConversationIds: [CONVERSATION_ID],
    },
    agentDefinition: {
      agents: {
        [AGENT_ID]: {
          id: AGENT_ID,
          modelId:
            "modelId" in partial ? partial.modelId : "model-A",
          messages: partial.messages ?? [],
          tools: partial.tools ?? [],
          customTools: partial.customTools ?? [],
          mcpServers: partial.mcpServers ?? [],
          settings: partial.settings ?? {},
          variableDefinitions: [],
          contextSlots: [],
          parentAgentId: partial.parentAgentId ?? null,
          isVersion: partial.isVersion ?? false,
        },
      },
    },
    instanceUIState: {
      byConversationId: {
        [CONVERSATION_ID]: {
          showPreExecutionGate: false,
          preExecutionSatisfied: true,
          builderAdvancedSettings: undefined,
        },
      },
    },
    messages: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          apiEndpointMode: "manual",
          byId,
          orderedIds,
          title: null,
          description: null,
          keywords: null,
        },
      },
    },
    instanceUserInput: {
      byConversationId: {
        [CONVERSATION_ID]: {
          text: partial.userInput ?? "",
          messageParts: undefined,
        },
      },
    },
    instanceResources: { byConversationId: {} },
    instanceContext: { byConversationId: {} },
    instanceVariableValues: { byConversationId: {} },
    instanceClientTools: { byConversationId: {} },
    // Deliberately omit instanceModelOverrides: this path MUST NOT read it.
    // If a future refactor reaches into the slice, accessing it will throw
    // and these tests will fail.
  } as unknown as RootState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assembleManualRequest — live read contract", () => {
  test("ai_model_id reflects the current agent.modelId", () => {
    const state = makeState({ modelId: "model-XYZ" });
    const payload = assembleManualRequest(state, CONVERSATION_ID);
    expect(payload).not.toBeNull();
    expect(payload!.ai_model_id).toBe("model-XYZ");
  });

  test("returns null when modelId is missing — never silently sends without a model", () => {
    const state = makeState({ modelId: null });
    const payload = assembleManualRequest(state, CONVERSATION_ID);
    expect(payload).toBeNull();
  });

  test("messages[] embeds agent.messages (priming) verbatim", () => {
    const priming = [
      { role: "system", content: [{ type: "text", text: "you are a test agent" }] },
      { role: "user", content: [{ type: "text", text: "example turn" }] },
    ];
    const state = makeState({ messages: priming });
    const payload = assembleManualRequest(state, CONVERSATION_ID);
    expect(payload!.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user" }),
      ]),
    );
    expect(payload!.messages![0]).toEqual(priming[0]);
  });

  test("messages[] appends prior committed history from the messages slice", () => {
    const state = makeState({
      history: [
        {
          id: "m1",
          role: "user",
          content: [{ type: "text", text: "prior user turn" }],
        },
        {
          id: "m2",
          role: "assistant",
          content: [{ type: "text", text: "prior assistant reply" }],
        },
      ],
      userInput: "new turn",
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID);
    const roles = payload!.messages!.map((m: { role: string }) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
    expect(
      (payload!.messages![2] as { content: Array<{ text: string }> }).content[0]
        .text,
    ).toBe("new turn");
  });

  test("agent.tools UUIDs map to tools_replace as RegisteredToolSpec wire shape", () => {
    // The Builder uses `tools_replace` (not `tools`) because (a) it is the
    // semantically correct "client owns the active tool set" field and (b)
    // the chat router's `_build_unified_config` dumps a populated `tools`
    // field through pydantic model_dump → dict which downstream cannot
    // canonicalize. `tools_replace` clears config.tools server-side first.
    const state = makeState({
      tools: ["tool-uuid-1", "tool-uuid-2"],
      customTools: [{ name: "ct1", input_schema: {} }],
      mcpServers: ["mcp-uuid-1"],
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID)!;
    expect(payload.tools_replace).toEqual([
      { kind: "registered", name: "tool-uuid-1", tool_id: "tool-uuid-1", delegate: false },
      { kind: "registered", name: "tool-uuid-2", tool_id: "tool-uuid-2", delegate: false },
    ]);
    // `tools` is deliberately NOT set — see assembler for the reason.
    expect(payload.tools).toBeUndefined();
    expect(payload.custom_tools).toEqual([{ name: "ct1", input_schema: {} }]);
    expect(payload.mcp_servers).toEqual(["mcp-uuid-1"]);
  });

  test("UI-only capability flags do NOT leak into tools_replace", () => {
    // The test below sets `tools: {allowed: true}` inside agent.settings.
    // The wire payload's tool list must come from agent.tools, not the UI flag.
    const state = makeState({
      tools: ["t1"],
      settings: { tools: { allowed: true } },
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID)!;
    expect(payload.tools_replace).toEqual([
      { kind: "registered", name: "t1", tool_id: "t1", delegate: false },
    ]);
    expect(payload.tools).toBeUndefined();
  });

  test("agent.settings spread FLAT at top level — no config_overrides", () => {
    const state = makeState({
      settings: { temperature: 0.7, top_p: 0.95, max_output_tokens: 4096 },
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID) as Record<
      string,
      unknown
    >;
    expect(payload.temperature).toBe(0.7);
    expect(payload.top_p).toBe(0.95);
    expect(payload.max_output_tokens).toBe(4096);
    expect(payload.config_overrides).toBeUndefined();
  });

  test("UI-only capability flags in agent.settings are stripped", () => {
    const state = makeState({
      settings: {
        temperature: 0.5,
        tools: { allowed: true }, // UI capability flag — must NOT be sent
        image_urls: true, // UI capability flag — must NOT be sent
        file_urls: false, // UI capability flag — must NOT be sent
      },
      // No agent.tools, so payload.tools_replace should be undefined entirely.
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID) as Record<
      string,
      unknown
    >;
    expect(payload.temperature).toBe(0.5);
    expect(payload.tools).toBeUndefined();
    expect(payload.tools_replace).toBeUndefined();
    expect(payload.image_urls).toBeUndefined();
    expect(payload.file_urls).toBeUndefined();
  });

  test("omits conversation_id and sets is_new — server mints the id", () => {
    // Sending a client-minted wire conversation_id with `is_new: true`
    // collides with cx_conversation rows the server creates on its own
    // (409 "conversation already exists"). The contract is: client sends
    // is_new: true and OMITS the conversation_id field; server generates
    // a fresh id and echoes it back via X-Conversation-ID. The local
    // Redux conversationId stays stable for UI continuity (not on the wire).
    const state = makeState({});
    const a = assembleManualRequest(state, CONVERSATION_ID)!;
    const b = assembleManualRequest(state, CONVERSATION_ID)!;
    expect(a.conversation_id).toBeUndefined();
    expect(b.conversation_id).toBeUndefined();
    expect(a.is_new).toBe(true);
    expect(b.is_new).toBe(true);
  });

  test("agent_id and is_version honor version pinning", () => {
    const state = makeState({
      parentAgentId: "parent-agent-uuid",
      isVersion: true,
    });
    const payload = assembleManualRequest(state, CONVERSATION_ID)!;
    expect(payload.agent_id).toBe("parent-agent-uuid");
    expect(payload.is_version).toBe(true);
  });

  test("does NOT read state.instanceModelOverrides", () => {
    // The test fixture omits instanceModelOverrides entirely. If
    // assembleManualRequest tried to read it, the function would throw on
    // property access of `undefined`. The fact that the previous tests pass
    // proves the path doesn't reach into the overrides slice. This test
    // documents that contract explicitly.
    const state = makeState({ modelId: "m" });
    expect((state as Record<string, unknown>).instanceModelOverrides).toBeUndefined();
    expect(() => assembleManualRequest(state, CONVERSATION_ID)).not.toThrow();
  });
});
