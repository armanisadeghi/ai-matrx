/** @jest-environment jsdom */
/**
 * THE APPLET BUILDER'S WINDOW MOVES WHILE IT BUILDS — never a spinner for the whole run.
 *
 * What lane P saw on /applets/build (2026-10-07): with the builder on Gemini 3.8 Flash the
 * floating "Building your app" window showed "Initializing Matrx..." for ~90 s and then the
 * finished card. Gemini orders an object's keys alphabetically, so `applet.name` and `pages`
 * arrive LAST, after every file — and the kind's bridge declined to draw until it had a name or
 * a page. The bridge now draws as soon as a description or a file arrives, and the card lists
 * the files as they are written.
 *
 * Mounted: the REAL LiveRunDisplay fed the first third of a REAL captured `applets.build`
 * stream (Gemini, no reasoning) through the REAL processStream; the stream never ends.
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
      const Impl = (jest.requireActual("@ai-matrx/chat/ui/markdown-stream/MarkdownStreamImpl") as {
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
const LINES = readFileSync(join(__dirname, "fixtures/applet-build-stream-partial.ndjson"), "utf8")
  .split("\n")
  .filter((line) => line.trim());
const CONVERSATION = JSON.parse(LINES.find((l) => l.includes('"conversation_id"'))!).data
  .conversation_id as string;

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


it("draws the card and the files being written while the answer is still streaming", async () => {
  const requestId = "req_applet_build_partial";
  const store = makeStore();
  store.dispatch(createInstance({ conversationId: CONVERSATION, agentId: "applets-build", agentType: "user", origin: "manual", status: "running" } as never));
  store.dispatch(addOptimisticUserMessage({ conversationId: CONVERSATION, clientTempId: "u1", content: [{ type: "text", text: "x" }] as never, position: 0 }));
  store.dispatch(createRequest({ requestId, conversationId: CONVERSATION }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<Host store={store}><LiveRunDisplay conversationId={CONVERSATION} variant="bare" /></Host>); });
  globals.IS_REACT_ACT_ENVIRONMENT = false;
  // The stream never ends: hand processStream a reader that stalls after the partial lines.
  const encoder = new TextEncoder();
  const chunks = LINES.map((l) => l + "\n");
  let i = 0;
  const response = { body: { getReader: () => ({ read: async () => { await new Promise((r) => setTimeout(r, 0)); if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) }; await new Promise(() => {}); return { done: true, value: undefined }; }, releaseLock() {} }) }, headers: new Headers() } as unknown as Response;
  void processStream({ requestId, conversationId: CONVERSATION, response, submitAt: 0, conversationIdAt: null, dispatch: store.dispatch as never, getState: store.getState as never, abortController: new AbortController() });
  for (let k = 0; k < 60 && i < chunks.length; k++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 1500));
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const text = host.textContent ?? "";
  const card = host.querySelector('[data-kind="applet_build_result"]');
  const writing = host.querySelector("[data-applet-build-writing]");
  await act(async () => root.unmount());
  host.remove();
  expect(i).toBe(chunks.length);
  expect(card).not.toBeNull();
  expect(writing).not.toBeNull();
  // The reader sees the page in her words; source filenames stay behind
  // “Show the code” once the build completes.
  expect(text).toContain("main screen");
  expect(text).not.toContain("App.tsx");
  expect(text).not.toContain("Initializing Matrx");
});
