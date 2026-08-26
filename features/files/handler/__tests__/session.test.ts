/**
 * features/files/handler/__tests__/session.test.ts
 *
 * The file-session cookie module: POST /files/session with credentials on
 * every distinct backend base, in-flight + freshness dedupe, and `force`.
 */

const mockBuildHeaders = jest.fn();
let mainBase = "https://server.app.matrxserver.com";
let filesBase = "https://files.matrxserver.com";

jest.mock("@/lib/python-client", () => ({
  buildHeaders: (...args: unknown[]) => mockBuildHeaders(...args),
  resolveBaseUrl: () => mainBase,
  resolveFilesBaseUrl: () => filesBase,
}));

import {
  ensureFilesSession,
  _resetFilesSessionForTests,
} from "../session";

describe("ensureFilesSession", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    _resetFilesSessionForTests();
    mainBase = "https://server.app.matrxserver.com";
    filesBase = "https://files.matrxserver.com";
    mockBuildHeaders.mockResolvedValue({
      headers: { Authorization: "Bearer test-jwt" },
      requestId: "rid",
    });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, expires_in: 604800 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("POSTs /files/session with auth headers AND credentials on both bases", async () => {
    await ensureFilesSession();
    const urls = fetchMock.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      "https://files.matrxserver.com/files/session",
      "https://server.app.matrxserver.com/files/session",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(init.headers.Authorization).toBe("Bearer test-jwt");
    }
  });

  it("collapses to ONE POST when the bases are the same host", async () => {
    filesBase = mainBase;
    await ensureFilesSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes: a fresh session is a no-op on the next call", async () => {
    await ensureFilesSession();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await ensureFilesSession();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent calls into one in-flight POST per base", async () => {
    await Promise.all([ensureFilesSession(), ensureFilesSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("force bypasses freshness and re-POSTs", async () => {
    await ensureFilesSession();
    await ensureFilesSession({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("per-base failures are independent and never throw", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://files.")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ ok: true, expires_in: 604800 }) };
    });
    await expect(ensureFilesSession()).resolves.toBeUndefined();
    // The failed base is not marked fresh — a later call retries only it.
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, expires_in: 604800 }),
    });
    await ensureFilesSession();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://files.matrxserver.com/files/session",
    ]);
  });
});
