/** @jest-environment node */

import { mintAccessTokenWithRetry } from "./route";

test("retries a transient unavailable-upstream response before returning a minted token", async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(new Response("no available server", { status: 502 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "scoped" }), { status: 200 }));
  const wait = jest.fn(async () => undefined);

  const response = await mintAccessTokenWithRetry(
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

  const response = await mintAccessTokenWithRetry(
    "https://orchestrator.example.test/sandboxes/sbx-test/access-tokens",
    { method: "POST" },
    { request, wait: async () => undefined },
  );

  expect(response.status).toBe(403);
  expect(request).toHaveBeenCalledTimes(1);
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
