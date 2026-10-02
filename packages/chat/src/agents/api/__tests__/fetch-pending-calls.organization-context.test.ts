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
    "uses the active organization instead of a historical conversation organization",
    async (_label, thunkFactory) => {
      const dispatch = jest.fn((action: { kind?: string }) => {
        if (action.kind === "api-call") {
          return Promise.resolve({ data: [], error: null });
        }
        throw new Error("Unexpected dispatch");
      });

      await thunkFactory(CONVERSATION_ID)(
        dispatch as never,
        (() => state("org-no-longer-a-member")) as never,
        undefined,
      );

      const [config] = mockCallApi.mock.calls[0] as [
        { pathParams?: unknown; scopeOverrides?: unknown },
      ];
      expect(config.pathParams).toEqual({ conversation_id: CONVERSATION_ID });
      expect(config).not.toHaveProperty("scopeOverrides");
    },
  );

  it("uses the active-selection path for an unsaved conversation too", async () => {
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

    expect(mockCallApi.mock.calls[0]?.[0]).not.toHaveProperty("scopeOverrides");
  });
});
