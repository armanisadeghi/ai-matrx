/**
 * transcriptsSlice — list-UI state for the /transcripts route family.
 *
 * Replaces the deleted `TranscriptsContext` provider (it wrapped the ENTIRE
 * app from Providers.tsx to serve one route family — pulling supabase +
 * transcriptsService into every authenticated route's graph). State now lives
 * here; fetch/CRUD/realtime live in `./thunks.ts`; components consume via
 * `features/transcripts/hooks/useTranscripts.ts` (same API surface the
 * context had).
 *
 * Transcript CREATION across the app (~20 call sites: studio, scribe,
 * audioChunkJournal, war room…) goes through `transcriptsService` /
 * `studioService` directly and is NOT gated on this slice — this is purely
 * the route's list view state.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ListScope } from "@/lib/list-scope/types";
import type { Transcript } from "../types";

export interface TranscriptsState {
  items: Transcript[];
  isLoading: boolean;
  activeId: string | null;
  initialized: boolean;
  /** VIEW LAW: the declared list scope driving fetches. */
  scope: ListScope;
}

const initialState: TranscriptsState = {
  items: [],
  isLoading: false,
  activeId: null,
  initialized: false,
  scope: { kind: "mine" },
};

const slice = createSlice({
  name: "transcripts",
  initialState,
  reducers: {
    transcriptsInitialized(state) {
      state.initialized = true;
    },
    transcriptsLoadingChanged(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    /**
     * Full-list hydration — ONE batched dispatch per fetch (never per-row).
     * Reconciles the active selection: keep it if still present, fall back to
     * the first item, clear when the list is empty.
     */
    transcriptsFetched(state, action: PayloadAction<Transcript[]>) {
      state.items = action.payload;
      state.isLoading = false;
      const stillThere =
        state.activeId !== null &&
        action.payload.some((t) => t.id === state.activeId);
      if (!stillThere) {
        state.activeId = action.payload.length > 0 ? action.payload[0].id : null;
      }
    },
    activeTranscriptChanged(state, action: PayloadAction<string | null>) {
      state.activeId = action.payload;
    },
    transcriptsScopeChanged(state, action: PayloadAction<ListScope>) {
      state.scope = action.payload;
    },
    /** Prepend a newly created/copied transcript and make it active. */
    transcriptAdded(state, action: PayloadAction<Transcript>) {
      state.items = [action.payload, ...state.items];
      state.activeId = action.payload.id;
    },
    /** Optimistic or server-confirmed single-row merge. */
    transcriptUpserted(state, action: PayloadAction<Transcript>) {
      const idx = state.items.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) state.items[idx] = action.payload;
      else state.items = [action.payload, ...state.items];
    },
    /** Optimistic partial patch (pre-server-response). */
    transcriptPatched(
      state,
      action: PayloadAction<{ id: string; updates: Partial<Transcript> }>,
    ) {
      const idx = state.items.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) {
        state.items[idx] = { ...state.items[idx], ...action.payload.updates };
      }
    },
    transcriptRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload);
      if (state.activeId === action.payload) {
        state.activeId = state.items.length > 0 ? state.items[0].id : null;
      }
    },
  },
});

export const {
  transcriptsInitialized,
  transcriptsLoadingChanged,
  transcriptsFetched,
  activeTranscriptChanged,
  transcriptsScopeChanged,
  transcriptAdded,
  transcriptUpserted,
  transcriptPatched,
  transcriptRemoved,
} = slice.actions;

export default slice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

interface WithTranscripts {
  transcripts: TranscriptsState;
}

export const selectTranscripts = (state: WithTranscripts): Transcript[] =>
  state.transcripts.items;
export const selectTranscriptsLoading = (state: WithTranscripts): boolean =>
  state.transcripts.isLoading;
export const selectTranscriptsInitialized = (state: WithTranscripts): boolean =>
  state.transcripts.initialized;
export const selectTranscriptsScope = (state: WithTranscripts): ListScope =>
  state.transcripts.scope;
export const selectActiveTranscriptId = (
  state: WithTranscripts,
): string | null => state.transcripts.activeId;

export const selectActiveTranscript = createSelector(
  [selectTranscripts, selectActiveTranscriptId],
  (items, activeId): Transcript | null =>
    activeId === null ? null : (items.find((t) => t.id === activeId) ?? null),
);
