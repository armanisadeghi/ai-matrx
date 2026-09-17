/**
 * PER-RUN ADDITIONS ARE NEVER LOST IN SILENCE.
 *
 * The live report (feedback 50879411, 2026-09-14): a person attached the
 * Context7 MCP server on the `/chat/new` hero composer, sent the first
 * message, and the run went out without it — the agent truthfully answered
 * "I don't have any tools from Context7", and reopening the picker showed the
 * server detached again. Nothing on screen ever said the attachment was
 * dropped.
 *
 * Three ways that can happen, all of them silent, all of them guarded here:
 *
 *   1. The pick lands BEFORE the conversation's UI-state entry exists. On
 *      `/chat/new` the composer renders against the minted conversation id
 *      while the launcher's create effect is still gated on
 *      `ready: !isInitializing && isFreshRoute`, so a fast click writes into a
 *      key that is not there yet. The reducer used to be `if (entry) {...}`.
 *
 *   2. The conversation is RE-CREATED under the same id. `createInstanceFull`
 *      replaces the whole UI-state entry, which is correct for display config
 *      and fatal for a deliberate user pick.
 *
 *   3. The conversation is REAPED as "abandoned" between the attach and the
 *      first keystroke. `destroyInstanceIfAbandoned` judged on messages and
 *      composer text only — and attaching a service is normally the FIRST
 *      thing a person does, before typing anything at all.
 *
 * The third case is the reporter's timeline end to end: attach, launcher
 * effect re-runs (cleanup reaps, effect re-creates), type, send. The last test
 * drives that whole sequence through the REAL reducers and the REAL
 * `buildToolInjection`, and asserts the slug is still on the wire as
 * `client.mcp`. Only its network/registry dependencies are stubbed.
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

import instanceUIStateReducer, {
  setBuilderAdvancedSettings,
} from "../instance-ui-state.slice";
import { createInstanceFull } from "../../create-instance-full";
import { destroyInstanceIfAbandoned } from "../../conversations/conversations.thunks";
import { destroyInstance } from "../../conversations/conversations.slice";
import { buildToolInjection } from "../../utils/build-tool-injection";
import type { RootState } from "@/lib/redux/store";

const CONVERSATION = "conv-new-chat";
const AGENT = "agent-new-chat";
const SURFACE = "matrx-user/chat";

type UIState = ReturnType<typeof instanceUIStateReducer>;

/** The launcher's own creation action, as `launchAgentExecution` emits it. */
function createAction() {
  return createInstanceFull({
    conversationId: CONVERSATION,
    agentId: AGENT,
    agentType: "standard",
    origin: "manual",
  } as unknown as Parameters<typeof createInstanceFull>[0]);
}

function addedMcpFor(uiState: UIState): string[] | undefined {
  return uiState.byConversationId[CONVERSATION]?.builderAdvancedSettings
    ?.addedMcpServers;
}

describe("a per-run MCP attachment survives every step of the /chat/new handoff", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("keeps a pick made before the conversation's UI-state entry exists, and says so", () => {
    const empty = instanceUIStateReducer(undefined, { type: "@@init" });
    expect(empty.byConversationId[CONVERSATION]).toBeUndefined();

    const after = instanceUIStateReducer(
      empty,
      setBuilderAdvancedSettings({
        conversationId: CONVERSATION,
        changes: { addedMcpServers: ["context7"] },
      }),
    );

    expect(addedMcpFor(after)).toEqual(["context7"]);
    // Silent is the defect — so the staging still announces itself. But it
    // announces at `console.debug`, not `console.error`: writing before the row
    // is the launcher's designed order (the id is minted during render, the row
    // is created by an async thunk), so an error here raised the Next.js dev
    // overlay on a normal path. Cold-walk-6 finding 8, 2026-09-17; the reason
    // lives beside `stageOrApply` in the slice.
    expect(debugSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("carries the attachment across a re-create of the same conversation id", () => {
    let state = instanceUIStateReducer(undefined, createAction());
    state = instanceUIStateReducer(
      state,
      setBuilderAdvancedSettings({
        conversationId: CONVERSATION,
        changes: { addedMcpServers: ["context7"] },
      }),
    );
    expect(addedMcpFor(state)).toEqual(["context7"]);

    // The launcher effect re-runs and creates the same id again.
    state = instanceUIStateReducer(state, createAction());

    expect(addedMcpFor(state)).toEqual(["context7"]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("never reaps a conversation the person has configured, but still reaps an empty one", () => {
    const configured = instanceUIStateReducer(
      instanceUIStateReducer(undefined, createAction()),
      setBuilderAdvancedSettings({
        conversationId: CONVERSATION,
        changes: { addedMcpServers: ["context7"] },
      }),
    );
    const bare = instanceUIStateReducer(undefined, createAction());

    const run = (uiState: UIState) => {
      const dispatched: unknown[] = [];
      const getState = () =>
        ({
          conversations: { debugSessionActive: false },
          messages: { byConversationId: {} },
          instanceUserInput: { byConversationId: {} },
          instanceUIState: uiState,
        }) as unknown as RootState;
      destroyInstanceIfAbandoned(CONVERSATION)(
        ((action: unknown) => {
          dispatched.push(action);
          return action;
        }) as never,
        getState as never,
        undefined,
      );
      return dispatched;
    };

    expect(run(configured)).toEqual([]);
    // Forcing the other way: with nothing attached it MUST still be reaped, or
    // this guard would pass simply by never destroying anything.
    expect(run(bare)).toEqual([destroyInstance(CONVERSATION)]);
  });

  it("puts the slug on the wire after the reporter's exact sequence", async () => {
    // attach → launcher cleanup (must not reap) → launcher re-create → send.
    let uiState = instanceUIStateReducer(undefined, createAction());
    uiState = instanceUIStateReducer(
      uiState,
      setBuilderAdvancedSettings({
        conversationId: CONVERSATION,
        changes: { addedMcpServers: ["context7"] },
      }),
    );
    uiState = instanceUIStateReducer(uiState, createAction());

    const state = {
      agentDefinition: {
        agents: {
          [AGENT]: {
            id: AGENT,
            name: "General Chat",
            tools: [],
            customTools: [],
            mcpServers: [],
            _loadedFields: { name: true, modelId: true, tools: true },
          },
        },
      },
      conversations: {
        byConversationId: {
          [CONVERSATION]: {
            agentId: AGENT,
            mandateKey: "chat.default_new_chat",
            surfaceName: SURFACE,
          },
        },
      },
      instanceClientTools: { byConversationId: {} },
      instanceUIState: uiState,
      creatorDebug: { settings: {} },
      adminPreferences: {},
    } as unknown as RootState;

    const result = await buildToolInjection(state, CONVERSATION, {
      mode: "additive",
    });

    expect(result.client?.mcp).toEqual(["context7"]);
    expect(result.client?.surface).toBe(SURFACE);
  });
});
