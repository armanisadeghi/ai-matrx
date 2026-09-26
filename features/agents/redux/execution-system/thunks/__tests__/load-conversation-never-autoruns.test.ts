/**
 * Guard: reopening a conversation from the database is never a decision to run.
 *
 * The defect (lane data-tables-grid-overhaul, 2026-09-26): reloading
 * `/data-v2/<table>?panels=agent:<id>:m-flexible-panel` fired an EMPTY
 * `POST /v2/ai/conversations/<id>` on load — the transcript gained "This
 * request ends with an assistant response and has no new user or tool turn to
 * send". `loadConversation` hydrated the record as `status: "ready"` first and
 * only wrote the ui-state entry (with the hydrator's `autoRun: false`) at step
 * 5, after an awaited capability read. In between, `selectAutoRun` fell back to
 * its default `true`, and `AgentRunner`'s auto-run effect (autoRun && ready)
 * executed the conversation.
 *
 * The SUT is the ORDER the real thunk writes the real store in: at no moment
 * may a DB-loaded conversation be "ready" while auto-run reads true. The
 * network (supabase, bundle fetch, capability snapshot, edit history) is
 * stubbed; the store, its reducers and the selector AgentRunner reads are real.
 */

import { configureStore } from "@reduxjs/toolkit";

import messages from "../../messages/messages.slice";
import conversations from "../../conversations/conversations.slice";
import instanceUIState from "../../instance-ui-state/instance-ui-state.slice";
import { selectAutoRun } from "../../instance-ui-state/instance-ui-state.selectors";
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
    fetchInputCapabilitiesSnapshot: () =>
      new Promise((resolve) => setTimeout(() => resolve({}), 0)),
  }),
);
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

/** Every value `selectAutoRun` had while the conversation read "ready". */
async function autoRunWhileReady(
  args: Parameters<typeof loadConversation>[0],
  metadata?: Record<string, unknown>,
): Promise<boolean[]> {
  mockFetchBundle.mockResolvedValue(bundle(metadata));
  const store = configureStore({
    reducer: { messages, conversations, instanceUIState },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: boolean[] = [];
  store.subscribe(() => {
    const state = store.getState() as never as {
      conversations: {
        byConversationId: Record<string, { status?: string } | undefined>;
      };
    };
    if (state.conversations.byConversationId[CONVERSATION_ID]?.status === "ready") {
      seen.push(selectAutoRun(CONVERSATION_ID)(store.getState() as never));
    }
  });
  await store.dispatch(loadConversation(args) as never);
  return seen;
}

describe("loadConversation — a reopened conversation never auto-runs", () => {
  beforeEach(() => mockFetchBundle.mockReset());

  it("never reads ready + autoRun while the ?panels= restore loads it", async () => {
    const seen = await autoRunWhileReady({
      conversationId: CONVERSATION_ID,
      expectMaterialized: true,
      displayOverrides: { displayMode: "flexible-panel", autoRun: false },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(true);
  });

  it("never auto-runs a loaded conversation whose stored display said autoRun", async () => {
    const seen = await autoRunWhileReady(
      { conversationId: CONVERSATION_ID },
      { display: { displayMode: "floating-chat", autoRun: true } },
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(true);
  });
});
