/**
 * A VARIABLES-ONLY FIRST TURN IS NOT AN EMPTY TURN — a forcing function.
 *
 * Found live 2026-09-25 (admin@admin.com, the kits "Run it once" button →
 * agent run window): the launcher wires the kit's example values as named
 * variables and the person types nothing — exactly the shape THE USER-INPUT
 * LAW asks for. The values are HOST-wired, so the bubble correctly refuses to
 * print them as her words, and with nothing else left it claimed
 * "This message has no displayable text." — a dead state, and untrue: the
 * turn carried the inputs the agent ran on.
 *
 * The instance-variable state is built by the REAL reducer from the REAL
 * actions the launcher (`setHostVariableValues`) and the submit thunk
 * (`stampSubmittedFirstTurnValues`) dispatch; the component is the real
 * `AgentUserMessage`. Only the store hook is bound to that state.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import variablesReducer, {
  createInstanceFullPayloadForTest,
} from "./host-wired-values.harness";
import {
  setHostVariableValues,
  stampSubmittedFirstTurnValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
// jest.mock calls below are hoisted above these imports by babel-jest.
import { AgentUserMessage } from "../AgentUserMessage";
import { TranscriptAudienceProvider } from "@/features/agents/components/shared/transcript-audience";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "conv-launch-only";
const MESSAGE = "msg-1";
const KIT_VALUES = {
  prompt_purpose:
    "An agent that reads a customer's complaint email and drafts a calm reply.",
};

let mockState: Record<string, unknown> = {};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => mockState }),
}));
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock("../UserActionBar", () => ({ UserActionBar: () => null }));
jest.mock("../../MessageAttachmentStrip", () => ({
  MessageAttachmentStrip: () => null,
}));
jest.mock(
  "@/features/agents/components/context-policies-display/ContextPolicyChipStrip",
  () => ({ ContextPolicyChipStrip: () => null }),
);
jest.mock("@/features/scopes/hooks/useEntityTitles", () => ({
  useEntityTitles: () => ({ titleFor: () => undefined }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));

function buildState(): Record<string, unknown> {
  let variables = variablesReducer(
    undefined,
    createInstanceFullPayloadForTest(CONVERSATION),
  );
  variables = variablesReducer(
    variables,
    setHostVariableValues({ conversationId: CONVERSATION, values: KIT_VALUES }),
  );
  variables = variablesReducer(
    variables,
    stampSubmittedFirstTurnValues({
      conversationId: CONVERSATION,
      values: KIT_VALUES,
      hostValueNames: Object.keys(KIT_VALUES),
    }),
  );
  return {
    instanceVariableValues: variables,
    conversations: { byConversationId: {} },
    messages: {
      byConversationId: {
        [CONVERSATION]: {
          orderedIds: [MESSAGE],
          hasMoreOlder: false,
          byId: {
            [MESSAGE]: {
              id: MESSAGE,
              role: "user",
              position: 0,
              content: [],
              userContent: null,
              metadata: {},
            },
          },
        },
      },
    },
    userAuth: { adminLevel: null },
  };
}

function render(audience: "builder" | "expert"): {
  host: HTMLDivElement;
  root: Root;
} {
  mockState = buildState();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <TranscriptAudienceProvider audience={audience}>
        <AgentUserMessage conversationId={CONVERSATION} messageId={MESSAGE} />
      </TranscriptAudienceProvider>,
    ),
  );
  return { host, root };
}

describe("a first turn that carried only host-wired inputs", () => {
  it("names what the run started with — never 'no displayable text'", () => {
    const { host, root } = render("builder");
    try {
      expect(host.textContent).not.toContain("no displayable text");
      const row = host.querySelector(
        '[data-testid="user-message-launch-inputs"]',
      );
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("Started with:");
      expect(row?.textContent).toContain("Prompt Purpose");
      // The values are one click away, never printed as the body.
      expect(row?.textContent).not.toContain("complaint email");
      const toggle = row?.querySelector("button") as HTMLButtonElement;
      act(() => toggle.click());
      expect(row?.textContent).toContain(KIT_VALUES.prompt_purpose);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it("on an Expert transcript the bubble is absent, not a false 'empty'", () => {
    const { host, root } = render("expert");
    try {
      expect(host.textContent).not.toContain("no displayable text");
      expect(
        host.querySelector('[data-testid="user-message-launch-inputs"]'),
      ).toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
