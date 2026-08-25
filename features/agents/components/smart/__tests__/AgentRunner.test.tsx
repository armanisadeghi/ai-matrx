import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({
    selectAutoRun: () => () => false,
    selectAllowChat: () => () => true,
    selectNeedsPreExecutionInput: () => () => false,
    selectShouldShowInput: () => () => true,
    selectShowVariablePanel: () => () => false,
    selectInstanceDisplayTitle: () => () => "Test agent",
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({ selectInstanceStatus: () => () => "paused" }),
);

jest.mock(
  "@/features/agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({ selectIsExecuting: () => () => false }),
);

jest.mock(
  "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors",
  () => ({ selectHasUserInput: () => () => true }),
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/execute-instance.thunk",
  () => ({ executeInstance: jest.fn() }),
);

jest.mock("../../inputs/smart-input/SmartAgentInput", () => ({
  SmartAgentInput: () => <div data-testid="smart-input" />,
}));

jest.mock("../../inputs/PreExecutionAgentInput", () => ({
  PreExecutionAgentInput: () => <div data-testid="pre-execution" />,
}));

jest.mock("../../messages-display/AgentConversationDisplay", () => ({
  AgentConversationDisplay: () => <div data-testid="conversation" />,
}));

jest.mock(
  "@/features/matrx-envelope/components/ProposedDirectivesZone",
  () => ({
    ProposedDirectivesZone: () => <div data-testid="directives" />,
  }),
);

jest.mock("@/features/agents/ui-first-tools/ui/PendingAsksZone", () => ({
  PendingAsksZone: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="pending-asks">{conversationId}</div>
  ),
}));

import { AgentRunner } from "../AgentRunner";

describe("AgentRunner UI-first actions", () => {
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
    jest.clearAllMocks();
  });

  it("renders the canonical pending-ask zone beside the flexible-panel input", () => {
    act(() => {
      root.render(<AgentRunner conversationId="conversation-1" />);
    });

    expect(
      container.querySelector('[data-testid="pending-asks"]')?.textContent,
    ).toBe("conversation-1");
    expect(
      container.querySelector('[data-testid="smart-input"]'),
    ).not.toBeNull();
  });
});
