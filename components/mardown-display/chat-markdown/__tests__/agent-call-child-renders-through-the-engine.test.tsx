/** @jest-environment jsdom */
/**
 * A CHILD AGENT'S LIVE TEXT RENDERS THROUGH THE ENGINE, NOT A RE-SPLIT STRING
 * (KIND_NEVER_RAW_CHECKLIST T3, Arman 2026-09-30: a kind is never drawn as raw
 * JSON).
 *
 * A collaboration `agent_call` child streams on the PARENT's wire. Its blocks
 * sit in the parent request between its `sub_agent` operation's anchor and
 * end; `selectUnifiedSlots` hides them from the transcript (D209) so the
 * owning card can draw them. The card used to draw the joined TEXT as plain
 * `content`, so a one-line ```json kind mid-stream was never parsed by the
 * stream's own kind route. Now `MarkdownStream`/`EnhancedChatMarkdown` take
 * `agentCallId` and render exactly that child's render blocks through the
 * normal BlockRenderer path (`selectAgentCallChildSlots`).
 *
 * Drives the REAL slice and the REAL accumulator character by character.
 * RED BEFORE GREEN: before the fix `agentCallId` was ignored — the parent's
 * own text rendered and the child's kind never did.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertRenderBlock,
  upsertToolLifecycle,
  trackOperationInit,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  selectAgentCallChildSlots,
  selectUnifiedSlots,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/chat",
}));

const REQ = "req_collab_child";
const CONV = "conv_collab_child";
const CALL = "toolu_tutor_child";

const store = configureStore({
  reducer: { activeRequests: activeRequestsReducer },
  middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
});

const state = () => ({
  ...(store.getState() as Record<string, unknown>),
  conversations: { byConversationId: {} },
  instanceUIState: { byConversationId: {} },
  messages: { byId: {}, byConversationId: {} },
  userAuth: { adminLaneOpen: false, isAdmin: false },
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state()),
  useAppDispatch: () => () => undefined,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes("MarkdownCoreImpl")) {
      return jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl").default;
    }
    if (String(loader).includes("block-registry/BlockRenderer")) {
      const {
        BlockRenderer,
      } = require("@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer") as {
        BlockRenderer: React.ComponentType<Record<string, unknown>>;
      };
      const Dynamic = (props: unknown) =>
        React.createElement(BlockRenderer, props as Record<string, unknown>);
      return Dynamic;
    }
    return () => null;
  },
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));
// Prose is real; every other registry component is a named stub. Kinds reach
// their component through the content-ir route, not this registry.
jest.mock(
  "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockComponentRegistry",
  () => {
    const stub = (name: string) => {
      const Component = (props: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-stub": name }, props.children);
      Component.displayName = name;
      return Component;
    };
    const proxy = new Proxy(
      {
        // Real prose, so a parent text block that leaks in is visible.
        BasicMarkdownContent: require("@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent").default,
      },
      {
        get: (target, prop) =>
          typeof prop === "string"
            ? ((target as Record<string, unknown>)[prop] ?? stub(prop))
            : undefined,
      },
    );
    return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy, registerBlockComponents: () => undefined, registerLoadingComponents: () => undefined };
  },
);
// A raw JSON card must be VISIBLE to this test, so the code card draws its code.
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", () => ({
  CodeBlockWithContextAttach: ({ code }: { code: string }) => (
    <pre data-code-block="">{code}</pre>
  ),
}));
jest.mock("@ai-matrx/rich-content/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre data-code-block="">{code}</pre>,
}));
jest.mock("../FullScreenMarkdownEditor", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/internal-handlers/ToolHandlers", () => ({
  InlineToolCard: () => null,
  DbToolCard: () => null,
  InlineToolBatch: () => null,
  DbToolBatch: () => null,
}));
jest.mock("@ai-matrx/rich-content/display/chat-markdown/internal-handlers/InlineStatusIndicator", () => ({
  InlineStatusIndicator: () => null,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/internal-handlers/InlineThinkingSlot", () => ({
  InlineThinkingSlot: () => null,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/internal-handlers/InlineAssistantError", () => ({
  InlineAssistantError: () => null,
}));

import { EnhancedChatMarkdownInternal } from "@ai-matrx/chat/ui/markdown-stream/EnhancedChatMarkdown";

const KIND_ONE_LINE = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [
    { __kind: "flashcard", front: "Mitochondria", back: "Makes ATP for the cell." },
    { __kind: "flashcard", front: "Ribosome", back: "Builds proteins from RNA." },
  ],
});
const CHILD_TEXT = `Here you go:\n\n\`\`\`json\n${KIND_ONE_LINE}`;

let accumulator: StreamBlockAccumulator;
let streamed = 0;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  store.dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId: "parent_text",
        blockIndex: 0,
        type: "text",
        status: "complete",
        content: "Let me ask the tutor for flashcards.",
        data: null,
      },
    } as never),
  );
  store.dispatch(
    upsertToolLifecycle({
      requestId: REQ,
      callId: CALL,
      toolName: "agent_call",
      status: "started",
      arguments: { history_mode: "snapshot" },
    } as never),
  );
  store.dispatch(
    trackOperationInit({
      requestId: REQ,
      operationId: "op_child",
      operation: "sub_agent",
      metadata: { label: "Tutor" },
      timestamp: 2,
    } as never),
  );
  accumulator = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload as never),
  );
});

/** Stream the child's text up to `upTo` characters (no finalize: live). */
function streamTo(upTo: number) {
  const dispatch = store.dispatch as unknown as (a: unknown) => unknown;
  for (; streamed < upTo; streamed++) {
    accumulator.ingest(CHILD_TEXT[streamed], dispatch as never);
  }
}

