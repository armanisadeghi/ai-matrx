import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { createMatrxNdjsonFramer } from "@ai-matrx/agents/stream/ndjson";
import type { BackendStreamFoldState } from "./fold-stream-events";
import { foldBackendStreamEvents } from "./fold-stream-events";

/**
 * Parse newline-delimited JSON (as produced by the Python streaming endpoint)
 * into typed stream events — through the ONE wire kernel
 * (`@ai-matrx/agents/stream/ndjson`), the same framer + compact-envelope
 * normalization the production parser boundary uses. This was the last
 * hand-rolled NDJSON parser in the repo (execution-runtime HANDOFF §2): its
 * raw per-line `JSON.parse` never normalized the compact `{"e":"c","t":…}`
 * form, so captured/replayed tool-test NDJSON silently lost chunk text.
 *
 * Malformed lines and unrecognized envelopes are skipped but never silent —
 * they warn, so a broken capture is visible instead of quietly shrinking.
 */
export function parseNdjsonStringToStreamEvents(ndjson: string): TypedStreamEvent[] {
  const framer = createMatrxNdjsonFramer({
    onMalformedLine: (issue) => {
      console.warn(
        `[tool-test ndjson] skipped malformed line ${issue.lineNumber}`,
        issue.error,
      );
    },
    onUnknownEnvelope: (value) => {
      console.warn(
        "[tool-test ndjson] skipped line that is valid JSON but not a Matrx stream envelope",
        value,
      );
    },
  });
  const envelopes = [...framer.pushText(ndjson), ...framer.finish()];
  return envelopes as TypedStreamEvent[];
}

/** NDJSON → full universal fold. */
export function ndjsonToFoldState(ndjson: string): BackendStreamFoldState {
  return foldBackendStreamEvents(parseNdjsonStringToStreamEvents(ndjson));
}
