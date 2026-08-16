/**
 * Frame-parsing tests for the fetch-based SSE client.
 *
 * fetch is mocked to return an object whose body's getReader() yields
 * scripted Uint8Array chunks — no network, no timers. run-event-source
 * timing (stall/reconnect/poll cadence) is deliberately NOT tested here.
 */
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";

// jsdom scrubs the Node encoding globals from the test environment.
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}

import { streamSse } from "@/features/workflow-runtime/transport/sse";

const encoder = new NodeTextEncoder();

interface CollectedEvent {
  eventType: string;
  data: string;
  id: string | null;
}

function mockFetchWithChunks(chunks: string[]): jest.Mock {
  let index = 0;
  const reader = {
    read: (): Promise<{ value: Uint8Array | undefined; done: boolean }> => {
      if (index < chunks.length) {
        const value = encoder.encode(chunks[index]);
        index += 1;
        return Promise.resolve({ value, done: false });
      }
      return Promise.resolve({ value: undefined, done: true });
    },
    releaseLock: (): void => undefined,
  };
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    body: { getReader: () => reader },
  });
}

async function runStream(
  chunks: string[],
  onFrame?: () => void,
): Promise<{ events: CollectedEvent[]; fetchMock: jest.Mock }> {
  const fetchMock = mockFetchWithChunks(chunks);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const events: CollectedEvent[] = [];
  const controller = new AbortController();
  await streamSse(
    "https://example.test/runs/r1/events/stream",
    (eventType, data, id) => events.push({ eventType, data, id }),
    {
      headers: { Authorization: "Bearer test-token" },
      signal: controller.signal,
      ...(onFrame ? { onFrame } : {}),
    },
  );
  return { events, fetchMock };
}

describe("streamSse frame parsing", () => {
  it("parses multiple frames arriving in one chunk", async () => {
    const { events } = await runStream([
      'event: message\ndata: {"a":1}\n\nevent: message\ndata: {"b":2}\n\n',
    ]);
    expect(events).toEqual([
      { eventType: "message", data: '{"a":1}', id: null },
      { eventType: "message", data: '{"b":2}', id: null },
    ]);
  });

  it("buffers a frame split across chunks (CRLF separators, as sse-starlette emits)", async () => {
    const { events } = await runStream([
      "event: message\r\ndata: {\"partial\":",
      "true}\r\n\r\n",
    ]);
    expect(events).toEqual([{ eventType: "message", data: '{"partial":true}', id: null }]);
  });

  it("invokes onFrame for comment-only heartbeats that never reach onEvent", async () => {
    const onFrame = jest.fn();
    const { events } = await runStream(
      [": ping 2026-08-16\r\n\r\n", 'data: {"x":1}\n\n'],
      onFrame,
    );
    // Heartbeat frame + data frame both count as liveness proof…
    expect(onFrame).toHaveBeenCalledTimes(2);
    // …but only the data frame produces an event.
    expect(events).toEqual([{ eventType: "message", data: '{"x":1}', id: null }]);
  });

  it("captures the id: line and passes it alongside the event", async () => {
    const { events } = await runStream(['id: 42\nevent: message\ndata: {"seq":42}\n\n']);
    expect(events).toEqual([{ eventType: "message", data: '{"seq":42}', id: "42" }]);
  });

  it("joins multi-line data with newlines", async () => {
    const { events } = await runStream(["data: line one\ndata: line two\ndata: line three\n\n"]);
    expect(events).toEqual([
      { eventType: "message", data: "line one\nline two\nline three", id: null },
    ]);
  });

  it("sends Last-Event-ID and Authorization headers", async () => {
    const fetchMock = mockFetchWithChunks(["data: {}\n\n"]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    await streamSse("https://example.test/stream", () => undefined, {
      headers: { Authorization: "Bearer tok" },
      lastEventId: "17",
      signal: controller.signal,
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Last-Event-ID"]).toBe("17");
    expect(headers.Accept).toBe("text/event-stream");
  });

  it("throws on a non-2xx response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      body: null,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    await expect(
      streamSse("https://example.test/stream", () => undefined, {
        headers: {},
        signal: controller.signal,
      }),
    ).rejects.toThrow("SSE request failed: 401 Unauthorized");
  });
});
