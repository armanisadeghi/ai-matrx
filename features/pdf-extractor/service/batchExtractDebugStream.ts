import type { TypedStreamEvent } from "@/lib/api/types";
import { expandCompactEvent, isCompactEvent } from "@/lib/api/types";
import { BackendApiError } from "@/lib/api/errors";

function normalizeWireEvent(parsed: unknown): TypedStreamEvent {
  if (isCompactEvent(parsed)) {
    return expandCompactEvent(parsed);
  }
  return parsed as TypedStreamEvent;
}

export interface BatchExtractStreamTap {
  onRawLine: (line: string, index: number) => void;
}

/**
 * Consume an NDJSON batch-extract response while tapping every raw wire line
 * for admin debug. Mirrors `parseNdjsonStream` line splitting without pulling
 * the full stream-parser module into a second read of the body.
 */
export async function* consumeBatchExtractNdjsonStream(
  response: Response,
  tap: BatchExtractStreamTap,
  signal?: AbortSignal,
): AsyncGenerator<TypedStreamEvent, void, undefined> {
  if (!response.body) {
    throw new BackendApiError({
      code: "internal_error",
      detail: "Response has no body",
      userMessage: "No response received from server",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lineIndex = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        tap.onRawLine(line, lineIndex);
        lineIndex += 1;
        try {
          yield normalizeWireEvent(JSON.parse(line));
        } catch {
          // Keep streaming — some infra lines may be partial during chunking.
        }
      }
    }

    // Flush any bytes the decoder is still holding (a multibyte char split
    // across the final chunk) — without this the terminal line/`end` event
    // can be silently dropped. Mirrors stream-parser.ts.
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      tap.onRawLine(tail, lineIndex);
      try {
        yield normalizeWireEvent(JSON.parse(tail));
      } catch {
        // Terminal partial line — surfaced in the raw debug log.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
