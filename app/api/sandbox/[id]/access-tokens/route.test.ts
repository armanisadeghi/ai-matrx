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

import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";
import { mintAccessTokenWithRetry, POST } from "./route";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

test("real fetch consumes a slow loopback mint once", async () => {
  let calls = 0;
  const server = createServer((_request, response) => {
    calls += 1;
    setTimeout(() => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ token: "loopback" }));
    }, 3_700);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const result = await mintAccessTokenWithRetry(`http://127.0.0.1:${port}`, { method: "POST" }, {
      consume: (response) => response.json(),
    });
    expect(result.body).toEqual({ token: "loopback" });
    expect(calls).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, 10_000);

test("accepts a healthy 3.7-second mint without starting overlapping retries", async () => {
  jest.useFakeTimers();
  try {
    const request = jest.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        setTimeout(() => resolve(Response.json({ token: "scoped" })), 3_700);
        init?.signal?.addEventListener("abort", () => reject(new Error("deadline")));
      }),
    );
    const result = mintAccessTokenWithRetry("https://orchestrator.example.test", {}, {
      request,
      consume: (response) => response.json(),
    });
    await jest.advanceTimersByTimeAsync(3_700);
    await expect(result).resolves.toMatchObject({ body: { token: "scoped" } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("counts response time and retry backoff against the same 6.75-second deadline", async () => {
  jest.useFakeTimers();
  try {
    const request = jest.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response("busy", { status: 503 })), 4_000);
      }))
      .mockImplementationOnce((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("deadline")));
        }),
      );
    const result = mintAccessTokenWithRetry("https://orchestrator.example.test", {}, { request });
    const assertion = expect(result).rejects.toThrow("deadline");
    await jest.advanceTimersByTimeAsync(4_250);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(2_499);
    expect(request.mock.calls[1][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await assertion;
    expect(request.mock.calls[1][1].signal.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("still limits prompt transient responses to three attempts", async () => {
  const request = jest.fn(async () => new Response("busy", { status: 503 }));
  const wait = jest.fn(async () => undefined);
  const { response } = await mintAccessTokenWithRetry("https://orchestrator.example.test", {}, { request, wait });
  expect(response.status).toBe(503);
  expect(request).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls).toEqual([[250], [500]]);
});

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
    .mockImplementationOnce(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.reject(new Error("body failed")),
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
      { request, wait: async () => undefined, timeoutMs: 10, consume: (response) => response.json() },
    ),
  ).rejects.toThrow("upstream response body deadline exceeded");

  expect(request).toHaveBeenCalledTimes(1);
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
    auth: mockWithClaims({ getUser: async () => ({ data: { user: { id: "user-test", email: "test@example.test" } }, error: null }) }),
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
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
      { request, wait: async () => undefined, timeoutMs: 10 },
    ),
  ).rejects.toThrow("upstream request deadline exceeded");

  expect(request).toHaveBeenCalledTimes(1);
  for (const [, init] of request.mock.calls) {
    expect((init as RequestInit).signal?.aborted).toBe(true);
  }
});
