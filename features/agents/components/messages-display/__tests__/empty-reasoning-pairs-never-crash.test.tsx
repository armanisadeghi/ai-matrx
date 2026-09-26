/** @jest-environment jsdom */
/**
 * REGRESSION GUARD: a stream full of EMPTY reasoning brackets never crashes the
 * transcript.
 *
 * WHAT ARMAN SAW (2026-09-26, Model Battle /agents/battle/model). The Grok
 * column died with React "Maximum update depth exceeded" after the server sent
 * 119 token-less `reasoning` started/stopped pairs (an aidream bug, fixed in
 * 7192e45a03). Any provider — or a future server bug — can send that shape, so
 * the client must render it: the column finishes with its Answers card.
 *
 * The stream is the REAL captured pre-fix Grok NDJSON, replayed through the
 * REAL process-stream thunk into the REAL root reducer, while the REAL battle
 * column (BoundColumn → AgentConversationColumn with the Creator panel open →
 * AgentAssistantMessage → EnhancedChatMarkdown → DecisionAnswersBlock) is
 * mounted and subscribed. One event per read (slow provider) and one read
 * (fast provider); a synthetic 200-pair stream covers "more than any capture".
 *
 * HONEST SCOPE: this seat did NOT reproduce the crash before the reducer
 * coalescing landed (it was green on the pre-fix reducer too, as was a live
 * localhost replay). It is the end-to-end witness that the column renders the
 * shape to its Answers card with no update-depth error; the failing-then-
 * passing guard for the coalescing is
 * redux/execution-system/active-requests/__tests__/empty-reasoning-pairs-coalesce.test.ts.
 */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { addOptimisticUserMessage } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { createRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { processStream } from "@/features/agents/redux/execution-system/thunks/process-stream";
import { BoundColumn } from "@/features/agent-comparison/shared/BoundColumn";
import { setShowCreatorPanel } from "@/lib/redux/preferences/creatorDebugSlice";

jest.mock("@/features/agents/components/inputs/smart-input/SmartAgentInput", () => ({
  SmartAgentInput: () => null,
}));
import { TooltipProvider } from "@/components/ui/tooltip";
// The app root's one Alchemy action registry (AlchemyHost, ALC-15): the
// assistant turn's rich-document action bar reads it.
import { AlchemyActionsTestHost } from "@/test-utils/alchemy-actions-host";

// The user bubble's variable chips need the associations store; this test is
// about the assistant turn, so that one leaf is stubbed.
jest.mock("../user/FirstTurnVariables", () => ({
  UserMessageVariables: () => null,
  FirstTurnVariables: () => null,
  FirstTurnLaunchInputs: () => null,
}));
// next/dynamic never resolves under jest; load the block renderer eagerly so
// the REAL DecisionAnswersBlock draws.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes("block-registry/BlockRenderer")) {
      const { BlockRenderer } = jest.requireActual(
        "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer",
      ) as { BlockRenderer: React.ComponentType<Record<string, unknown>> };
      const Dynamic = (props: Record<string, unknown>) =>
        React.createElement(BlockRenderer, props);
      return Dynamic;
    }
    if (String(loader).includes("CreatorRunPanel")) {
      const { CreatorRunPanel } = jest.requireActual(
        "@/features/agents/components/run-controls/CreatorRunPanel",
      ) as { CreatorRunPanel: React.ComponentType<Record<string, unknown>> };
      const Dynamic = (props: Record<string, unknown>) =>
        React.createElement(CreatorRunPanel, props);
      return Dynamic;
    }
    if (String(loader).includes("MarkdownStreamImpl")) {
      const Impl = (
        jest.requireActual("@/components/MarkdownStreamImpl") as {
          default: React.ComponentType<Record<string, unknown>>;
        }
      ).default;
      const Dynamic = (props: Record<string, unknown>) =>
        React.createElement(Impl, props);
      return Dynamic;
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

const FIXTURE = join(
  __dirname,
  "../../../redux/execution-system/thunks/__tests__/fixtures/decision-stream-grok.ndjson",
);

function loadGrokLines(): string[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

/** The Grok capture with its reasoning brackets replaced by `pairs` empty pairs. */
function withEmptyPairs(lines: string[], pairs: number): string[] {
  const firstReasoning = lines.findIndex((l) => l.includes('"event":"reasoning"'));
  const rest = lines.filter((l) => !l.includes('"event":"reasoning"'));
  const bracket: string[] = [];
  for (let i = 0; i < pairs; i++) {
    bracket.push('{"event":"reasoning","data":{"state":"started"}}');
    bracket.push('{"event":"reasoning","data":{"state":"stopped"}}');
  }
  return [
    ...rest.slice(0, firstReasoning),
    ...bracket,
    ...rest.slice(firstReasoning),
  ];
}

function response(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          // Yield a macrotask between reads so React commits between events —
          // a slow provider, not a synchronous loop.
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
    middleware: (gDM) =>
      gDM({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }),
  });
}

