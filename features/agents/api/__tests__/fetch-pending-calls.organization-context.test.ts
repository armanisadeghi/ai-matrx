const mockCallApi = jest.fn((config: unknown) => ({
  kind: "api-call" as const,
  config,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: mockCallApi,
}));

import {
  fetchConversationPendingCalls,
  fetchConversationPendingCallsStrict,
} from "../fetch-pending-calls";

const CONVERSATION_ID = "conversation-1";
const CONVERSATION_ORGANIZATION_ID = "org-conversation";

function state(conversationOrganizationId: string | null) {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: { organizationId: conversationOrganizationId },
      },
    },
    appContext: { organization_id: null },
  };
}

describe("conversation pending-call organization context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ["recoverable", fetchConversationPendingCalls],
    ["strict", fetchConversationPendingCallsStrict],
  ])(
    "pins the %s read to the saved conversation organization when no organization is selected globally",
    async (_label, thunkFactory) => {
      const dispatch = jest.fn((action: { kind?: string }) => {
        if (action.kind === "api-call") {
          return Promise.resolve({ data: [], error: null });
        }
        throw new Error("Unexpected dispatch");
      });

      await thunkFactory(CONVERSATION_ID)(
        dispatch as never,
        (() => state(CONVERSATION_ORGANIZATION_ID)) as never,
        undefined,
      );

      expect(mockCallApi).toHaveBeenCalledWith(
        expect.objectContaining({
          pathParams: { conversation_id: CONVERSATION_ID },
          scopeOverrides: {
            organization_id: CONVERSATION_ORGANIZATION_ID,
          },
        }),
      );
    },
  );

  it("leaves unsaved conversations on the active-selection path", async () => {
    const dispatch = jest.fn((action: { kind?: string }) => {
      if (action.kind === "api-call") {
        return Promise.resolve({ data: [], error: null });
      }
      throw new Error("Unexpected dispatch");
    });

    await fetchConversationPendingCalls(CONVERSATION_ID)(
      dispatch as never,
      (() => state(null)) as never,
      undefined,
    );

    expect(mockCallApi).toHaveBeenCalledWith(
      expect.objectContaining({ scopeOverrides: undefined }),
    );
  });
});
