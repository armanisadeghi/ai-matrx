/**
 * Guard (W-65, PB-07 S10): the share level reaches the composer.
 *
 * A view-level sharee got a live "Reply" box that failed only after sending.
 * `loadConversation` now asks the access kernel (`iam.has_access` at editor,
 * via `canActOn`) for a viewer who is not the owner, and lands the answer on
 * the record BEFORE it reads "ready", so `selectViewerCanReply` — what
 * `SmartAgentInput` gates on — never says "may reply" for a viewer.
 *
 * Real store, real reducers, real thunk and selector; only the network
 * (bundle fetch, claims, the `iam.has_access` RPC) is stubbed.
 */

import { configureStore } from "@reduxjs/toolkit";

import messages from "../../messages/messages.slice";
import conversations from "../../conversations/conversations.slice";

import { selectViewerCanReply } from "../../conversations/conversations.selectors";
import { loadConversation } from "../load-conversation.thunk";



const OWNER = "87a6e699-3622-4869-8843-d0867456c0dd";
const SHAREE = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const CONVERSATION_ID = "75ccac71-9ecd-4d99-b610-8f73bff37307";

const mockFetchBundle = jest.fn();
const mockHasAccess = jest.fn();
let mockSignedIn: string | null = null;

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    schema: () => ({
      rpc: (fn: string, args: Record<string, unknown>) => mockHasAccess(fn, args),
    }),
  },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({
    data: { user: mockSignedIn ? { id: mockSignedIn } : null },
  }),
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
  () => ({ fetchInputCapabilitiesSnapshot: async () => ({}) }),
);
jest.mock("@/features/code/redux/codeEditHistoryHydration", () => ({
  loadCodeEditHistoryThunk: () => ({ type: "test/loadCodeEditHistory" }),
}));
jest.mock("@/features/canvas/materialization/reconcileArtifacts", () => ({
  reconcileMessagesArtifacts: async () => undefined,
}));

function bundle() {
  const now = "2026-10-01T09:28:09.000Z";
  return {
    conversation: {
      id: CONVERSATION_ID,
      initial_agent_id: null,
      initial_agent_version_id: null,
      source_app: "matrx-frontend",
      source_feature: "chat",
      status: "active",
      created_at: now,
      updated_at: now,
      created_by: OWNER,
      organization_id: "2c1d4319-bf0d-40bc-8ca1-657f4063d080",
      title: "Move 5208",
      metadata: {},
      variables: {},
      overrides: {},
      message_count: 1,
    },
    messages: [
      {
        id: "m-1",
        conversation_id: CONVERSATION_ID,
        role: "user",
        position: 0,
        content: [{ type: "text", text: "Read this back for move 5208" }],
        created_at: now,
        metadata: {},
      },
    ],
    tool_calls: [],
  };
}

/** Every `selectViewerCanReply` value while the record read "ready". */
async function canReplyWhileReady(): Promise<boolean[]> {
  mockFetchBundle.mockResolvedValue(bundle());
  const store = configureStore({
    reducer: { messages, conversations },
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: boolean[] = [];
  store.subscribe(() => {
    const state = store.getState() as never as {
      conversations: { byConversationId: Record<string, { status?: string } | undefined> };
    };
    if (state.conversations.byConversationId[CONVERSATION_ID]?.status === "ready") {
      seen.push(selectViewerCanReply(CONVERSATION_ID)(store.getState() as never));
    }
  });
  await store.dispatch(
    loadConversation({ conversationId: CONVERSATION_ID, expectMaterialized: true }) as never,
  );
  return seen;
}

describe("loadConversation — the share level reaches the composer", () => {
  beforeEach(() => {
    mockFetchBundle.mockReset();
    mockHasAccess.mockReset();
  });

  it("a view-level sharee is never told they may reply", async () => {
    mockSignedIn = SHAREE;
    mockHasAccess.mockResolvedValue({ data: false, error: null });
    const seen = await canReplyWhileReady();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(true);
    expect(mockHasAccess).toHaveBeenCalledWith("has_access", {
      p_type: "conversation",
      p_id: CONVERSATION_ID,
      p_required: "editor",
    });
  });

  it("an editor sharee may reply", async () => {
    mockSignedIn = SHAREE;
    mockHasAccess.mockResolvedValue({ data: true, error: null });
    const seen = await canReplyWhileReady();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(false);
  });

  it("the owner may reply without asking", async () => {
    mockSignedIn = OWNER;
    const seen = await canReplyWhileReady();
    expect(seen).not.toContain(false);
    expect(mockHasAccess).not.toHaveBeenCalled();
  });
});
