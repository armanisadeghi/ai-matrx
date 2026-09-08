/**
 * Transcripts list thunks + realtime subscription.
 *
 * The subscription is owned here (started by `initializeTranscripts` on first
 * list mount): any change on `transcripts.transcripts` triggers a list refetch,
 * DEBOUNCED (500ms trailing) so event bursts (imports, chunked saves) collapse
 * into one fetch instead of a fetch-per-event storm. Refetch-the-list means
 * there is no stale row merge, so no per-row state reconciliation is needed —
 * the fetch always returns fresh rows.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel — echo suppression, dedup,
 * the decoupled ordered handler queue, jittered reconnect with the stability
 * reset, tab sleep, diagnostics. What was here was a module-level
 * `.channel(...).subscribe()`, its own `removeChannel` teardown, and NO catch-up
 * read: a transcript created on another device while this tab slept never
 * appeared, and the list looked perfectly healthy. `onBackfill` is that fix.
 *
 * These are thunks, not components, so the manager arrives through the
 * package's ambient door (`subscribeToRealtimeManager`, realtime 0.6.0) — never
 * a second manager, which would be a second write ledger.
 */

import {
  defineChannelNamespace,
  subscribeToRealtimeManager,
} from "@ai-matrx/realtime";
import type { AppThunk } from "@/lib/redux/store";
import type { ListScope } from "@/lib/list-scope/types";
import type {
  CreateTranscriptInput,
  Transcript,
  UpdateTranscriptInput,
} from "../types";
import * as transcriptsService from "../service/transcriptsService";
import {
  activeTranscriptChanged,
  selectTranscriptsInitialized,
  transcriptAdded,
  transcriptPatched,
  transcriptRemoved,
  transcriptUpserted,
  transcriptsFetched,
  transcriptsInitialized,
  transcriptsLoadingChanged,
  transcriptsScopeChanged,
} from "./transcriptsSlice";

// ── Realtime channel (module singleton) ─────────────────────────────────────

/** One place names this channel. A second, different declaration throws. */
const transcriptsChannel = defineChannelNamespace({
  namespace: "transcripts",
  parts: [],
  description: "transcripts.transcripts rows visible to this user",
});

let stopChannel: (() => void) | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function stopRealtime(): void {
  if (refetchTimer) {
    clearTimeout(refetchTimer);
    refetchTimer = null;
  }
  if (stopChannel) {
    stopChannel();
    stopChannel = null;
  }
}

// ── Thunks ───────────────────────────────────────────────────────────────────

export const fetchTranscripts = (): AppThunk<Promise<void>> => {
  return async (dispatch, getState) => {
    try {
      dispatch(transcriptsLoadingChanged(true));
      const scope = getState().transcripts.scope;
      const data = await transcriptsService.fetchTranscripts(scope);
      // ONE batched dispatch for the whole list (never per-row).
      dispatch(transcriptsFetched(data));
    } catch (error) {
      console.error("Error fetching transcripts:", error);
      dispatch(transcriptsLoadingChanged(false));
    }
  };
};

/**
 * First-mount initialization: fetch the list and open the realtime channel.
 * Idempotent — the list layout calls this on every mount.
 */
export const initializeTranscripts = (): AppThunk => {
  return (dispatch, getState) => {
    if (selectTranscriptsInitialized(getState())) return;
    dispatch(transcriptsInitialized());
    void dispatch(fetchTranscripts());

    stopRealtime();
    // Debounced list refetch — collapse event bursts into one fetch.
    const refetchSoon = (): void => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        refetchTimer = null;
        void dispatch(fetchTranscripts());
      }, 500);
    };
    stopChannel = subscribeToRealtimeManager(() => ({
      topic: transcriptsChannel.topic(),
      postgresChanges: [
        {
          // No owner filter: RLS gates delivery, so shared-with-me transcripts
          // arrive too.
          event: "*",
          schema: "transcripts",
          table: "transcripts",
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: (row) => String(row.updated_at ?? ""),
          onChange: refetchSoon,
        },
      ],
      // Realtime has no replay. Reconnect, tab wake, network restore and queue
      // overflow all land here — the list is one read away from correct.
      onBackfill: refetchSoon,
    }));
  };
};

/** Change the declared list scope (VIEW LAW) and refetch under it. */
export const setTranscriptsScope = (scope: ListScope): AppThunk => {
  return (dispatch, getState) => {
    dispatch(transcriptsScopeChanged(scope));
    if (selectTranscriptsInitialized(getState())) {
      void dispatch(fetchTranscripts());
    }
  };
};

export const createTranscript = (
  input: CreateTranscriptInput,
): AppThunk<Promise<Transcript>> => {
  return async (dispatch) => {
    const created = await transcriptsService.createTranscript(input);
    dispatch(transcriptAdded(created));
    return created;
  };
};

export const updateTranscript = (
  id: string,
  updates: UpdateTranscriptInput,
): AppThunk<Promise<void>> => {
  return async (dispatch) => {
    // Optimistic patch for immediate UI, then merge the server row.
    dispatch(transcriptPatched({ id, updates: updates as Partial<Transcript> }));
    const updated = await transcriptsService.updateTranscript(id, updates);
    dispatch(transcriptUpserted(updated));
  };
};

export const deleteTranscript = (id: string): AppThunk<Promise<void>> => {
  return async (dispatch) => {
    await transcriptsService.deleteTranscript(id);
    dispatch(transcriptRemoved(id));
  };
};

export const copyTranscript = (id: string): AppThunk<Promise<void>> => {
  return async (dispatch) => {
    const copied = await transcriptsService.copyTranscript(id);
    dispatch(transcriptAdded(copied));
  };
};

export const setActiveTranscript = (
  transcript: Transcript | null,
): AppThunk => {
  return (dispatch, getState) => {
    // Tolerate objects not yet in the list (deep links): upsert then select.
    if (transcript) {
      const inList = getState().transcripts.items.some(
        (t) => t.id === transcript.id,
      );
      if (!inList) dispatch(transcriptUpserted(transcript));
    }
    dispatch(activeTranscriptChanged(transcript?.id ?? null));
  };
};
