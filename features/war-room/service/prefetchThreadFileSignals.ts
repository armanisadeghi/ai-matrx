/**
 * features/war-room/service/prefetchThreadFileSignals.ts
 *
 * Best-effort hydration of the two per-file signals the SYNC `war_room` context
 * builder stamps onto a thread's `<files>` manifest:
 *   1. EXTRACTION presence → reuse the canonical `prefetchRagStatusesForFiles`
 *      thunk (fills `cloudFiles.ragStatus`, which `buildThreadFiles` reads).
 *   2. RAG SEARCHABLE state → `fetchFileRagStatus` per file (state==='completed')
 *      into the module cache (`threadFileRagCache`) the builder reads.
 *
 * The builder is sync (reads Redux + the cache), so this runs on panel mount to
 * populate both before/around the agent's first turn. It NEVER throws and never
 * blocks: a failed probe just leaves a flag unknown (the builder omits it). When
 * the searchable probes land it invokes `onResolved` so the caller can bump the
 * context builder's identity and re-push with the now-known flags.
 *
 * Reuses existing fetch paths only (`features/files` + `features/rag/api`) — no
 * new endpoint, no `features/files/handler` internals.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { prefetchRagStatusesForFiles } from "@/features/files";
import { fetchFileRagStatus } from "@/features/rag/api/rag-jobs";
import {
  hasThreadFileRagProbe,
  setThreadFileRagIndexed,
} from "@/features/war-room/service/threadFileRagCache";

/** Polite concurrency cap for the searchable-status fan-out (few files/tile). */
const RAG_PROBE_CONCURRENCY = 4;

export interface PrefetchThreadFileSignalsOpts {
  /** The tile's attached `cld_files.id`s (document attachments are excluded). */
  fileIds: string[];
  dispatch: AppDispatch;
  /** Abort signal (panel unmount) — fetches bail, no state writes after. */
  signal?: AbortSignal;
  /** Called (once) after the searchable probes resolve, to trigger a re-push. */
  onResolved?: () => void;
}

export async function prefetchThreadFileSignals(
  opts: PrefetchThreadFileSignalsOpts,
): Promise<void> {
  const { fileIds, dispatch, signal, onResolved } = opts;
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (ids.length === 0) return;

  // 1. Extraction presence — the canonical batched thunk (de-dups internally).
  void dispatch(prefetchRagStatusesForFiles({ fileIds: ids, force: false }));

  // 2. RAG searchable state — probe only ids we haven't already cached.
  const toProbe = ids.filter((id) => !hasThreadFileRagProbe(id));
  if (toProbe.length === 0) {
    onResolved?.();
    return;
  }

  let cursor = 0;
  let anyResolved = false;
  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const i = cursor;
      cursor += 1;
      if (i >= toProbe.length) return;
      const id = toProbe[i];
      try {
        const status = await fetchFileRagStatus(id, signal);
        setThreadFileRagIndexed(id, status.state === "completed");
        anyResolved = true;
      } catch {
        // Transient / not-found — leave it unprobed so a later mount can retry;
        // the builder omits the flag rather than guessing.
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(RAG_PROBE_CONCURRENCY, toProbe.length); i += 1) {
    workers.push(worker());
  }
  await Promise.allSettled(workers);

  if (anyResolved && !signal?.aborted) onResolved?.();
}
