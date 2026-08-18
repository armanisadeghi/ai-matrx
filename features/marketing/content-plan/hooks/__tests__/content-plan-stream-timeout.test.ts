import { CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS } from "../useContentPlanAi";
import { resilientFetch } from "@/lib/net/resilient-fetch";

const originalFetch = globalThis.fetch;

describe("content-plan AI stream transport", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, "fetch");
  });

  it("waits beyond callApi's 15-second default but stays below the edge ceiling", () => {
    expect(CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS).toBeGreaterThan(15_000);
    expect(CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS).toBeLessThan(100_000);
  });

  it("keeps an accepted stream handshake alive past the old 15-second cutoff", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          const timer = setTimeout(
            () => resolve({ ok: true, status: 200 } as Response),
            16_000,
          );
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
      writable: true,
    });

    const request = resilientFetch(
      "https://server.example/content-plan/nodes/node-1/deepen",
      { method: "POST" },
      {
        connectTimeoutMs: CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS,
        totalTimeoutMs: null,
      },
    );
    await jest.advanceTimersByTimeAsync(16_000);

    await expect(request).resolves.toMatchObject({
      response: { ok: true, status: 200 },
    });
  });
});
