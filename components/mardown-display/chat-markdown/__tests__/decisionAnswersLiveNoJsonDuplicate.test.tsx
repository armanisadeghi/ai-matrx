/**
 * FORCING FUNCTION: a live VERBALIZED decision (any TEXT model, never
 * `jev-*`) renders ONE Answers card, not the card plus the raw structured-
 * output JSON it was parsed from.
 *
 * THE DEFECT THIS CATCHES. `finalize_verbalized_decision`
 * (aidream `matrx_ai/decisions/translate.py`) binds a text model to a
 * response schema that forces its ENTIRE reply to be JSON, then — at
 * PERSIST time only — replaces the assistant message's content with one
 * `decision_answers` part. So a RELOAD shows just the Answers card. But
 * live, the model's raw JSON reply streams in as an ordinary `text` render
 * block before the server can finalize it, and the `decision_answers` data
 * event (process-stream.ts:1534) lands as its own block on the SAME turn —
 * so both rendered, and the answer appeared twice, live and reloaded
 * disagreeing about the same turn.
 *
 * THE FIX: `verbalizedDecisionJsonTextBlockIds`
 * (active-requests.selectors.ts) is a STRUCTURAL predicate, not a special
 * case for this one agent: when a turn carries a `decision_answers` block,
 * any sibling `text` block whose content is JSON-only (via `isJsonOnlyText`)
 * is dropped live, in `EnhancedChatMarkdown`'s render-block filters. A plain
 * text turn that happens to answer in JSON prose (no `decision_answers`
 * block present) is left untouched.
 *
 * This test reuses the REAL captured `decision_answers` event
 * (fixtures/decision-answers-live-event.json, off the wire 2026-09-22) and
 * adds a synthetic JSON text render block ahead of it — exactly the shape
 * `process-stream.ts` builds for streamed text — then asserts the DOM shows
 * exactly one Answers card and none of the raw JSON.
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

const REQ = "req_live_verbalized_decision";
const CONV = "conv_live_verbalized_decision";

const store = configureStore({
  reducer: { activeRequests: activeRequestsReducer },
  middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
});

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
// the registry is stubbed so this test is about the filter + one renderer.
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

/** A marker string that only ever appears inside the raw JSON text chunk —
 * never inside the rendered `DecisionAnswers` card — so its presence in the
 * DOM unambiguously means the JSON leaked through as a second, raw render. */
const RAW_JSON_MARKER = "__raw_verbalized_reply_marker__";

/**
 * Exactly what `process-stream.ts` dispatches for a verbalized decision run:
 * a `text` render block carrying the model's raw structured-output JSON
 * reply (streamed in first, the "text_delta" path), immediately followed by
 * the same `decision_answers` data event a native (`jev-*`) decision sends —
 * `finalize_verbalized_decision` makes the two turns indistinguishable
 * downstream except for `method`.
 */
function streamAVerbalizedDecision() {
  const payload = {
    ...(capturedEvent as { data: Record<string, unknown> }).data,
    model: "gpt-5",
    method: "verbalized",
  };
  const textBlockId = "text_0";
  const decisionBlockId = "decision_answers_1";

  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  // The model's raw structured-output reply, streamed as ordinary text —
  // the exact shape `verbalized_response_schema` forces out of a text model
  // (aidream `matrx_ai/decisions/translate.py`).
  // Deliberately NOT paired with a text_start/text_end timeline entry — the
  // unified-slot builder's fallback (timeline produced no slots, but blocks
  // exist) then emits every render block in arrival order, exactly like the
  // sibling `decisionAnswersRendersLive.test.tsx` fixture-replay test. This
  // is the same code path a real stream drives; only the plumbing to get
  // there is simplified.
  store.dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId: textBlockId,
        blockIndex: 0,
        type: "text",
        status: "complete",
        content: JSON.stringify({
          [RAW_JSON_MARKER]: true,
          owning_surface: "frontend",
          urgency: 3.18,
        }),
        data: null,
      },
    }) as never,
  );

  // The server's decision_answers data event, parsed from that same JSON.
  store.dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId: decisionBlockId,
        blockIndex: 1,
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
        seq: 1,
        timestamp: 1,
        data: payload,
        blockId: decisionBlockId,
      },
    }) as never,
  );
}

describe("a live verbalized decision never shows its raw JSON twice", () => {
  it("renders exactly one Answers card and no raw structured-output JSON", async () => {
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

    streamAVerbalizedDecision();

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

    // The answer is on screen …
    expect(text).toContain("owning_surface");
    expect(text).toContain("frontend");

    // … exactly once, as the typed card — never a second time as raw JSON.
    const answersHeadingCount = (text.match(/Answers/g) ?? []).length;
    expect(answersHeadingCount).toBe(1);
    expect(text).not.toContain(RAW_JSON_MARKER);
    expect(text).not.toContain("{");

    await act(async () => {
      root.unmount();
    });
  });
});
