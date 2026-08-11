import {
  normalizeMatrxStreamEnvelope,
  readMatrxNdjsonStream,
  type MatrxStreamEnvelope,
} from "./ndjson";
import { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";

Object.assign(globalThis, {
  ReadableStream: NodeReadableStream,
  TextDecoder: NodeTextDecoder,
  TextEncoder: NodeTextEncoder,
});

function bodyFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(
  body: ReadableStream<Uint8Array>,
  options?: Parameters<typeof readMatrxNdjsonStream>[1],
): Promise<MatrxStreamEnvelope[]> {
  const events: MatrxStreamEnvelope[] = [];
  for await (const event of readMatrxNdjsonStream(body, options)) {
    events.push(event);
  }
  return events;
}

describe("normalizeMatrxStreamEnvelope", () => {
  it("normalizes full and compact events", () => {
    expect(
      normalizeMatrxStreamEnvelope({ event: "phase", data: { phase: "run" } }),
    ).toEqual({ event: "phase", data: { phase: "run" } });
    expect(normalizeMatrxStreamEnvelope({ e: "c", t: "hello" })).toEqual({
      event: "chunk",
      data: { text: "hello" },
    });
    expect(normalizeMatrxStreamEnvelope({ e: "r", t: "thinking" })).toEqual({
      event: "reasoning_chunk",
      data: { text: "thinking" },
    });
  });
});

describe("readMatrxNdjsonStream", () => {
  it("preserves split UTF-8 and line boundaries", async () => {
    const bytes = new TextEncoder().encode(
      '{"e":"c","t":"café"}\n{"event":"end","data":{}}',
    );
    const split = bytes.findIndex((byte) => byte > 127) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });

    await expect(collect(body)).resolves.toEqual([
      { event: "chunk", data: { text: "café" } },
      { event: "end", data: {} },
    ]);
  });

  it("reports malformed and unknown lines without hiding valid events", async () => {
    const malformed: string[] = [];
    const unknown: unknown[] = [];
    const events = await collect(
      bodyFromChunks(['{"e":"c","t":"one"}\nnot-json\n{"other":true}\n']),
      {
        onMalformedLine: ({ line }) => malformed.push(line),
        onUnknownEnvelope: (value) => unknown.push(value),
      },
    );

    expect(events).toEqual([{ event: "chunk", data: { text: "one" } }]);
    expect(malformed).toEqual(["not-json"]);
    expect(unknown).toEqual([{ other: true }]);
  });
});
