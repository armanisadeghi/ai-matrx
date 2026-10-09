/** @jest-environment jsdom */
/**
 * THE BUILDER'S CONVERSATION PANEL ON A RELOAD: the host chunk is still loading when the saved
 * messages draw. Mounts AgentConversationDisplay over a hydrated build conversation (the way
 * loadConversation leaves the store) with the lazy rich-content host pending, then lets it land.
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
    read(joinPath(__dirname, "../../content-ir/__tests__/fixtures/applet-build-result.emitted-json-schema.json"), "utf8"),
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
const LINES = readFileSync(join(__dirname, "../../content-ir/__tests__/fixtures/applet-build-stream.ndjson"), "utf8")
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

import { AgentConversationDisplay } from "@ai-matrx/chat/agents/components/messages-display/AgentConversationDisplay";

// The chat package's own `app` defaults are what a page holds before the app host chunk lands. They are not a
// public export (nothing in the app needs them), so this test-only reproduction reads the installed file directly.
const { CHAT_RICH_CONTENT_APP_DEFAULTS } = require(require("node:path").join(process.cwd(), "node_modules/@ai-matrx/chat/dist/ui/markdown-stream/rich-content-defaults.js")) as { CHAT_RICH_CONTENT_APP_DEFAULTS: Record<string, unknown> };
import { configureRichContent } from "@ai-matrx/rich-content/host";

const RELOAD_KEY = Symbol.for("ai-matrx.rich-content.host.loader");

describe("the build's conversation on a reload (host chunk still loading)", () => {
  it("draws the answer's card, never raw markdown, throws no hook-order or provider error", async () => {
    const errors: string[] = [];
    let phase = "pending";
    const spy = jest.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errors.push(`[${phase}] ` + a.map(String).join(" ").slice(0, 3000));
    });
    // The app host is a lazy chunk: pending while the first messages draw, as on a cold reload.
    let release!: () => void;
    const state = { promise: new Promise<void>((r) => (release = r)), settled: false };
    const g = globalThis as unknown as Record<symbol, unknown>;
    const previous = g[RELOAD_KEY];
    g[RELOAD_KEY] = state;
    // Before the app host lands the page holds only the chat package's own defaults for `app`.
    const HOST_KEY = Symbol.for("ai-matrx.rich-content.host");
    const hostStore = g[HOST_KEY] as { host: Record<string, unknown> };
    // Touch the lazy `app` proxy once so the app bindings register themselves for real, then keep that host.
    void (hostStore.host.app as Record<string, unknown>).KindInstanceRender;
    const fullHost = { ...hostStore.host };
    hostStore.host = { app: CHAT_RICH_CONTENT_APP_DEFAULTS };

    const store = makeStore();
    store.dispatch(createInstance({ conversationId: "conv-reload", agentId: "applets-build", agentType: "user", origin: "manual", status: "ready" } as never));
    store.dispatch(
      hydrateMessages({
        conversationId: "conv-reload",
        messages: [
          { id: "m-user", conversationId: "conv-reload", agentId: null, role: "user", content: [{ type: "text", text: "A list of my favourite movies" }], contentHistory: null, userContent: null, position: 0, source: "user", status: "active", isVisibleToModel: true, isVisibleToUser: true, metadata: {}, createdAt: "2026-10-07T21:15:30.000Z", deletedAt: null } as MessageRecord,
          { id: "m-asst", conversationId: "conv-reload", agentId: null, role: "assistant", content: [{ type: "thinking", text: "" }, { type: "text", text: ANSWER }], contentHistory: null, userContent: null, position: 1, source: "assistant", status: "active", isVisibleToModel: true, isVisibleToUser: true, metadata: {}, createdAt: "2026-10-07T21:15:35.000Z", deletedAt: null } as MessageRecord,
        ],
      }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Host store={store}>
          <AgentConversationDisplay conversationId="conv-reload" surfaceKey="applet-builder" compact bottomPinned />
        </Host>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    phase = "landed";
    state.settled = true;
    configureRichContent(fullHost as never);
    release();
    await act(async () => {
      await settled(host);
    });
    const seen = verdict(host);
    await act(async () => root.unmount());
    host.remove();
    g[RELOAD_KEY] = previous;
    spy.mockRestore();

    const bad = errors.filter((e) => /ContentIrRenderProvider|Minified React error #31[01]|Rendered (more|fewer) hooks|could not be displayed/.test(e));
    expect(bad).toEqual([]);
    expect(seen.problems).toBe(false);
    expect(seen.card).toBe(true);
    expect(seen.text).toContain("Favourite Movies");
    expect(seen.text).not.toContain("import React");
  });
});
