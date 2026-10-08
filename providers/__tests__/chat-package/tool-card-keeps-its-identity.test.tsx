import "@/__tests__/helpers/register-chat-host";
import "@/providers/chatUiRegistration";
/**
 * GUARD: a tool card is the SAME DOM node from the moment it appears in a
 * live turn until after the turn has settled — never unmounted and remounted.
 *
 * The defect (verifier 2026-09-26 r4, side drawer at 375): the card blinked
 * for ~0.3 s at completion. A frame sampler showed two remounts of the card
 * node in one turn: (1) mid-stream, when the server announced the answer's
 * row after its iteration ran — the collapsed turn member was keyed by its
 * LAST row id, so a new last row unmounted the whole answer; (2) at
 * completion, when the settled turn split into one member per row and the
 * card moved from the live renderer's element (`InlineToolCard`) to the
 * persisted one (`DbToolCard`) under a different key; (3) (r5, drawer and
 * Chat window) in the beat between the stream going inactive and the commit
 * landing, the settled "Worked for" fold ran over the LIVE slots — an empty
 * reasoning run counts as work there — and tucked the card into a collapsed
 * group, then the record (which drops the empty run) brought it back out.
 *
 * The seam: the real `processStream` drives the real reducers; the real
 * display grouping, the real `AssistantTurnGroup`, `AgentAssistantMessage`,
 * `MarkdownStream` and `EnhancedChatMarkdown` render the turn. Only the tool
 * card's own visual body (`ToolCallVisualization`) and unrelated leaf chrome
 * are stubbed — the identity under test is decided entirely by the tree above
 * the card.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

// The store the components read: the harness's live state, with every slice
// this test does not drive reading as empty.
let currentState: ChatRootState | null = null;
const EMPTY_SLICE = new Proxy(
  {},
  { get: (_t, key) => (key === "then" ? undefined : undefined) },
);
function stateForComponents(): ChatRootState {
  const base = currentState as unknown as Record<string, unknown>;
  return new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : EMPTY_SLICE),
  }) as unknown as ChatRootState;
}
jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(stateForComponents()),
  useAppDispatch: () => () => undefined,
  useAppStore: () => ({ getState: () => stateForComponents() }),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@/lib/redux/hooks", () =>
  jest.requireMock("@ai-matrx/chat/store/hooks"),
);
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => null,
}));
// The engine loads through next/dynamic in the app; render it directly here.
// Resolved at render, not at mock time: the registered app UI (chatUiRegistration, imported
// first) loads this module while MarkdownStreamImpl is still mid-load, so an eager
// requireActual here would capture `undefined`. The wrapper is one stable component type.
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => {
  const MarkdownStreamForTest = (props: Record<string, unknown>) => {
    const Impl = jest.requireActual("@ai-matrx/chat/ui/markdown-stream/MarkdownStreamImpl").default;
    return <Impl {...props} />;
  };
  return { __esModule: true, default: MarkdownStreamForTest };
});
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
jest.mock("@ai-matrx/chat/host/navigation", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/navigation"),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/chat",
  useSearchParams: () => new URLSearchParams(),
}));
// The card's own body: one marked node per call. Everything that decides
// whether THIS node survives lives above it.
jest.mock(
  "@ai-matrx/chat/tool-call-visualization/components/ToolCallVisualization",
  () => ({
    ToolCallVisualization: ({
      entries,
    }: {
      entries: Array<{ callId: string; status: string }>;
    }) => (
      <div
        data-tool-card={entries[0]?.callId}
        data-status={entries[0]?.status}
      />
    ),
  }),
);
jest.mock(
  "@ai-matrx/chat/tool-call-visualization/components/ToolCallBatch",
  () => ({
    ToolCallBatch: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  }),
);
jest.mock(
  "@ai-matrx/rich-content/display/chat-markdown/internal-handlers/SafeBlockRenderer",
  () => ({ SafeBlockRenderer: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor",
  () => ({ __esModule: true, default: () => null }),
);
jest.mock(
  "@ai-matrx/chat/ui/markdown-stream/useBoundAgentOutputSchema",
  () => ({ useBoundAgentOutputSchema: () => null }),
);
jest.mock("@ai-matrx/chat/agents/components/shared/transcript-audience", () => ({
  useMachineFramesVisible: () => true,
}));
jest.mock("@ai-matrx/chat/agents/components/messages-display/assistant/AssistantMessageFooter", () => ({
  AssistantMessageFooter: () => null,
  AssistantMessageFooterPlaceholder: () => null,
  AssistantMessageContextMenu: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
}));
jest.mock("@/features/code/views/history/MessageFilesStrip", () => ({
  MessageFilesStrip: () => null,
}));

import activeRequestsReducer, {
  createRequest,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import messagesReducer from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import observabilityReducer from "@ai-matrx/chat/agents/redux/execution-system/observability/observability.slice";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import { buildDisplayEntries, groupDisplayEntries } from "@ai-matrx/chat/agents/components/messages-display/display-groups";
import { AssistantTurnGroup } from "@ai-matrx/chat/agents/components/messages-display/assistant/AssistantTurnGroup";
import { ChatHostTestProvider } from "@ai-matrx/chat/testing/chat-host-test-provider";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";

// Server calls reach the host's server client through the server port (P9).
beforeAll(() => {
  configureServerForTest({});
});

const encoder = new TextEncoder();
const CONV = "3d2e1f0a-7b6c-4d5e-8f9a-0b1c2d3e4f5a";
const REQ = "req_intake_card_identity";
const CALL = "toolu_intake_step4_identity";
const ROW1 = "d0000000-0001-4000-8000-000000000001";
const ROW3 = "d0000000-0003-4000-8000-000000000003";

function steppedResponse(events: unknown[]) {
  let index = 0;
  let release: (() => void) | undefined;
  let notify!: () => void;
  let ready = new Promise<void>((resolve) => {
    notify = resolve;
  });
  return {
    response: {
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= events.length) {
              notify();
              return { done: true };
            }
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            notify();
            await gate;
            return {
              done: false,
              value: encoder.encode(JSON.stringify(events[index++]) + "\n"),
            };
          },
          releaseLock() {},
        }),
      },
      headers: new Headers(),
    } as unknown as Response,
    async advance() {
      await ready;
      const next = release;
      if (!next)
        throw new Error("stream reader did not stop at its checkpoint");
      ready = new Promise<void>((resolve) => {
        notify = resolve;
      });
      release = undefined;
      next();
      await ready;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  };
}

const reserved = (
  table: string,
  id: string,
  metadata: Record<string, unknown>,
  parent: Record<string, unknown> = {},
) => ({
  event: "record_reserved",
  data: {
    db_project: "main",
    table,
    record_id: id,
    parent_refs: { conversation_id: CONV, ...parent },
    metadata,
  },
});
// The server marks each row persisted as its iteration lands.
const rowActive = (id: string) => ({
  event: "record_update",
  data: {
    db_project: "matrx",
    table: "message",
    record_id: id,
    status: "active",
    metadata: {},
  },
});
const dataTool = (event: string, data: Record<string, unknown> = {}) => ({
  event: "tool_event",
  data: { event, call_id: CALL, tool_name: "data", data },
});

// The production wire shape: iteration 1's row is announced up front; the
// answer's row is announced only after its iteration ran (iteration_persist).
const EVENTS: unknown[] = [
  reserved("message", ROW1, { role: "assistant", position: 1 }),
  reserved(
    "request",
    "req-iter-1",
    { iteration: 1 },
    { user_request_id: "ur_1" },
  ),
  // The model reasons without streaming any reasoning text (the production
  // wire): a live reasoning run with nothing in it, which the committed
  // record drops.
  { event: "reasoning", data: { state: "started" } },
  { event: "reasoning", data: { state: "stopped" } },
  reserved(
    "tool_call",
    "e0000000-0001-4000-8000-000000000001",
    { tool_name: "data", call_id: CALL, iteration: 1 },
    { user_request_id: "ur_1", call_id: CALL },
  ),
  dataTool("tool_started", {
    arguments: {
      action: "patch",
      target: "note",
      old_text: "4. Take blood pressure",
    },
  }),
  dataTool("tool_completed", { result: { ok: true, edits: 1 } }),
  rowActive(ROW1),
  reserved(
    "request",
    "req-iter-2",
    { iteration: 2 },
    { user_request_id: "ur_1" },
  ),
  {
    event: "chunk",
    data: {
      text: "Step 4 of the intake checklist now also records allergies.",
    },
  },
  reserved("message", ROW3, {
    role: "assistant",
    position: 3,
    source: "iteration_persist",
  }),
  rowActive(ROW3),
  { event: "end", data: {} },
];

function harness() {
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId: CONV }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  let observability = observabilityReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      observability,
      conversations: {
        byConversationId: { [CONV]: { status: "streaming", agentId: null } },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
    }) as unknown as ChatRootState;
  const dispatch = (action: unknown) => {
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    observability = observabilityReducer(observability, action as never);
    return action;
  };
  const stream = steppedResponse(EVENTS);
  return {
    getState,
    stream,
    done: processStream({
      requestId: REQ,
      conversationId: CONV,
      response: stream.response,
      submitAt: 0,
      conversationIdAt: null,
      dispatch,
      getState,
      abortController: new AbortController(),
    }),
  };
}

/** The transcript's assistant turns, keyed exactly as AgentConversationDisplay keys them. */
function Turns({ streamActive }: { streamActive: boolean }) {
  const state = currentState as ChatRootState;
  const conv = state.messages.byConversationId[CONV];
  if (!conv) return null;
  const groups = groupDisplayEntries(
    buildDisplayEntries({
      messages: conv.orderedIds.map((id) => conv.byId[id]),
      isActive: streamActive,
      latestRequestId: REQ,
      isErrorPhase: false,
    }),
  );
  return (
    <>
      {groups.map((g) =>
        g.kind === "assistant" ? (
          <AssistantTurnGroup
            key={g.key}
            conversationId={CONV}
            members={g.members}
          />
        ) : null,
      )}
    </>
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const card = () => host.querySelector(`[data-tool-card="${CALL}"]`);

test("the intake-checklist patch card is one DOM node from its first frame through completion", async () => {
  const h = harness();
  const render = (streamActive: boolean) =>
    act(() => {
      currentState = h.getState();
      root.render(
        <ChatHostTestProvider>
          <Turns streamActive={streamActive} />
        </ChatHostTestProvider>,
      );
    });

  // Up to the tool finishing: the card is on screen.
  const toolDone = EVENTS.findIndex(
    (e) =>
      (e as { data?: { event?: string } }).data?.event === "tool_completed",
  );
  for (let i = 0; i <= toolDone; i++) await h.stream.advance();
  render(true);
  const first = card();
  if (!first)
    throw new Error(`no card rendered: ${host.innerHTML.slice(0, 1500)}`);

  // The answer streams, and the server announces the answer's row late.
  for (let i = toolDone + 1; i < EVENTS.length - 1; i++) {
    await h.stream.advance();
    render(true);
    expect(card()).toBe(first);
  }

  // The host flips the turn to "not streaming" a beat BEFORE the commit
  // lands (the drawer and the Chat window do, most runs): the live reading
  // must not be re-folded for that beat.
  render(false);
  if (card() !== first)
    throw new Error(`gap render: ${host.innerHTML.slice(0, 3000)}`);

  // `end`: the turn commits and settles onto its stored rows.
  await h.stream.advance();
  await h.done;
  render(false);
  expect(card()).toBe(first);
  expect(card()?.getAttribute("data-status")).toBe("completed");
});
