import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockPhase = "complete";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: string) => {
    if (selector === "phase") return mockPhase;
    if (selector === "limit") return null;
    if (selector === "request") return null;
    return [];
  },
}));

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectConversationMessages: () => "messages",
    selectVisibleMessageGroupLimit: () => "limit",
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({
    selectStreamPhase: () => "phase",
    selectLatestRequestId: () => "request",
  }),
);

jest.mock("../display-groups", () => ({
  applyDisplayGroupWindow: (groups: unknown) => groups,
  buildDisplayEntries: () => [],
  groupDisplayEntries: () => [
    { kind: "user", key: "user-1", messageId: "message-1" },
  ],
}));

jest.mock("../user/AgentUserMessage", () => ({
  AgentUserMessage: () => <div>user message</div>,
}));

jest.mock("../user/CollabNoteMessage", () => ({
  CollabNoteMessage: () => null,
}));

jest.mock("../assistant/AssistantTurnGroup", () => ({
  AssistantTurnGroup: () => null,
}));

jest.mock("../assistant/AgentAssistantMessage", () => ({
  AgentAssistantMessage: () => null,
}));

jest.mock("../assistant/AgentEmptyMessageDisplay", () => ({
  AgentEmptyMessageDisplay: () => null,
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({
    suppressed,
    children,
  }: {
    suppressed?: boolean;
    children: React.ReactNode;
  }) => (
    <div data-testid="transcript-menu" data-suppressed={String(suppressed)}>
      {children}
    </div>
  ),
}));

jest.mock("@/features/context-menu-v3/utils/resolveMarkdownContext", () => ({
  resolveMarkdownContext: jest.fn(),
}));

jest.mock("@/features/war-room/utils/renderPathTrace", () => ({
  isWarRoomThreadAgentSurface: () => false,
  traceWarRoomRenderPath: jest.fn(),
}));

jest.mock("@/lib/error-boundary/ErrorBoundaryWithCapture", () => ({
  ErrorBoundaryWithCapture: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import { AgentConversationDisplay } from "../AgentConversationDisplay";

describe("AgentConversationDisplay streaming context menu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPhase(phase: string) {
    mockPhase = phase;
    act(() => {
      root.render(<AgentConversationDisplay conversationId="conversation-1" />);
    });
    return container.querySelector<HTMLElement>(
      "[data-testid='transcript-menu']",
    );
  }

  it.each([
    "connecting",
    "pre_token",
    "reasoning",
    "text_streaming",
    "interstitial",
    "error",
  ])("yields to the native browser menu during %s", (phase) => {
    expect(renderPhase(phase)?.dataset.suppressed).toBe("true");
  });

  it("restores the rich menu after the stream settles", () => {
    expect(renderPhase("complete")?.dataset.suppressed).toBe("false");
  });
});
