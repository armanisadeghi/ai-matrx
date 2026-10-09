import "@/__tests__/helpers/register-chat-host";
import "@/providers/chatUiRegistration";
/** @jest-environment jsdom */
/**
 * A KIND IS NEVER DRAWN AS RAW JSON — sub-agent call answers (T3 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * A child agent's final answer rode the generic key/value grid (plain
 * `agent_call`) or plain markdown (collaboration card): a kind the child
 * returned was printed as its JSON, and its text was a field in a grid. The
 * answer now goes through `AnswerValueView` — kind → its component, text →
 * `MarkdownStream` — and the collaboration card's live child text through
 * `MarkdownStream`, never the plain markdown renderer.
 *
 * RED BEFORE GREEN: before the fix the kind and text answers reached the
 * generic renderer / plain markdown.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";

let childStream: { status: string; text: string; label: string | null; childConversationId: string | null } | null = null;

jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppSelector: () => childStream,
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@/lib/redux/hooks", () => jest.requireMock("@ai-matrx/chat/store/hooks"));
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors",
  () => ({ selectAgentCallChildStream: () => () => childStream }),
);
jest.mock("@ai-matrx/chat/agents/hooks/useConversationTitle", () => ({
  useConversationTitle: () => null,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
jest.mock(
  "@/features/content-ir/studio/components/KindInstanceRender",
  () => ({
    __esModule: true,
    default: ({ kind }: { kind: string }) => (
      <div data-route="kind">Kind component: {kind}</div>
    ),
  }),
);
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: () => <div data-route="floor" />,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({
    content,
    requestId,
    agentCallId,
  }: {
    content?: string;
    requestId?: string;
    agentCallId?: string;
  }) => (
    <div
      data-route="markdown"
      data-request-id={requestId ?? ""}
      data-agent-call-id={agentCallId ?? ""}
    >
      {content}
    </div>
  ),
}));
jest.mock("@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent", () => ({
  BasicMarkdownContent: ({ content }: { content: string }) => (
    <pre data-route="plain-markdown">{content}</pre>
  ),
}));
jest.mock("@ai-matrx/chat/tool-call-visualization/registry/GenericRenderer", () => ({
  GenericRenderer: ({ entry }: { entry: ToolLifecycleEntry }) => (
    <pre data-route="generic">{JSON.stringify(entry.result)}</pre>
  ),
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));

import { AgentCallInline } from "@ai-matrx/chat/tool-call-visualization/renderers/agent-call/AgentCallInline";
import { CollabCallCard } from "@ai-matrx/chat/tool-call-visualization/renderers/agent-call/CollabCallCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const flashcards = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};

function entry(over: Partial<ToolLifecycleEntry>): ToolLifecycleEntry {
  return {
    callId: "c1",
    toolName: "agent_call",
    displayName: "agent_call",
    status: "completed",
    arguments: { agent_id: "a1" },
    startedAt: "2026-09-30T20:00:00Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  childStream = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const route = (name: string) => container.querySelector(`[data-route="${name}"]`);

describe("a plain agent_call", () => {
  it("draws a kind the child returned as its kind", () => {
    act(() =>
      root.render(
        <AgentCallInline
          entry={entry({ result: { agent_name: "Tutor", result: flashcards } })}
        />,
      ),
    );
    expect(route("kind")).not.toBeNull();
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("draws the child's text answer as markdown, not a grid field", () => {
    act(() =>
      root.render(
        <AgentCallInline
          entry={entry({ result: { agent_name: "Tutor", result: "Mitochondria make ATP." } })}
        />,
      ),
    );
    expect(route("markdown")?.textContent).toBe("Mitochondria make ATP.");
    expect(route("generic")).toBeNull();
  });

  it("keeps a kindless structured answer on the generic body", () => {
    act(() =>
      root.render(
        <AgentCallInline
          entry={entry({ result: { agent_name: "Counter", result: { rows: 3 } } })}
        />,
      ),
    );
    expect(route("generic")).not.toBeNull();
  });
});

describe("a running plain agent_call", () => {
  it("draws the child's live blocks through the engine by request + call", () => {
    childStream = {
      status: "running",
      text: "Drafting the cards",
      label: "Tutor",
      childConversationId: null,
    };
    act(() =>
      root.render(
        <AgentCallInline requestId="req-1" entry={entry({ status: "progress" })} />,
      ),
    );
    const live = route("markdown");
    expect(live?.getAttribute("data-agent-call-id")).toBe("c1");
    expect(route("generic")).toBeNull();
  });

  it("shows the generic progress body before the child has written anything", () => {
    childStream = null;
    act(() =>
      root.render(
        <AgentCallInline requestId="req-1" entry={entry({ status: "progress" })} />,
      ),
    );
    expect(route("generic")).not.toBeNull();
  });
});

describe("a collaboration agent_call", () => {
  const collab = { history_mode: "snapshot", agent_id: "a1" };

  it("draws the specialist's kind answer as its kind", () => {
    act(() =>
      root.render(
        <CollabCallCard
          entry={entry({
            arguments: collab,
            result: { agent_name: "Reviewer", result: flashcards },
          })}
        />,
      ),
    );
    expect(route("kind")).not.toBeNull();
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("streams the specialist's live text through MarkdownStream", () => {
    childStream = {
      status: "running",
      text: "Reading the thread",
      label: "Reviewer",
      childConversationId: null,
    };
    act(() =>
      root.render(
        <CollabCallCard
          requestId="req-1"
          entry={entry({ status: "progress", arguments: collab })}
        />,
      ),
    );
    // The child's own render blocks through the engine, by request + call —
    // never its joined text re-split as plain content.
    const live = route("markdown");
    expect(live?.getAttribute("data-request-id")).toBe("req-1");
    expect(live?.getAttribute("data-agent-call-id")).toBe("c1");
    expect(live?.textContent).toBe("");
    expect(route("plain-markdown")).toBeNull();
  });
});
