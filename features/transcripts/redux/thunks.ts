/**
 * Transcripts list thunks + realtime subscription.
 *
 * The subscription is owned here (module-level channel, started by
 * `initializeTranscripts` on first list mount) — the strategy is the same as
 * the retired context's: any change on `transcripts.transcripts` triggers a
 * list refetch, now DEBOUNCED (500ms trailing) so event bursts (imports,
 * chunked saves, own-write echoes) collapse into one fetch instead of a
 * fetch-per-event storm. Refetch-the-list means there is no stale row merge,
 * so no per-row echo suppression is needed (supabase-realtime skill, Rule 1
 * alternative) — the fetch always returns fresh rows.
 */

import { supabase } from "@/utils/supabase/client";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
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

let channel: ReturnType<typeof supabase.channel> | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function stopRealtime(): void {
  if (refetchTimer) {
    clearTimeout(refetchTimer);
    refetchTimer = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
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
    channel = supabase
      .channel(uniqueChannelTopic("transcripts-changes"))
      .on(
        "postgres_changes",
        { event: "*", schema: "transcripts", table: "transcripts" },
        () => {
          // Debounced list refetch — collapse event bursts into one fetch.
          if (refetchTimer) clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => {
            refetchTimer = null;
            void dispatch(fetchTranscripts());
          }, 500);
        },
      )
      .subscribe();
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
