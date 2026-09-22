/**
 * FORCING FUNCTION: a decision turn is VISIBLE while it is running, not only
 * after a reload.
 *
 * THE DEFECT THIS CATCHES (live on www.aimatrx.com, 2026-09-22). A decision
 * agent writes no prose at all — its entire turn is one `decision_answers`
 * data event. The server emitted it correctly (captured off the wire into
 * `fixtures/decision-answers-live-event.json`), the stream client made a
 * render block of it, and the screen showed an EMPTY assistant turn for
 * minutes: no answers, no spinner, no error, over a run that had succeeded
 * and been charged. Reloading with `?conversationId=` drew it perfectly,
 * because the reload path goes through the persisted message parts.
 *
 * The break was three hand-maintained allowlists of "blocks whose content is
 * legitimately empty" — `SPECIAL_RENDER_BLOCK_TYPES`,
 * `MEDIA_RENDER_BLOCK_TYPES`, `DATA_CARD_RENDER_BLOCK_TYPES` — none of which
 * had ever heard of `decision_answers`. So this test drives the REAL slice
 * reducer with the REAL captured event and asserts PIXELS: the answers a
 * person can read. It fails on the pre-fix code (empty container).
 *
 * THE USE CASE: the `feedback.item_triage` decision agent reading a real
 * defect report about the battle page's Save-as button — the run that
 * produced this fixture.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertRenderBlock,
  appendTimeline,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { DECISION_ANSWERS_BLOCK_TYPE } from "@/features/content-ir/kinds/decision-answers";
import capturedEvent from "./fixtures/decision-answers-live-event.json";

const REQ = "req_live_decision";
const CONV = "conv_live_decision";

const store = configureStore({
  reducer: { activeRequests: activeRequestsReducer },
  middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
});

/**
 * The slices EnhancedChatMarkdown's selectors read. `activeRequests` is the
 * real reducer's output; the rest are the empty shapes their selectors expect.
 */
const state = () => ({
  ...(store.getState() as Record<string, unknown>),
  conversations: { byConversationId: {} },
  instanceUIState: { byConversationId: {} },
  messages: { byId: {}, byConversationId: {} },
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state()),
  useAppDispatch: () => () => undefined,
}));
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes("block-registry/BlockRenderer")) {
      const {
        BlockRenderer,
      } = require("../block-registry/BlockRenderer") as {
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
// The REAL DecisionAnswersBlock — that is the whole point. Everything else in
// the registry is stubbed so this test is about one renderer, not the app.
jest.mock(
  "@/components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry",
  () => {
    const DecisionAnswersBlock =
      require("@/components/mardown-display/blocks/decision-answers/DecisionAnswersBlock").default;
    const stub = (name: string) => {
      const Component = (props: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-stub": name }, props.children);
      Component.displayName = name;
      return Component;
    };
    const proxy = new Proxy(
      { DecisionAnswersBlock },
      {
        get: (target, prop) =>
          typeof prop === "string"
            ? ((target as Record<string, unknown>)[prop] ?? stub(prop))
            : undefined,
      },
    );
    return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
  },
);
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", () => ({
  CodeBlockWithContextAttach: () => null,
}));
jest.mock("../FullScreenMarkdownEditor", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../internal-handlers/ToolHandlers", () => ({
  InlineToolCard: () => null,
  DbToolCard: () => null,
  InlineToolBatch: () => null,
  DbToolBatch: () => null,
}));
jest.mock("../internal-handlers/InlineStatusIndicator", () => ({
  InlineStatusIndicator: () => null,
}));
jest.mock("../internal-handlers/InlineThinkingSlot", () => ({
  InlineThinkingSlot: () => null,
}));
jest.mock("../internal-handlers/InlineAssistantError", () => ({
  InlineAssistantError: () => null,
}));

import { EnhancedChatMarkdownInternal } from "../EnhancedChatMarkdown";

/** Exactly what process-stream.ts dispatches for this event (:1534). */
function streamTheCapturedDecision() {
  const payload = (capturedEvent as { data: Record<string, unknown> }).data;
  const blockId = "decision_answers_12";
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  store.dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId,
        blockIndex: 0,
        type: DECISION_ANSWERS_BLOCK_TYPE,
        status: "complete",
        content: null,
        data: { payload },
      },
    }) as never,
  );
  store.dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "data",
        seq: 0,
        timestamp: 1,
        data: payload,
        blockId,
      },
    }) as never,
  );
  return payload;
}

describe("a live decision turn renders its answers on screen", () => {
  it("draws the captured decision_answers event, with no text in the turn", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });

    streamTheCapturedDecision();

    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content=""
          requestId={REQ}
          conversationId={CONV}
          hideCopyButton
        />,
      );
    });

    const text = host.textContent ?? "";
    // The three real questions this run answered, and the holder that answered
    // them. An empty turn — the defect — fails every one of these.
    expect(text).toContain("owning_surface");
    expect(text).toContain("frontend");
    expect(text).toContain("urgency");
    expect(text).toContain("jev-1.13.0");

    await act(async () => {
      root.unmount();
    });
  });
});
