import { buildMatrxRequestUrl } from "@ai-matrx/agents/matrx";
import { loadSocialConfigs } from "../customer-service";

const mockSend = jest.fn();
const mockBaseUrl = jest.fn((..._args: unknown[]) => "http://localhost:8000/");

jest.mock("@ai-matrx/agents/matrx", () => ({
  ...jest.requireActual("@ai-matrx/agents/matrx"),
  sendMatrxRequest: (...args: unknown[]) => mockSend(...args),
}));
jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: (...args: unknown[]) => mockBaseUrl(...args),
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) },
  }),
}));

describe("customer social configuration URL", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockBaseUrl.mockClear();
    mockSend.mockResolvedValue({
      ok: true,
      json: async () => ({ provider: "mastodon", status: "available", scopes: [] }),
    });
  });

  it("keeps the legacy API prefix without a duplicate slash for a browser base URL", async () => {
    await loadSocialConfigs("11111111-1111-4111-8111-111111111111", ["mastodon"]);

    expect(mockBaseUrl).toHaveBeenCalledWith("aidream");
    expect(mockSend).toHaveBeenCalledWith(
      "http://localhost:8000/api/social-oauth/mastodon/config",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      buildMatrxRequestUrl(
        "http://localhost:8000/api",
        "/api/social-oauth/mastodon/config",
      ),
    ).toBe("http://localhost:8000/api/social-oauth/mastodon/config");
  });
});