async function renderChild(agentCallId?: string) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EnhancedChatMarkdownInternal
        content=""
        requestId={REQ}
        conversationId={CONV}
        agentCallId={agentCallId}
        isStreamActive
        hideCopyButton
      />,
    );
  });
  const html = host.innerHTML;
  const text = host.textContent ?? "";
  const rawCards = host.querySelectorAll("pre[data-code-block]").length;
  const kindRegions = host.querySelectorAll('[data-block-type="code"][data-language="json"]').length;
  host.querySelectorAll("style").forEach((el) => el.remove());
  await act(async () => root.unmount());
  return { html, text, rawCards, kindRegions };
}

describe("a collaboration child's live blocks render through the engine", () => {
  it("the child-slot selector returns exactly the child's blocks; the transcript still drops them", () => {
    streamTo(CHILD_TEXT.length - 20);
    const s = state() as never;
    const child = selectAgentCallChildSlots(REQ, CALL)(s);
    expect(child.length).toBeGreaterThan(0);
    const childIds = child.flatMap((slot) =>
      slot.kind === "render_block" ? [slot.blockId] : [],
    );
    expect(childIds.length).toBe(child.length);
    expect(childIds).not.toContain("parent_text");
    const transcript = selectUnifiedSlots(REQ)(s).flatMap((slot) =>
      slot.kind === "render_block" ? [slot.blockId] : [],
    );
    for (const id of childIds) expect(transcript).not.toContain(id);
  });

  it.each([0.35, 0.6, 0.9])(
    "mid-stream at %p of the payload the child shows its kind, never raw JSON",
    async (fraction) => {
      const head = CHILD_TEXT.indexOf("{");
      streamTo(Math.max(streamed, head + Math.floor(KIND_ONE_LINE.length * fraction)));
      const { html, text, rawCards, kindRegions } = await renderChild(CALL);
      // Only the child's blocks — never the parent's own text.
      expect(text).toContain("Here you go");
      expect(text).not.toContain("Let me ask the tutor");
      // The child's json region is drawn by the kind route (the flashcards
      // component or its loader), never the raw JSON code card.
      expect(kindRegions).toBeGreaterThan(0);
      expect(rawCards).toBe(0);
      expect(text).not.toContain('{"');
      expect(html).not.toContain("__kind");
    },
  );
});
