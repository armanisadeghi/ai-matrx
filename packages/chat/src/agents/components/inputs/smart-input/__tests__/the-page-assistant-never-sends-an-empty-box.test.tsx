/**
 * THE PAGE ASSISTANT NEVER SENDS AN EMPTY BOX.
 *
 * Break this catches (2026-10-03, conversation d6c14d03): on /notes the page
 * assistant's dock rose under a cursor resting at the bottom of the page, its
 * Send arrow was live on an empty box, and one click sent a first turn with no
 * message — an empty user row and "Anthropic rejected the request: messages:
 * at least one message is required". The person's typed message was in a
 * different composer (the Chat window) and never left it.
 *
 * SUT: SmartAgentInput's send gate. The composer reads the REAL
 * `selectHasUserInput` against a store shaped like the live one; the two
 * layout children are stand-ins that record the `disableSend` they were given.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

const given: Array<{ layout: string; disableSend: boolean | undefined }> = [];
jest.mock("../SmartAgentInputSingleRow", () => ({
  SmartAgentInputSingleRow: ({ disableSend }: { disableSend?: boolean }) => {
    given.push({ layout: "single-row", disableSend });
    return null;
  },
}));
jest.mock("../SmartAgentInputStacked", () => ({
  SmartAgentInputStacked: ({ disableSend }: { disableSend?: boolean }) => {
    given.push({ layout: "stacked", disableSend });
    return null;
  },
}));
jest.mock("../InboxQueueStrip", () => ({ InboxQueueStrip: () => null }));
jest.mock("../ViewOnlyComposerBar", () => ({ ViewOnlyComposerBar: () => null }));
jest.mock("@host/components/official/composer/useTouchOnlyDevice", () => ({
  useTouchOnlyDevice: () => false,
}));
jest.mock("../../../../redux/execution-system/conversations/conversations.selectors", () => ({
  selectViewerCanReply: () => () => true,
}));

const CONVERSATION = "d6c14d03-1bda-46ab-8ff9-34f08bb08634";
let state: Record<string, unknown> = {};
jest.mock("../../../../../store/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
}));
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../../store/hooks"));

import { SmartAgentInput } from "../SmartAgentInput";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function shape(text: string, resources: Record<string, unknown> = {}) {
  state = {
    instanceUserInput: { byConversationId: { [CONVERSATION]: { text, messageParts: [] } } },
    instanceResources: { byConversationId: { [CONVERSATION]: resources } },
    instanceUIState: { byConversationId: {} },
  };
}

function render(props: Partial<React.ComponentProps<typeof SmartAgentInput>>) {
  given.length = 0;
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<SmartAgentInput conversationId={CONVERSATION} {...props} />));
  act(() => root.unmount());
  return given.at(-1);
}

const LAUNCHER = { composer: { size: "launcher", mode: "chat" } } as const;

describe("the page launcher", () => {
  it("holds Send while its box is empty", () => {
    shape("   ");
    expect(render(LAUNCHER)?.disableSend).toBe(true);
  });

  it("sends once the person has typed something", () => {
    shape("What is the payment plan for this crown?");
    expect(render(LAUNCHER)?.disableSend).toBe(false);
  });

  it("sends an attachment with no words", () => {
    shape("", { "e3734a59-908f-466c-ac08-48e681ac6b8b": { status: "ready" } });
    expect(render(LAUNCHER)?.disableSend).toBe(false);
  });
});

it("leaves every other composer's Send to its host (an agent may run on its own messages)", () => {
  shape("");
  expect(render({})?.disableSend).toBe(false);
});
