import {
  clearSandboxBindingCache,
  getActiveSandboxBinding,
} from "../active-binding";
import type { RootState } from "@/lib/redux/store";

const DEVICE_ID = "67e26b2e-2a99-4825-b0e8-2deb50f8c747";
const CONVERSATION_ID = "40ff2897-93c6-4048-ba74-3a8160eef3c0";

function localPcSeedState(): RootState {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat-route",
          isEphemeral: false,
          sandboxBinding: null,
        },
      },
    },
    userPreferences: {
      coding: {
        activeAgentSandboxBySurface: {
          "chat-route": {
            rowId: DEVICE_ID,
            proxyUrl: "",
            kind: "local-pc",
            name: "Offline PC",
          },
        },
      },
    },
    chatIncognito: { isActive: false },
    codeWorkspace: {},
  } as unknown as RootState;
}

describe("local-PC binding resolution", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    clearSandboxBindingCache();
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it("preserves the local-machine namespace and reported root in the outbound binding", async () => {
    const payload = {
      sandbox_id: "desktop-device", base_url: "https://server.example.test/api/local-proxy/device",
      access_token: "session-jwt", root_path: "C:\\Users\\Owner", target_kind: "local_machine",
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
    await expect(getActiveSandboxBinding(localPcSeedState(), CONVERSATION_ID)).resolves.toEqual(payload);
  });

  it("refuses a cloud binding returned for a selected local machine", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      sandbox_id: "desktop-device", base_url: "https://server.example.test/api/local-proxy/device",
      access_token: "session-jwt", root_path: "/", target_kind: "sandbox",
    }) });
    jest.spyOn(console, "error").mockImplementation();
    await expect(getActiveSandboxBinding(localPcSeedState(), CONVERSATION_ID)).resolves.toBeNull();
  });

  it("suppresses an offline device after one 410 instead of resolving it twice", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => '{"error":"device_offline"}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
    const state = localPcSeedState();

    await expect(
      getActiveSandboxBinding(state, CONVERSATION_ID),
    ).resolves.toBeNull();
    await expect(
      getActiveSandboxBinding(state, CONVERSATION_ID),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
