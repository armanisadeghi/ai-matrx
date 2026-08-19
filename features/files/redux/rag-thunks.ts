/**
 * features/files/redux/knowledge-thunks.ts
 *
 * Batch-prefetch the per-file Knowledge status (whether a `processed_documents`
 * row exists for the file) and mirror it into Redux. The Python backend
 * exposes Knowledge state through `/files/{file_id}/document` — one request per
 * file — so we wrap that with a concurrency-capped fan-out + a Redux
 * mirror so the file-table column can react instantly when each answer
 * lands.
 *
 * Why a thunk and not just N hooks:
 *   - The file-table renders rows lazily (windowed). Driving status off
 *     a per-row hook would only fetch what's currently scrolled into
 *     view. The user wants to filter by status, so we need answers for
 *     every row in the current dataset, not just the visible window.
 *   - Module-level memoisation in `lookupFileDocument` already de-dups
 *     in-flight calls; this thunk just orchestrates them, throttles to
 *     a polite 8-way parallelism, and reports progress through the
 *     `isFetching` flag so the UI can render a spinner.
 *
 * Skipping & forcing:
 *   - In default (non-force) mode we skip files whose status is already
 *     `indexed` / `not_indexed` — they don't change without a `/knowledge/ingest`
 *     call we know about. `pending` and `unknown` *do* get re-fetched
 *     because they're inconclusive.
 *   - In `force` mode we wipe the module cache for every requested id
 *     before re-issuing the lookup. This is what the column header's
 *     "Refresh" button calls.
 */

"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";

import {
  clearFileDocumentCache,
  lookupFileDocument,
} from "@/features/files/api/document-lookup";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import {
  setRagStatusBatch,
  setRagStatusFetching,
  setRagStatusForFile,
} from "./slice";
import type { CloudFilesState, RagStatus } from "@/features/files/types";

type StateWithCloudFiles = { cloudFiles: CloudFilesState };
type AppDispatch = ThunkDispatch<StateWithCloudFiles, unknown, UnknownAction>;
type ThunkApi = { dispatch: AppDispatch; state: StateWithCloudFiles };

/**
 * Concurrency cap for the batch fan-out. The Python backend handles
 * concurrent reads fine, but a 1000-file dataset firing 1000 in-flight
 * requests punishes the user's network and the browser's request queue
 * for no real gain. 8 is a good middle ground — fast for typical 50–200
 * file lists, polite for the long tail.
 */
const BATCH_CONCURRENCY = 8;

export interface PrefetchRagStatusesArg {
  /** Cloud-file ids to look up. Synthetic / virtual ids are skipped. */
  fileIds: string[];
  /** When true, ignore cached / stored statuses and re-fetch from origin. */
  force?: boolean;
}

export const prefetchRagStatusesForFiles = createAsyncThunk<
  void,
  PrefetchRagStatusesArg,
  ThunkApi
>(
  "cloudFiles/prefetchRagStatusesForFiles",
  async ({ fileIds, force = false }, { dispatch, getState }) => {
    const existing = getState().cloudFiles.ragStatus.byFileId;

    // Drop synthetic ids — virtual files (notes, code-files, agent
    // outputs surfaced as files) have no `cld_files.id` to look up
    // against, so the lookup would always 404. Stamp them as
    // `not_indexed` so the column shows a useful status without ever
    // hitting the network.
    const realIds: string[] = [];
    const syntheticBatch: Record<string, RagStatus> = {};
    for (const id of fileIds) {
      if (isSyntheticId(id)) {
        if (!existing[id]) syntheticBatch[id] = "not_indexed";
        continue;
      }
      realIds.push(id);
    }

    // Determine which real ids actually need a network probe.
    //
    // We deliberately do NOT re-fetch ids currently in `pending`. A
    // previously-dispatched batch is still resolving them — re-firing
    // would just spawn parallel dispatches of the same answer. The
    // module-level `inflight` map in `lookupFileDocument` dedupes the
    // network call but not the dispatch noise. This also makes the
    // FileTable's auto-prefetch effect safe against re-renders during
    // the resolution window: each render that re-fires the thunk sees
    // every in-flight id as already pending and bails.
    const toFetch = realIds.filter((id) => {
      if (force) return true;
      const cur = existing[id];
      // Re-fetch when no answer yet or when the previous answer was
      // inconclusive (transient backend error / endpoint unavailable).
      return !cur || cur === "unknown";
    });

    // Apply the synthetic-id batch even if there are no real fetches —
    // skipping it would leave virtual rows perpetually showing the
    // "Checking…" placeholder.
    if (Object.keys(syntheticBatch).length > 0) {
      dispatch(setRagStatusBatch({ entries: syntheticBatch }));
    }

    if (toFetch.length === 0) return;

    if (force) {
      for (const id of toFetch) clearFileDocumentCache(id);
    }

    // Mark as pending in one batch so the column can immediately show a
    // "Checking…" placeholder for every requested row before any
    // network request resolves.
    const pendingBatch: Record<string, RagStatus> = {};
    for (const id of toFetch) pendingBatch[id] = "pending";
    dispatch(setRagStatusBatch({ entries: pendingBatch }));
    dispatch(setRagStatusFetching(true));

    // Concurrency-capped worker pool. Each worker pulls the next id from
    // the shared cursor and resolves it; finishes when the cursor passes
    // the end. `Promise.allSettled` ensures one bad id doesn't kill the
    // whole batch.
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = cursor;
        cursor += 1;
        if (i >= toFetch.length) return;
        const id = toFetch[i];
        let next: RagStatus = "unknown";
        try {
          const result = await lookupFileDocument(id);
          if (result.kind === "found") next = "indexed";
          else if (result.kind === "absent") next = "not_indexed";
          else next = "unknown";
        } catch {
          next = "unknown";
        }
        dispatch(setRagStatusForFile({ fileId: id, status: next }));
      }
    };

    const workerCount = Math.min(BATCH_CONCURRENCY, toFetch.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i += 1) workers.push(worker());
    await Promise.allSettled(workers);

    dispatch(setRagStatusFetching(false));
  },
);
