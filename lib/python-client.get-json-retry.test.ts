/** @jest-environment node */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/lib/redux/store-singleton", () => ({ getStore: () => null }));
jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));

import { capturePythonClientError } from "@/lib/diagnostics/capturePythonClientError";
import { getJson, postJson } from "@/lib/python-client";

const captureMock = jest.mocked(capturePythonClientError);

describe("python-client getJson transient recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries one browser transport rejection and captures nothing after recovery", async () => {
    const fetchMock = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    global.fetch = fetchMock;

    await expect(
      getJson<{ ok: boolean }>("/files/test/asset", {
        baseUrlOverride: "https://files.example.test",
      }),
    ).resolves.toMatchObject({ data: { ok: true } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures only the final failure after the bounded retry", async () => {
    const fetchMock = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    global.fetch = fetchMock.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await expect(
      getJson("/files/test/asset", {
        baseUrlOverride: "https://files.example.test",
      }),
    ).rejects.toThrow("Failed to fetch");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});

describe("python-client caller-owned error classification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not capture a POST failure when the caller owns classification", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "not_found", message: "run not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      postJson(
        "/podcast/runs/missing/reconcile",
        {},
        {
          baseUrlOverride: "https://server.example.test",
          captureErrors: false,
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(captureMock).not.toHaveBeenCalled();
  });

  it("still captures an unexpected POST failure by default", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "not_found", message: "run not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      postJson("/podcast/runs/missing/reconcile", {}, {
        baseUrlOverride: "https://server.example.test",
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
