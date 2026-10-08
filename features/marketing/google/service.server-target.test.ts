const mockResolvedBaseUrl = jest.fn();
const mockGetSession = jest.fn();
jest.mock("@/lib/python-client", () => ({
  resolveBaseUrl: () => mockResolvedBaseUrl(),
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: mockGetSession } }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async () =>
    "39c38960-d30c-4840-b0c1-c9960de95582",
}));
import { listGoogleCapabilities, postGoogleBackend } from "./service";

describe("Google requests follow the shared selected server", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-session" } },
    });
    global.fetch = jest.fn(
      async () =>
        new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  });
  it.each([
    "http://localhost:8000",
    "https://staging.example.test",
    "https://server.app.matrxserver.com",
  ])(
    "sends catalog and writes to %s, then honors a target change",
    async (base) => {
      mockResolvedBaseUrl.mockReturnValue(base);
      await listGoogleCapabilities();
      await postGoogleBackend(
        "/api/google-integrations/gmail/draft",
        { test: true },
        "Draft failed",
      );
      expect(jest.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
        `${base}/google-integrations/capabilities`,
        `${base}/google-integrations/gmail/draft`,
      ]);
      mockResolvedBaseUrl.mockReturnValue("https://changed.example.test");
      await listGoogleCapabilities();
      expect(jest.mocked(fetch).mock.calls[2][0]).toBe(
        "https://changed.example.test/google-integrations/capabilities",
      );
    },
  );
});
