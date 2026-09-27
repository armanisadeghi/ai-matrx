/**
 * Guard: an agent the person can no longer read never stops their own
 * conversation from reopening.
 *
 * THE DEFECT (2026-09-26): /chat/<id> for a conversation whose agent now sits
 * in an organization the viewer is not in failed to resume at all ("1 Issue":
 * useConversationResume failed — the agent's ui_gates read returned 406), so
 * the person could not open their own transcript. It now opens with the
 * default input settings and says so.
 */
import { configureStore } from "@reduxjs/toolkit";

import messages from "../../messages/messages.slice";
import conversations from "../../conversations/conversations.slice";
import instanceUIState from "../../instance-ui-state/instance-ui-state.slice";
import { loadConversation } from "../load-conversation.thunk";

const mockFetchBundle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: null } }),
}));
jest.mock("../conversation-bundle", () => {
  const actual = jest.requireActual("../conversation-bundle");
  return {
    ...actual,
    fetchConversationBundle: (...args: unknown[]) => mockFetchBundle(...args),
  };
});
jest.mock(
  "../../instance-input-capabilities/input-capabilities-snapshot",
  () => ({
    // A real network read: it yields to the event loop, which is exactly the
    // window in which a mounted AgentRunner renders.
    // The agent exists but the person can no longer read it (406 / PGRST116).
    fetchInputCapabilitiesSnapshot: () =>
      Promise.reject(
        new Error("Failed to load input capabilities for x: Cannot coerce the result to a single JSON object"),
      ),
  }),
);
const mockToastInfo = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { info: (...a: unknown[]) => mockToastInfo(...a) } }));
jest.mock("@/features/code/redux/codeEditHistoryHydration", () => ({
  loadCodeEditHistoryThunk: () => ({ type: "test/loadCodeEditHistory" }),
}));

const CONVERSATION_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const AGENT_ID = "6cb7be35-719a-43a0-8faf-075cf300d4a7";

function bundle(metadata: Record<string, unknown> = {}) {
  const now = "2026-09-26T14:01:49.000Z";
  return {
    conversation: {
      id: CONVERSATION_ID,
      initial_agent_id: AGENT_ID,
      initial_agent_version_id: null,
      source_app: "matrx-frontend",
      source_feature: "udt",
      status: "active",
      created_at: now,
      updated_at: now,
      created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
      title: "Selected cell",
      metadata,
      variables: {},
      overrides: {},
      message_count: 2,
    },
    messages: [
      {
        id: "m-1",
        conversation_id: CONVERSATION_ID,
        role: "user",
        position: 0,
        content: [{ type: "text", text: "Which cell do I have selected?" }],
        created_at: now,
        metadata: {},
      },
      {
        id: "m-2",
        conversation_id: CONVERSATION_ID,
        role: "assistant",
        position: 1,
        content: [{ type: "text", text: "Crew — Truck 7, Elena Ibarra's row." }],
        created_at: now,
        metadata: {},
      },
    ],
    tool_calls: [],
  };
}


it("reopens the conversation with default input settings and announces it", async () => {
  mockFetchBundle.mockResolvedValue(bundle());
  const store = configureStore({
    reducer: { messages, conversations, instanceUIState },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const result = await store.dispatch(
    loadConversation({ conversationId: CONVERSATION_ID, expectMaterialized: true }) as never,
  );
  expect((result as { meta: { requestStatus: string } }).meta.requestStatus).toBe("fulfilled");
  expect(mockToastInfo).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
