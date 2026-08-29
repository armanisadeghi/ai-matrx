import { apiPost } from "@/lib/api/typed-client";
import { mintCredential } from "@/lib/api/broker/client";

jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn() }));

const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>;

describe("mintCredential", () => {
  beforeEach(() => apiPostMock.mockReset());

  it("passes caller-owned error classification to the canonical transport", async () => {
    apiPostMock.mockResolvedValue({
      data: {
        token: "ephemeral",
        credential_mode: "native_ephemeral",
        endpoint: "wss://example.test",
        expires_at: 1_900_000_000,
        audience: "xai_realtime",
        scopes: [],
        tier_policy: "none",
        model: null,
      },
      meta: { requestId: "req-1", serverRequestId: null, status: 200 },
    });

    await mintCredential("xai_realtime", "none", { captureErrors: false });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/broker/tokens",
      expect.objectContaining({ audience: "xai_realtime" }),
      { signal: undefined, captureErrors: false },
    );
  });
});
