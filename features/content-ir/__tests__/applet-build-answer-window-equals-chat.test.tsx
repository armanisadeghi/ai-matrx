/** @jest-environment jsdom */
/**
 * THE APPLET BUILDER'S FLOATING WINDOW DRAWS THE SAME CARD AS THE SAVED CHAT.
 *
 * What Arman saw (2026-10-07): /applets/build streamed its finished answer into
 * the floating "Building your app" window as a key/value dump — Note, Applet,
 * Description, Entry, a Files table full of source code, a red "2 problems"
 * flag — while the SAME answer opened in /chat drew its Applet card.
 *
 * The cause was not the window. The kind registry's cold fetch replaces the
 * compiled `applet_build_result` schema with the one derived from the database
 * row's `emitted_json_schema`, and that derivation read pydantic's `AppletRecord`
 * `$def` (a plain nested model, `__kind` an optional free string) as a KIND
 * reference — so the parser demanded `applet.__kind === "AppletRecord"`, the
 * answer resolved `raw`, and the route fell to the generic fallback. The live
 * stream requests the schema at the first `__kind` it sees, so the database
 * schema had always landed by the time the answer closed; the saved chat
 * splits its answer before the fetch returns and froze the compiled verdict.
 * Same answer, two screens, decided by a race. Fixed in @ai-matrx/content-ir
 * 0.22.7: a `$def` that does not declare its kind converts in place.
 *
 * Mounted: the REAL LiveRunDisplay (what LiveRunWindow renders, `bare`) fed the
 * REAL captured `applets.build` NDJSON through the REAL processStream, and the
 * REAL AgentAssistantMessage over the stored answer — both AFTER the registry
 * holds the database schema, so the race cannot hide the verdict. Stand-in: the
 * database READ only — the fixture is the live row's `emitted_json_schema`
 * (2026-10-07) and it is derived by the same `kindSchemaFromJsonSchema` the
 * registry's `deriveKindSchema` calls.
 */

import "@/__tests__/helpers/register-chat-host";
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createInstance } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import {
  addOptimisticUserMessage,
  hydrateMessages,
  type MessageRecord,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import { createRequest } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import { processStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import { AgentAssistantMessage } from "@ai-matrx/chat/agents/components/messages-display/assistant/AgentAssistantMessage";
import { TooltipProvider } from "@ai-matrx/design-system";
import { ChatHostTestProvider } from "@ai-matrx/chat/testing/chat-host-test-provider";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { AlchemyActionsTestHost } from "@/test-utils/alchemy-actions-host";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";

const KIND = "applet_build_result";

jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => {
  const actual = jest.requireActual("@/features/content-ir/registry/schema-source-kind-tables");
  const { kindSchemaFromJsonSchema } = jest.requireActual("@ai-matrx/content-ir");
  const { readFileSync: read } = jest.requireActual("node:fs");
  const { join: joinPath } = jest.requireActual("node:path");
  const emitted = JSON.parse(
    read(joinPath(__dirname, "fixtures/applet-build-result.emitted-json-schema.json"), "utf8"),
  );
  return {
    ...actual,
    listKindCatalogFromTables: async () => [],
    getKindSchemaAndMetaBySlugFromTables: async (kind: string) =>
      kind === "applet_build_result"
        ? { schema: kindSchemaFromJsonSchema(kind, emitted).schema, loadingComponent: null, emittedJsonSchema: emitted }
        : null,
  };
});
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes("block-registry/BlockRenderer")) {
      const { BlockRenderer } = jest.requireActual(
        "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer",
      ) as { BlockRenderer: React.ComponentType<Record<string, unknown>> };
      return (props: Record<string, unknown>) => React.createElement(BlockRenderer, props);
    }
    if (String(loader).includes("MarkdownStreamImpl")) {
      const Impl = (jest.requireActual("@/components/MarkdownStreamImpl") as {
        default: React.ComponentType<Record<string, unknown>>;
      }).default;
      return (props: Record<string, unknown>) => React.createElement(Impl, props);
    }
    return () => null;
  },
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

/** The live `applets.build` stream, captured 2026-10-07 (reasoning, then the bare JSON answer). */
const LINES = readFileSync(join(__dirname, "fixtures/applet-build-stream.ndjson"), "utf8")
  .split("\n")
  .filter((line) => line.trim());
const CONVERSATION = JSON.parse(LINES.find((l) => l.includes('"conversation_id"'))!).data
  .conversation_id as string;
