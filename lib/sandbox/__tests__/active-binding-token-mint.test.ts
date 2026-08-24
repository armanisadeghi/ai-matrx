import {
  clearSandboxBindingCache,
  getActiveSandboxBinding,
} from "../active-binding";
import type { RootState } from "@/lib/redux/store";

const ROW_ID = "67e26b2e-2a99-4825-b0e8-2deb50f8c747";
const CONVERSATION_ID = "40ff2897-93c6-4048-ba74-3a8160eef3c0";

function hostedBindingState(): RootState {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat-route",
          isEphemeral: false,
          sandboxBinding: {
            rowId: ROW_ID,
            proxyUrl: "https://orchestrator.example/sandboxes/sbx-live/proxy",
            tier: "hosted",
            kind: "hosted",
            name: "Live box",
          },
        },
      },
    },
    userPreferences: { coding: { activeAgentSandboxBySurface: {} } },
    chatIncognito: { isActive: false },
    codeWorkspace: {},
  } as unknown as RootState;
}

describe("sandbox token mint recovery", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    clearSandboxBindingCache();
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it("retries one transient 5xx without dropping sandbox tools or logging a durable error", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: "sandbox-token",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    await expect(
      getActiveSandboxBinding(hostedBindingState(), CONVERSATION_ID),
    ).resolves.toEqual({
      sandbox_id: "sbx-live",
      base_url: "https://orchestrator.example/sandboxes/sbx-live",
      access_token: "sandbox-token",
      root_path: "/home/agent",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
