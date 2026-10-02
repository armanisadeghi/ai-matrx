/**
 * THE SEND PATH NEVER RESOLVES CONTEXT AGAINST A PARTIAL AGENT RECORD (R2-1).
 *
 * Use case: a note-taking person opens their "Meeting brief writer" agent in a
 * chat window over a note. The agent refuses ad-hoc page context (its kill
 * switch is on); Redux holds it only from the agents LIST, which never reads
 * `auto_context_disabled`. Seen live: 34 of 37 page values shown as sent and
 * SENT, all withheld by the server (63 mismatches).
 *
 * SUT: `ensureContextRulesReady` (awaited by every send path) + the real
 * agent-definition reducer and fetch thunk + `buildRequestContext`. Only the
 * database RPC is a double.
 */

import { configureStore } from "@reduxjs/toolkit";

const AGENT = "5a8f3c2e-7b14-4e0d-9c61-2d4b8e1f7a90";
const CHAT = "3ec7bfe6-1f2a-4c3b-8d4e-5f6a7b8c9d0e";

const rpc = jest.fn();
jest.mock("@host/utils/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    schema: () => ({
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          is: () => b,
          then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
        };
        return b;
      },
    }),
  },
}));
jest.mock("@host/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));

import agentDefinitionReducer, {
  mergePartialAgent,
  setAgentFetchStatus,
} from "../../../agent-definition/slice";
import { surfaceUserStateReducer } from "../../../../../surfaces/redux/userStateSlice";
import { ensureContextRulesReady } from "../context-rules.thunks";
import { buildRequestContext } from "../request-context";
import type { ChatRootState } from "../../../../../store/root-state";

const fixed = <T,>(v: T) => (s: T = v) => s;

function openChat() {
  const store = configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      surfaceUserState: surfaceUserStateReducer,
      conversations: fixed({ byConversationId: { [CHAT]: { agentId: AGENT, surfaceName: null } } }),
      instanceContext: fixed({
        byConversationId: {
          [CHAT]: {
            note_title: { key: "note_title", value: "Q4 vendor review", type: "text", label: "note_title", slotMatched: false },
            note_body: { key: "note_body", value: "Renew the Harbor Dental contract", type: "text", label: "note_body", slotMatched: false },
          },
        },
        surfaceKeysByConversationId: {},
        receiptByConversationId: {},
        expectedByConversationId: {},
      }),
      instanceResources: fixed({ byConversationId: {} }),
      messages: fixed({ byConversationId: { [CHAT]: { orderedIds: ["m1"] } } }),
      instanceUIState: fixed({ byConversationId: {} }),
    },
  });
  // The agent as a list fetch plus a narrower read leave it: card fields and
  // the two fields the old readiness check looked for — but never its kill
  // switch. Readiness must come from the fetch status, not field presence.
  store.dispatch(
    mergePartialAgent({ id: AGENT, name: "Meeting brief writer", variableDefinitions: [], contextPolicies: [] }),
  );
  store.dispatch(setAgentFetchStatus({ id: AGENT, status: "list" }));
  return store;
}

beforeEach(() => {
  rpc.mockReset();
});

it.each([
  [true, false, []],
  [false, true, ["note_body", "note_title"]],
])(
  "an agent whose kill switch is %s: values included = %s, sent %j",
  async (killSwitch, included, sent) => {
    rpc.mockResolvedValue({
      data: [{ id: AGENT, variable_definitions: [], context_policies: [], auto_context_disabled: killSwitch }],
      error: null,
    });
    const store = openChat();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thunk dispatch on a narrow test store
    await (store.dispatch as any)(ensureContextRulesReady(CHAT));

    expect(rpc).toHaveBeenCalledWith("agx_get_execution_minimal", { p_agent_id: AGENT });
    const { rows, context } = buildRequestContext(store.getState() as unknown as ChatRootState, CHAT);
    expect(rows.map((r) => r.include)).toEqual([included, included]);
    expect(Object.keys(context ?? {}).sort()).toEqual(sent);
  },
);
