/**
 * Regression coverage for the Creator Panel Payload tab.
 *
 * The preview selector intentionally reconstructs the narrow RootState read by
 * `assembleRequest`. Every new assembly dependency must be included there or
 * the preview can crash even though execution (which receives the full store)
 * remains healthy.
 */

jest.mock("uuid", () => ({
  v4: () => "uuid-stub",
}));

import { makeSelectAssembledRequest } from "../aggregate.selectors";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import adminPreferencesReducer from "@/lib/redux/preferences/adminPreferencesSlice";
import type { DirectiveApplyPolicy } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";

const CONVERSATION_ID = "conversation-1";

function makeState(
  directiveApplyPolicy: DirectiveApplyPolicy = "default",
): RootState {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          agentId: "agent-1",
          agentType: "user",
          origin: "runner",
          status: "idle",
          sourceFeature: "agent-runner",
          isEphemeral: false,
          initialAgentVersionId: null,
        },
      },
      allConversationIds: [CONVERSATION_ID],
    },
    instanceUIState: { byConversationId: {} },
    instanceUserInput: {
      byConversationId: {
        [CONVERSATION_ID]: { text: "Preview this payload" },
      },
    },
    instanceResources: { byConversationId: {} },
    instanceVariableValues: { byConversationId: {} },
    instanceModelOverrides: { byConversationId: {} },
    instanceContext: { byConversationId: {} },
    instanceClientTools: { byConversationId: {} },
    appContext: appContextReducer(undefined, { type: "@@INIT" }),
    adminPreferences: adminPreferencesReducer(undefined, { type: "@@INIT" }),
    userPreferences: {
      assistant: { directiveApplyPolicy },
    },
  } as unknown as RootState;
}

describe("makeSelectAssembledRequest", () => {
  test("renders the Payload preview with default user preferences", () => {
    const request = makeSelectAssembledRequest(CONVERSATION_ID)(makeState());

    expect(request).toEqual(
      expect.objectContaining({
        stream: true,
        user_input: "Preview this payload",
      }),
    );
    expect(request?.user).toBeUndefined();
  });

  test("reacts to and includes an explicit user directive policy", () => {
    const selector = makeSelectAssembledRequest(CONVERSATION_ID);

    expect(selector(makeState("ask"))?.user).toEqual({ apply_policy: "ask" });
    expect(selector(makeState("auto"))?.user).toEqual({
      apply_policy: "auto",
    });
  });
});
