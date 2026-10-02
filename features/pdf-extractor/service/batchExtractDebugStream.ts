import type { TypedStreamEvent } from "@/lib/api/types";
import { BackendApiError } from "@/lib/api/errors";
import { readMatrxNdjsonStream } from "@ai-matrx/agents/stream/ndjson";

export interface BatchExtractStreamTap {
  onRawLine: (line: string, index: number) => void;
}

/**
 * Consume an NDJSON batch-extract response while tapping every raw wire line
 * for admin debug. Framing, compact-event expansion, and torn-line handling
 * are the shared kernel's (`@ai-matrx/agents/stream/ndjson`); the tap rides
 * its observation hooks, which carry the exact wire line — valid envelopes,
 * malformed lines, and valid JSON with no recognised envelope alike.
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

  let lineIndex = 0;
  const emit = (line: string): void => {
    tap.onRawLine(line, lineIndex);
    lineIndex += 1;
  };

  const events = readMatrxNdjsonStream(response.body, {
    signal,
    onValidEnvelope: ({ line }) => emit(line.trim()),
    // Partial / malformed lines are non-fatal; they surface in the raw log.
    onMalformedLine: ({ line }) => emit(line.trim()),
    onUnknownEnvelope: (value) => emit(JSON.stringify(value)),
  });

  for await (const envelope of events) {
    yield envelope as TypedStreamEvent;
  }
}
