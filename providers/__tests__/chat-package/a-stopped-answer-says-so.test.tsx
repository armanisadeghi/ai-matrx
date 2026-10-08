/** @jest-environment jsdom */
/**
 * A stopped answer says so on the message — after a reload and live
 * (PB-05 run 2, 2026-10-01, prod conversation ac170b56…).
 *
 * The person pressed Stop at Stop 10 of a 40-stop itinerary. After a reload
 * the saved answer ended "Mileage check: Tacoma to La Grande = 267" with no
 * sign on it that it was stopped — indistinguishable from a finished answer.
 *
 * Mounted: the REAL AgentAssistantMessage over the REAL slim root reducer,
 * fed the row exactly as chat.message holds it (aidream writes
 * metadata.stopped on the partial a Stop keeps) and, for the live case, the
 * request status cancelExecution writes. Break guarded: the marker missing on
 * a stopped answer, or shown on a finished one.
 */

import React, { act } from "react";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createInstance } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import {
  hydrateMessages,
  type MessageRecord,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import {
  createRequest,
  setRequestStatus,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import { TooltipProvider } from "@ai-matrx/design-system";
import { ChatHostTestProvider } from "@ai-matrx/chat/testing/chat-host-test-provider";
import { AlchemyActionsTestHost } from "@/test-utils/alchemy-actions-host";
import { AgentAssistantMessage } from "@ai-matrx/chat/agents/components/messages-display/assistant/AgentAssistantMessage";

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes("MarkdownStreamImpl")) {
      const Impl = (
        jest.requireActual("@ai-matrx/chat/ui/markdown-stream/MarkdownStreamImpl") as {
          default: React.ComponentType<Record<string, unknown>>;
        }
      ).default;
      return (props: Record<string, unknown>) =>
        React.createElement(Impl, props);
    }
    return () => null;
  },
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;
globals.IS_REACT_ACT_ENVIRONMENT = true;

const CONV = "ac170b56-c9b1-4694-aaad-87f3870e7e2e";
const MESSAGE_ID = "ef6c5ab0-4d5c-4839-8902-b6c87794a7cf";
const SAVED =
  "Stop 10 — La Grande, Oregon Rest Area & Route Confirmation, I-84 Mile 228: " +
  "Cargo straps are visually inspected. **Mileage check: Tacoma to La Grande = 267";

function row(metadata: Record<string, unknown>): MessageRecord {
  return {
    id: MESSAGE_ID,
    conversationId: CONV,
    agentId: null,
    role: "assistant",
    content: [{ type: "text", text: SAVED }],
    contentHistory: null,
    userContent: null,
    position: 8,
    source: "assistant",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata,
    createdAt: "2026-10-01T20:43:26.810Z",
    deletedAt: null,
  } as MessageRecord;
}

async function render(
  metadata: Record<string, unknown>,
  live?: { requestId: string; status: "cancelled" | "complete" },
): Promise<string> {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (g) =>
      g({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }),
  });
  store.dispatch(
    createInstance({
      conversationId: CONV,
      agentId: "7535bd0d-0000-0000-0000-000000000000",
      agentType: "user",
      origin: "manual",
      status: "ready",
    } as never),
  );
  store.dispatch(
    hydrateMessages({ conversationId: CONV, messages: [row(metadata)] }),
  );
  if (live) {
    store.dispatch(
      createRequest({ requestId: live.requestId, conversationId: CONV }),
    );
    store.dispatch(
      setRequestStatus({ requestId: live.requestId, status: live.status }),
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ChatHostTestProvider store={store}>
          <AlchemyActionsTestHost>
            <TooltipProvider>
              <AgentAssistantMessage
                conversationId={CONV}
                messageId={MESSAGE_ID}
                requestId={live?.requestId}
                isStreamActive={false}
              />
            </TooltipProvider>
          </AlchemyActionsTestHost>
        </ChatHostTestProvider>
      </Provider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });
  // The message body mounted (its markdown renders through a lazy chunk that
  // jest does not load; the marker sits beside it, outside that chunk).
  const mounted = !!host.querySelector(`[data-message-id="${MESSAGE_ID}"]`);
  const text = mounted ? (host.textContent ?? "") : "<message did not mount>";
  await act(async () => root.unmount());
  host.remove();
  return text;
}

describe("a stopped answer says so", () => {
  it("after a reload, from the saved row", async () => {
    const text = await render({ stopped: true });
    expect(text).toContain("Stopped here");
  });

  it("live, from the cancelled request", async () => {
    const text = await render(
      {},
      { requestId: "req_whitcombe", status: "cancelled" },
    );
    expect(text).toContain("Stopped here");
  });

  it("never on an answer that finished", async () => {
    const text = await render(
      { provider_iteration: 1 },
      { requestId: "req_done", status: "complete" },
    );
    expect(text).not.toContain("<message did not mount>");
    expect(text).not.toContain("Stopped here");
  });
});