async function replay(lines: string[], burst: boolean) {
  const conversationId = JSON.parse(
    lines.find((l) => l.includes('"conversation_id"'))!,
  ).data.conversation_id as string;
  const requestId = `req_${burst ? "burst" : "slow"}`;
  const store = makeStore();
  store.dispatch(
    createInstance({
      conversationId,
      agentId: "agent-feedback-triage",
      agentType: "user",
      origin: "manual",
      status: "running",
    } as never),
  );
  store.dispatch(
    addOptimisticUserMessage({
      conversationId,
      clientTempId: "user-temp-1",
      content: [
        {
          type: "text",
          text: "The Save as button on the battle page does nothing.",
        },
      ] as never,
      position: 0,
    }),
  );
  store.dispatch(createRequest({ requestId, conversationId }));
  store.dispatch(setShowCreatorPanel(true));

  const errors: unknown[] = [];
  const consoleError = jest
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

  const host = document.createElement("div");
  document.body.append(host);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(host, {
      onUncaughtError: (e) => errors.push(e),
      onCaughtError: (e) => errors.push(e),
    });
    root.render(
      <Provider store={store}>
        <AlchemyActionsTestHost>
          <TooltipProvider>
            <BoundColumn
              conversationId={conversationId}
              surfaceKey="agent-comparison-model"
              hideInput
            />
          </TooltipProvider>
        </AlchemyActionsTestHost>
      </Provider>,
    );
  });

  const chunks = burst
    ? [lines.join("\n") + "\n"]
    : lines.map((line) => line + "\n");
  // Stream OUTSIDE act(): React schedules and commits the way a browser does,
  // so the test sees the real render cadence rather than act's batching.
  globals.IS_REACT_ACT_ENVIRONMENT = false;
  {
    await processStream({
      requestId,
      conversationId,
      response: response(chunks),
      submitAt: 0,
      conversationIdAt: null,
      dispatch: store.dispatch as never,
      getState: store.getState as never,
      abortController: new AbortController(),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  globals.IS_REACT_ACT_ENVIRONMENT = true;

  const text = host.textContent ?? "";
  await act(async () => root?.unmount());
  host.remove();
  consoleError.mockRestore();
  return { text, errors };
}

function depthErrors(errors: unknown[]): string[] {
  return errors
    .map((e) => (e instanceof Error ? e.message : JSON.stringify(e, (_k, v) => (v instanceof Error ? v.message : v))))
    .filter((m) => /Maximum update depth|getSnapshot should be cached/.test(m ?? ""));
}

beforeAll(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: RO,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: RO,
  });
  Element.prototype.scrollIntoView = () => {};
});

const CASES: Array<[string, () => string[], boolean]> = [
  ["captured Grok stream (119 empty pairs), one event per read", loadGrokLines, false],
  ["captured Grok stream (119 empty pairs), one read", loadGrokLines, true],
  ["200 empty pairs, one event per read", () => withEmptyPairs(loadGrokLines(), 200), false],
  ["200 empty pairs, one read", () => withEmptyPairs(loadGrokLines(), 200), true],
];

describe("a stream of empty reasoning brackets", () => {
  it.each(CASES)("renders without an update-depth crash — %s", async (_label, lines, burst) => {
    const { text, errors } = await replay(lines(), burst);
    expect(depthErrors(errors)).toEqual([]);
    // No section of the turn fell to its error boundary (a crash inside the
    // answer is a crash, whatever message it carries).
    expect(text).not.toContain("This section could not be displayed");
    // The column finishes with its Answers card: the holder that answered.
    expect(text).toContain("grok-4.7");
  }, 60_000);
});
