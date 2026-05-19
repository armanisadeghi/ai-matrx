// components/admin/markdown-tester/utils/run-redux-parser.ts
// Runs the live Redux streaming parser (StreamBlockAccumulator) in
// isolation so drift between it, the one-shot V2 splitter, and the
// Python server endpoint can be measured byte-for-byte.
//
// Two modes:
//   - "one-shot"  : the whole content goes through `ingest` in one call.
//                   Tests final-state correctness only.
//   - "chunked"   : the content is sliced into fixed-size chunks and fed
//                   sequentially. Exercises the chunk-boundary state
//                   machine, which is where live drift tends to hide.
//
// The accumulator's real upsertAction creator dispatches an action that
// active-requests reducer consumes. We don't want to touch real Redux —
// so we supply a synthetic upsertAction + capturing dispatch that just
// stash the block payloads. Last-write-wins by blockId so we get the
// final state of each block, not every streaming intermediate.

"use client";

import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

export type ReduxParseMode = "one-shot" | "chunked";

export interface ReduxParseOptions {
  mode?: ReduxParseMode;
  /** Chunk size in bytes for "chunked" mode. Defaults to 100. */
  chunkSize?: number;
}

const TEST_REQUEST_ID = "markdown-tester-drift-check";

interface CapturedAction {
  payload: { requestId: string; block: RenderBlockPayload };
}

export function runReduxParser(
  content: string,
  options: ReduxParseOptions = {},
): RenderBlockPayload[] {
  const mode: ReduxParseMode = options.mode ?? "one-shot";
  const chunkSize = Math.max(1, options.chunkSize ?? 100);

  const captured: RenderBlockPayload[] = [];

  const upsertAction = (payload: {
    requestId: string;
    block: RenderBlockPayload;
  }): CapturedAction => ({ payload });

  const dispatch = (action: unknown) => {
    const a = action as CapturedAction | null;
    if (!a || !a.payload || !a.payload.block) return action;
    const block = a.payload.block;
    const existingIndex = captured.findIndex(
      (b) => b.blockId === block.blockId,
    );
    if (existingIndex >= 0) {
      captured[existingIndex] = block;
    } else {
      captured.push(block);
    }
    return action;
  };

  const accumulator = new StreamBlockAccumulator(TEST_REQUEST_ID, upsertAction);

  if (mode === "one-shot") {
    accumulator.ingest(content, dispatch);
  } else {
    // The accumulator only emits on newline boundaries — make sure the
    // chunk loop still terminates by feeding the trailing fragment as
    // its own ingest call. The accumulator itself buffers the remainder
    // in `pendingLineFragment` so we don't need to worry about losing
    // characters between chunks.
    for (let i = 0; i < content.length; i += chunkSize) {
      const slice = content.slice(i, i + chunkSize);
      accumulator.ingest(slice, dispatch);
    }
  }

  accumulator.finalize(dispatch);

  // Sort by blockIndex so we get deterministic order regardless of which
  // order finalize() emits in.
  return captured
    .slice()
    .sort((a, b) => (a.blockIndex ?? 0) - (b.blockIndex ?? 0));
}
