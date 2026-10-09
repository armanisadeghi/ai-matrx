/**
 * A REJOINED TURN SHOWS THE PERSON'S OWN WORDS — a forcing function.
 *
 * Found live 2026-10-03 (admin@admin.com, private browser): reload /chat or
 * the run page 2–3 s into a long answer. The rejoin replays the live NDJSON
 * from frame one and streams the answer, but the person's message for that
 * turn rendered "This message has no displayable text." until the answer
 * finished. Turn rows commit at settle, so the only source during the rejoin
 * is the user `record_reserved` frame — which now echoes the pristine
 * `user_content` (aidream `user_turn_echo.py`).
 *
 * Real `processStream` + real messages reducer build the state from a
 * rejoin-shaped wire (no optimistic temp id); the real `AgentUserMessage`
 * renders it. Only the store hook is bound to that state.
 */
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import { act } from "react";
import { createRoot } from "react-dom/client";

import activeRequestsReducer, {
  createRequest,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import messagesReducer from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
// jest.mock calls below are hoisted above these imports by babel-jest.
import { AgentUserMessage } from "@ai-matrx/chat/agents/components/messages-display/user/AgentUserMessage";
import { TranscriptAudienceProvider } from "@ai-matrx/chat/agents/components/shared/transcript-audience";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

beforeAll(() => {
  configureServerForTest({});
});

let mockState: Record<string, unknown> = {};

jest.mock("@ai-matrx/chat/host/db", () => {
  const q: Record<string, jest.Mock> = {};
  q.eq = jest.fn(() => q);
  q.is = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  return {
    supabase: {
      schema: jest.fn(() => ({
        from: jest.fn(() => ({ select: jest.fn(() => q) })),
      })),
    },
  };
});
jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => mockState }),
}));

jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
  MarkdownStream: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock("@ai-matrx/chat/agents/components/messages-display/user/UserActionBar", () => ({ UserActionBar: () => null }));
jest.mock("@ai-matrx/chat/agents/components/messages-display/MessageAttachmentStrip", () => ({
  MessageAttachmentStrip: ({ parts }: { parts: Array<{ metadata?: { display_title?: string } }> }) => (
    <div data-testid="attachments">
      {parts.map((p) => p.metadata?.display_title ?? "").join(",")}
    </div>
  ),
}));
jest.mock(
  "@ai-matrx/chat/agents/components/context-policies-display/ContextPolicyChipStrip",
  () => ({ ContextPolicyChipStrip: () => null }),
);


const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const REQUEST = "55555555-5555-4555-8555-555555555555";
const USER_ROW = "22222222-2222-4222-8222-222222222222";
const ASSISTANT_ROW = "33333333-3333-4333-8333-333333333333";
const WORDS = "Compare the two leases and flag every renewal clause.";

function wire(events: unknown[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          i === events.length
            ? { done: true }
            : { done: false, value: encoder.encode(JSON.stringify(events[i++]) + "\n") },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
}

async function rejoinWith(userMetadata: Record<string, unknown>) {
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQUEST, conversationId: CONVERSATION }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const state = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: { [CONVERSATION]: { status: "streaming", agentId: null } },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
      userAuth: { adminLevel: null },
    }) as unknown as ChatRootState;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (d: typeof dispatch, g: typeof state) => unknown)(dispatch, state);
    }
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };
  // The answer is still running: the replay holds the reservations and a
  // chunk, never an `end` — exactly what a reload mid-answer rejoins.
  await processStream({
    requestId: REQUEST,
    conversationId: CONVERSATION,
    response: wire([
      {
        event: "record_reserved",
        data: {
          db_project: "matrx",
          table: "message",
          record_id: USER_ROW,
          parent_refs: { conversation_id: CONVERSATION },
          metadata: { role: "user", position: 0, ...userMetadata },
        },
      },
      {
        event: "record_reserved",
        data: {
          db_project: "matrx",
          table: "message",
          record_id: ASSISTANT_ROW,
          parent_refs: { conversation_id: CONVERSATION },
          metadata: { role: "assistant", position: 1 },
        },
      },
      { event: "end", data: {} },
    ]),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: dispatch as never,
    getState: state,
  });
  return state() as unknown as Record<string, unknown>;
}

function renderUserRow(state: Record<string, unknown>) {
  mockState = state;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <TranscriptAudienceProvider audience="expert">
        <AgentUserMessage conversationId={CONVERSATION} messageId={USER_ROW} />
      </TranscriptAudienceProvider>,
    ),
  );
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

// The host materializes artifacts a turn produced (P20 slot); this test has none, so it registers an empty result.
registerChatUi({
  materializeMessageArtifacts: async () => ({ materializedCount: 0, rewrittenContent: null, errors: [] }),
});

describe("a turn rejoined mid-answer", () => {
  it("shows the person's own words and attachment names from the reservation frame", async () => {
    const state = await rejoinWith({
      user_content: [
        { type: "text", text: WORDS },
        {
          type: "media",
          kind: "image",
          origin: "matrx",
          file_id: "13c2a464-2ead-4611-9990-702a03e643c4",
          mime_type: "image/png",
          metadata: { display_title: "lease-page-3.png" },
        },
      ],
    });
    const { host, done } = renderUserRow(state);
    try {
      expect(host.textContent).toContain(WORDS);
      expect(host.textContent).toContain("lease-page-3.png");
      expect(host.textContent).not.toContain("no displayable text");
    } finally {
      done();
    }
  });

  it("when the words are unknown (an older server), shows no row — never an empty box", async () => {
    const state = await rejoinWith({});
    const { host, done } = renderUserRow(state);
    try {
      expect(host.textContent).not.toContain("no displayable text");
      expect(host.querySelector('[data-testid="user-message-empty"]')).toBeNull();
    } finally {
      done();
    }
  });
});