const ANSWER = JSON.parse(LINES.find((l) => /"event":\s*"completion"/.test(l))!).data.result
  .output as string;

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          return index >= chunks.length
            ? { done: true, value: undefined }
            : { done: false, value: encoder.encode(chunks[index++]) };
        },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
}

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false, actionCreatorCheck: false }),
  });
}

function Host({ store, children }: { store: ReturnType<typeof makeStore>; children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ChatHostTestProvider store={store}>
        <AlchemyActionsTestHost>
          <TooltipProvider>{children}</TooltipProvider>
        </AlchemyActionsTestHost>
      </ChatHostTestProvider>
    </Provider>
  );
}

/** Wait (bounded) until the settled answer has drawn one way or the other. */
async function settled(host: HTMLElement): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const v = verdict(host);
    if (v.card || v.problems) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** What a reader is shown: the kind's card, or the generic floor. */
function verdict(host: HTMLElement) {
  return {
    card: host.querySelector(`[data-kind="${KIND}"]`) !== null,
    problems: host.querySelector('[aria-label$="problems"], [aria-label$="problem"]') !== null,
    text: host.textContent ?? "",
  };
}

beforeAll(async () => {
  configureServerForTest({});
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  });
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: RO });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: RO });
  Element.prototype.scrollIntoView = () => {};
  // The database schema REPLACES the compiled floor — hold it before either path renders.
  kindRegistry.requestSchema(KIND);
  for (let i = 0; i < 200 && kindRegistry.getDefinition(KIND)?.schemaSource !== "content_ir"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(kindRegistry.getDefinition(KIND)?.schemaSource).toBe("content_ir");
});

describe("an applet_build_result answer under the database schema", () => {
  it("draws its card in the floating run window (live stream)", async () => {
    const requestId = "req_applet_build";
    const store = makeStore();
    store.dispatch(createInstance({ conversationId: CONVERSATION, agentId: "applets-build", agentType: "user", origin: "manual", status: "running" } as never));
    store.dispatch(addOptimisticUserMessage({ conversationId: CONVERSATION, clientTempId: "u1", content: [{ type: "text", text: "A list of my favourite movies" }] as never, position: 0 }));
    store.dispatch(createRequest({ requestId, conversationId: CONVERSATION }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Host store={store}>
          <LiveRunDisplay conversationId={CONVERSATION} variant="bare" />
        </Host>,
      );
    });
    // Stream OUTSIDE act(), as a browser does.
    globals.IS_REACT_ACT_ENVIRONMENT = false;
    await processStream({
      requestId,
      conversationId: CONVERSATION,
      response: streamResponse(LINES.map((line) => line + "\n")),
      submitAt: 0,
      conversationIdAt: null,
      dispatch: store.dispatch as never,
      getState: store.getState as never,
      abortController: new AbortController(),
    });
    await settled(host);
    await new Promise((resolve) => setTimeout(resolve, 200));
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const seen = verdict(host);
    await act(async () => root.unmount());
    host.remove();

    expect(seen.problems).toBe(false);
    expect(seen.card).toBe(true);
    expect(seen.text).toContain("Favourite Movies");
    expect(seen.text).not.toContain("import React");
  });

  it("draws the same card from the saved chat", async () => {
    const store = makeStore();
    store.dispatch(createInstance({ conversationId: "conv-saved", agentId: "applets-build", agentType: "user", origin: "manual", status: "ready" } as never));
    store.dispatch(
      hydrateMessages({
        conversationId: "conv-saved",
        messages: [
          {
            id: "msg-saved",
            conversationId: "conv-saved",
            agentId: null,
            role: "assistant",
            content: [{ type: "thinking", text: "" }, { type: "text", text: ANSWER }],
            contentHistory: null,
            userContent: null,
            position: 1,
            source: "assistant",
            status: "active",
            isVisibleToModel: true,
            isVisibleToUser: true,
            metadata: {},
            createdAt: "2026-10-07T21:15:35.000Z",
            deletedAt: null,
          } as MessageRecord,
        ],
      }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Host store={store}>
          <AgentAssistantMessage conversationId="conv-saved" messageId="msg-saved" isStreamActive={false} />
        </Host>,
      );
    });
    await act(async () => {
      await settled(host);
    });
    const seen = verdict(host);
    await act(async () => root.unmount());
    host.remove();

    expect(seen.problems).toBe(false);
    expect(seen.card).toBe(true);
    expect(seen.text).toContain("Favourite Movies");
  });
});
