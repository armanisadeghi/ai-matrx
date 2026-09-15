/** @jest-environment node */

const mockLookupSandboxAndOrchestrator = jest.fn();
const mockCreateClient = jest.fn();

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  lookupSandboxAndOrchestrator: mockLookupSandboxAndOrchestrator,
  orchestratorJsonHeaders: () => ({ "X-API-Key": "test" }),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: mockCreateClient,
}));

import { mintAccessTokenWithRetry, POST } from "./route";

test("retries a transient unavailable-upstream response before returning a minted token", async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(new Response("no available server", { status: 502 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "scoped" }), { status: 200 }));
  const wait = jest.fn(async () => undefined);

  const { response } = await mintAccessTokenWithRetry(
    "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
    { method: "POST" },
    { request, wait },
  );

  expect(response.status).toBe(200);
  expect(request).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(250);
});

test("does not retry an authoritative client refusal", async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response("Invalid API key", { status: 403 }));

  const { response } = await mintAccessTokenWithRetry(
    "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
    { method: "POST" },
    { request, wait: async () => undefined },
  );

  expect(response.status).toBe(403);
  expect(request).toHaveBeenCalledTimes(1);
});

test("never combines a stale transient body with a later failed response", async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(new Response("transient", { status: 502 }))
    .mockImplementationOnce((_url: string, init?: RequestInit) =>
      Promise.resolve({
        status: 200,
        json: () =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("body deadline")),
            ),
          ),
      } as Response),
    )
    .mockRejectedValueOnce(new Error("connection failed"));

  await expect(
    mintAccessTokenWithRetry(
      "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
      { method: "POST" },
      {
        request,
        wait: async () => undefined,
        attemptTimeoutMs: 10,
        consume: (response) =>
          response.status === 200 ? response.json() : response.text(),
      },
    ),
  ).rejects.toThrow("connection failed");
  expect(request).toHaveBeenCalledTimes(3);
});

test("keeps the deadline through a stalled successful response body", async () => {
  const request = jest.fn(
    (_url: string, init?: RequestInit) => {
      const response = {
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("upstream response body deadline exceeded")),
            );
          }),
      } as Response;
      return Promise.resolve(response);
    },
  );

  await expect(
    mintAccessTokenWithRetry(
      "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
      { method: "POST" },
      { request, wait: async () => undefined, attemptTimeoutMs: 10, consume: (response) => response.json() },
    ),
  ).rejects.toThrow("upstream response body deadline exceeded");

  expect(request).toHaveBeenCalledTimes(3);
  for (const [, init] of request.mock.calls) {
    expect((init as RequestInit).signal?.aborted).toBe(true);
  }
});

test("the route converts an exhausted upstream deadline into the established recoverable 502", async () => {
  mockLookupSandboxAndOrchestrator.mockResolvedValue({
    ok: true,
    status: "running",
    sandboxId: "sbx-test",
    orchestrator: { url: "https://orchestrator.example.test", tier: "hosted", apiKey: "test" },
  });
  mockCreateClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-test", email: "test@example.test" } }, error: null }) },
  });
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("deadline")));
      }),
  );
  const timerSpy = jest.spyOn(global, "setTimeout").mockImplementation((callback) => {
    queueMicrotask(callback as () => void);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });

  try {
    const response = await POST(new Request("https://app.example.test/api/sandbox/sbx-test/access-tokens", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "sandbox-row" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "Sandbox orchestrator is not reachable" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  } finally {
    timerSpy.mockRestore();
    fetchSpy.mockRestore();
  }
});

test("bounds a hung upstream request so the route can return a recoverable error", async () => {
  const request = jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("upstream request deadline exceeded")),
        );
      }),
  );

  await expect(
    mintAccessTokenWithRetry(
      "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
      { method: "POST" },
      { request, wait: async () => undefined, attemptTimeoutMs: 10 },
    ),
  ).rejects.toThrow("upstream request deadline exceeded");

  expect(request).toHaveBeenCalledTimes(3);
  for (const [, init] of request.mock.calls) {
    expect((init as RequestInit).signal?.aborted).toBe(true);
  }
});
