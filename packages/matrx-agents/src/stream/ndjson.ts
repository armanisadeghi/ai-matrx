/**
 * Canonical AI Matrx NDJSON wire kernel.
 *
 * This module is deliberately independent of React, Redux, Next.js, Supabase,
 * and generated application types. Every Matrx client uses it to turn the
 * backend's byte stream into the same normalized `{ event, data }` envelopes.
 * Host runtimes remain responsible for HTTP/auth errors and for deciding what
 * each event means in their state model.
 */

export interface MatrxStreamEnvelope<TData = unknown> {
  event: string;
  data: TData;
}

export interface MatrxNdjsonIssue {
  line: string;
  error: unknown;
}

export interface ReadMatrxNdjsonOptions {
  signal?: AbortSignal;
  /** Malformed JSON is non-fatal, but it must never disappear silently. */
  onMalformedLine?: (issue: MatrxNdjsonIssue) => void;
  /** Valid JSON with no recognized Matrx event envelope is also non-fatal. */
  onUnknownEnvelope?: (value: unknown) => void;
}

type QueueItem =
  | { kind: "event"; value: MatrxStreamEnvelope }
  | { kind: "error"; error: unknown }
  | { kind: "done" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize both supported Matrx wire shapes:
 *
 * - full: `{ "event": "chunk", "data": { "text": "..." } }`
 * - compact chunk: `{ "e": "c", "t": "..." }`
 * - compact reasoning: `{ "e": "r", "t": "..." }`
 */
export function normalizeMatrxStreamEnvelope(
  value: unknown,
): MatrxStreamEnvelope | null {
  if (!isRecord(value)) return null;

  if (typeof value.event === "string") {
    return { event: value.event, data: value.data };
  }
  if (value.e === "c" && typeof value.t === "string") {
    return { event: "chunk", data: { text: value.t } };
  }
  if (value.e === "r" && typeof value.t === "string") {
    return { event: "reasoning_chunk", data: { text: value.t } };
  }
  return null;
}

/**
 * Read and normalize a Matrx NDJSON response body without applying consumer
 * backpressure to the network reader. The background read-ahead is important:
 * large tool payloads must keep draining even while React or another host is
 * processing the previous event.
 */
export async function* readMatrxNdjsonStream(
  body: ReadableStream<Uint8Array>,
  options: ReadMatrxNdjsonOptions = {},
): AsyncGenerator<MatrxStreamEnvelope, void, undefined> {
  const queue: QueueItem[] = [];
  let wakeConsumer: (() => void) | null = null;
  let readerFinished = false;

  const enqueue = (item: QueueItem): void => {
    queue.push(item);
    const wake = wakeConsumer;
    wakeConsumer = null;
    wake?.();
  };

  const reader = body.getReader();
  const decoder = new TextDecoder();

  const parseLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (error) {
      options.onMalformedLine?.({ line: trimmed, error });
      return;
    }

    const envelope = normalizeMatrxStreamEnvelope(parsed);
    if (envelope) {
      enqueue({ kind: "event", value: envelope });
    } else {
      options.onUnknownEnvelope?.(parsed);
    }
  };

  const onAbort = (): void => {
    void reader.cancel(options.signal?.reason).catch(() => undefined);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const readerPromise = (async (): Promise<void> => {
    let buffer = "";
    try {
      while (!options.signal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) parseLine(line);
      }

      buffer += decoder.decode();
      if (!options.signal?.aborted && buffer.trim()) parseLine(buffer);
    } catch (error) {
      const aborted =
        options.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError");
      if (!aborted) enqueue({ kind: "error", error });
    } finally {
      readerFinished = true;
      reader.releaseLock();
      enqueue({ kind: "done" });
    }
  })();

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wakeConsumer = resolve;
        });
      }

      const item = queue.shift();
      if (!item || item.kind === "done") return;
      if (item.kind === "error") throw item.error;
      yield item.value;
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    if (!readerFinished) {
      await reader.cancel().catch(() => undefined);
    }
    await readerPromise;
  }
}
