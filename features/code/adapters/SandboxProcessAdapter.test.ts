import { SandboxProcessAdapter } from "./SandboxProcessAdapter";
import { TextDecoder } from "node:util";

describe("SandboxProcessAdapter.stream", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a 200 SSE response that completes with zero events", async () => {
    Object.defineProperty(globalThis, "TextDecoder", {
      configurable: true,
      value: TextDecoder,
    });
    const reader = { read: jest.fn().mockResolvedValue({ done: true }) };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: { getReader: () => reader },
    } as unknown as Response);

    const adapter = new SandboxProcessAdapter("row-id");
    const onEvent = jest.fn();

    await expect(adapter.stream("pnpm install", onEvent)).rejects.toThrow(
      "HTTP 200 with no events",
    );
    expect(onEvent).not.toHaveBeenCalled();
  });
});
