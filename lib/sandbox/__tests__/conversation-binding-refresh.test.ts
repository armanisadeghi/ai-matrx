/**
 * A bind that happened SERVER-side reaches the open tab without a reload.
 *
 * aidream's `persist_conversation_binding` writes
 * `chat.conversation.sandbox_instance_id` for any run that actually used a box —
 * including runs started somewhere else (an MCP `agent_run`, the extension, the
 * desktop app, a second tab). Until this thunk existed, the only way this tab
 * learned about that was a full page reload.
 *
 * The guard drives the REAL thunk against a stubbed Supabase row read, and
 * asserts the record is aligned through the normal `patchConversation` action —
 * no second cache, no second derivation.
 */

const maybeSingle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({ maybeSingle }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock("@/lib/sandbox/active-binding", () => ({
  clearSandboxBindingCache: jest.fn(),
}));

import { refreshConversationSandboxBinding } from "@/features/agents/redux/execution-system/thunks/refresh-conversation-binding.thunk";
import type { RootState } from "@/lib/redux/store";

const CONVERSATION_ID = "bb458c1e-3222-4c16-9d29-77c48b186a02";
const SERVER_BOUND_BOX = "9aa2f6a6-7a27-43fb-ad0e-56e4e6222c78";

function stateWith(
  record: Record<string, unknown> | null,
): RootState {
  return {
    conversations: {
      byConversationId: record ? { [CONVERSATION_ID]: record } : {},
    },
  } as unknown as RootState;
}

async function run(state: RootState) {
  const dispatched: Array<{ type: string; payload?: unknown }> = [];
  const dispatch = jest.fn((action: unknown) => {
    if (action && typeof action === "object" && "type" in action) {
      dispatched.push(action as { type: string; payload?: unknown });
    }
    return action;
  });
  await refreshConversationSandboxBinding({ conversationId: CONVERSATION_ID })(
    dispatch as never,
    (() => state) as never,
    undefined as never,
  );
  return dispatched;
}

describe("refreshConversationSandboxBinding", () => {
  beforeEach(() => maybeSingle.mockReset());

  it("adopts a binding the SERVER wrote while this tab was open", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        sandbox_instance_id: SERVER_BOUND_BOX,
        app_instance_id: null,
        metadata: {},
      },
      error: null,
    });

    const patch = (
      await run(
        stateWith({
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat",
          isEphemeral: false,
        }),
      )
    ).find((a) => a.type.endsWith("patchConversation"));

    expect(patch?.payload).toMatchObject({
      conversationId: CONVERSATION_ID,
      sandboxBinding: { rowId: SERVER_BOUND_BOX },
      sandboxBindingPersisted: true,
    });
  });

  it("does nothing when the row already agrees with the record", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        sandbox_instance_id: SERVER_BOUND_BOX,
        app_instance_id: null,
        metadata: {},
      },
      error: null,
    });

    const patch = (
      await run(
        stateWith({
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat",
          isEphemeral: false,
          sandboxBinding: { rowId: SERVER_BOUND_BOX, proxyUrl: "" },
          sandboxBindingPersisted: true,
        }),
      )
    ).find((a) => a.type.endsWith("patchConversation"));

    expect(patch).toBeUndefined();
  });

  it("never overwrites a local binding that has not been written yet", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        sandbox_instance_id: SERVER_BOUND_BOX,
        app_instance_id: null,
        metadata: {},
      },
      error: null,
    });

    const patch = (
      await run(
        stateWith({
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat",
          isEphemeral: false,
          // The user just attached this here; the write is still owed.
          sandboxBinding: { rowId: "0644b0ef-fc9d-4ae0-80ee-a0c613fbb58a", proxyUrl: "" },
          sandboxBindingPersisted: false,
        }),
      )
    ).find((a) => a.type.endsWith("patchConversation"));

    expect(patch).toBeUndefined();
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
