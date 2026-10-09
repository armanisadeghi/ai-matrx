const mockResolvedBaseUrl = jest.fn();
const mockGetSession = jest.fn();
const mockGetClaimsUser = jest.fn();
const mockCapturePythonClientError = jest.fn();
jest.mock("@/lib/python-client", () => ({
  ...jest.requireActual("@/lib/python-client"),
  resolveBaseUrl: () => mockResolvedBaseUrl(),
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
  createClient: () => ({ auth: { getSession: mockGetSession } }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: (...args: unknown[]) => mockGetClaimsUser(...args),
}));
jest.mock("@/lib/redux/store-singleton", () => ({ getStore: () => null }));
jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: (...args: unknown[]) =>
    mockCapturePythonClientError(...args),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async () =>
    "39c38960-d30c-4840-b0c1-c9960de95582",
}));
import { getGoogleBackend, listGoogleCapabilities, postGoogleBackend } from "./service";

describe("Google requests follow the shared selected server", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-session" } },
    });
    mockGetClaimsUser.mockResolvedValue({
      data: { claims: { sub: "reviewer-harbor-dental" }, user: { id: "reviewer-harbor-dental" } },
      error: null,
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

  it("keeps the original verified identity and organization when the canonical client refreshes its session", async () => {
    mockResolvedBaseUrl.mockReturnValue("https://server.app.matrxserver.com");
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { access_token: "token-original" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "token-refreshed" } } });

    await postGoogleBackend(
      "/api/google-integrations/gmail/search",
      { connection_id: "connection-harbor-dental", query: "subject:appointment" },
      "Gmail search could not finish. Try again.",
      undefined,
      "reviewer-harbor-dental",
    );

    expect(mockGetClaimsUser).toHaveBeenCalledTimes(1);
    expect(mockGetClaimsUser).toHaveBeenCalledWith(
      expect.anything(),
      "token-original",
    );
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    const [url, init] = jest.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://server.app.matrxserver.com/google-integrations/gmail/search");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        connection_id: "connection-harbor-dental",
        query: "subject:appointment",
      }),
      headers: expect.objectContaining({
        Authorization: "Bearer token-original",
        "Content-Type": "application/json",
        "X-Organization-Id": "39c38960-d30c-4840-b0c1-c9960de95582",
        Accept: "application/json",
      }),
    });
  });

  it("preserves the caller signal on a Google GET", async () => {
    mockResolvedBaseUrl.mockReturnValue("https://server.app.matrxserver.com");
    const controller = new AbortController();

    await getGoogleBackend(
      "/api/google-integrations/capabilities",
      "Unable to load Google capability availability.",
      controller.signal,
    );

    expect(jest.mocked(fetch).mock.calls[0]).toEqual([
      "https://server.app.matrxserver.com/google-integrations/capabilities",
      expect.objectContaining({ method: "GET", signal: controller.signal }),
    ]);
  });

  // Break caught: replacing requestRaw with the package's raw sender leaves a
  // rejected cross-origin fetch only as page text and never files its URL.
  it("captures a rejected Gmail transport request with its real URL and method", async () => {
    mockResolvedBaseUrl.mockReturnValue("https://server.app.matrxserver.com");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      postGoogleBackend(
        "/api/google-integrations/gmail/search",
        { connection_id: "connection-harbor-dental", query: "subject:appointment" },
        "Gmail search could not finish. Try again.",
      ),
    ).rejects.toThrow("Failed to fetch");

    expect(jest.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, init] = jest.mocked(fetch).mock.calls[0];
    const requestId = (init?.headers as Record<string, string>)["X-Request-Id"];
    expect(requestId).toEqual(expect.any(String));
    expect(requestId).not.toBe("");
    expect(mockCapturePythonClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to fetch" }),
      expect.objectContaining({
        url: "https://server.app.matrxserver.com/google-integrations/gmail/search",
        method: "POST",
        path: "/api/google-integrations/gmail/search",
        requestId,
      }),
    );
  });

  it("keeps the Google fallback sentence after a captured HTTP failure", async () => {
    mockResolvedBaseUrl.mockReturnValue("https://server.app.matrxserver.com");
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "upstream_failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      postGoogleBackend(
        "/api/google-integrations/gmail/search",
        { connection_id: "connection-harbor-dental", query: "subject:appointment" },
        "Gmail search could not finish. Try again.",
      ),
    ).rejects.toThrow("Gmail search could not finish. Try again.");
    expect(mockCapturePythonClientError).toHaveBeenCalledTimes(1);
  });
});
