"use client";

/**
 * useTranscripts — the /transcripts route family's list API.
 *
 * Same surface the deleted `TranscriptsContext` provided, backed by Redux
 * (`features/transcripts/redux/transcriptsSlice.ts` + thunks). No provider,
 * no tree position requirement — any component under the store can use it.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { ListScope } from "@/lib/list-scope/types";
import type {
  CreateTranscriptInput,
  Transcript,
  UpdateTranscriptInput,
} from "../types";
import {
  selectActiveTranscript,
  selectTranscripts,
  selectTranscriptsInitialized,
  selectTranscriptsLoading,
  selectTranscriptsScope,
} from "../redux/transcriptsSlice";
import {
  copyTranscript as copyTranscriptThunk,
  createTranscript as createTranscriptThunk,
  deleteTranscript as deleteTranscriptThunk,
  fetchTranscripts,
  initializeTranscripts,
  setActiveTranscript as setActiveTranscriptThunk,
  setTranscriptsScope,
  updateTranscript as updateTranscriptThunk,
} from "../redux/thunks";

export interface UseTranscriptsApi {
  transcripts: Transcript[];
  isLoading: boolean;
  activeTranscript: Transcript | null;
  setActiveTranscript: (transcript: Transcript | null) => void;
  createTranscript: (input: CreateTranscriptInput) => Promise<Transcript>;
  updateTranscript: (id: string, updates: UpdateTranscriptInput) => Promise<void>;
  deleteTranscript: (id: string) => Promise<void>;
  copyTranscript: (id: string) => Promise<void>;
  refreshTranscripts: () => Promise<void>;
  initialize: () => void;
  initialized: boolean;
  /** VIEW LAW: the declared list scope driving fetches. */
  scope: ListScope;
  setScope: (scope: ListScope) => void;
}

export function useTranscripts(): UseTranscriptsApi {
  const dispatch = useAppDispatch();
  const transcripts = useAppSelector(selectTranscripts);
  const isLoading = useAppSelector(selectTranscriptsLoading);
  const activeTranscript = useAppSelector(selectActiveTranscript);
  const initialized = useAppSelector(selectTranscriptsInitialized);
  const scope = useAppSelector(selectTranscriptsScope);

  return {
    transcripts,
    isLoading,
    activeTranscript,
    initialized,
    scope,
    setActiveTranscript: (transcript) =>
      dispatch(setActiveTranscriptThunk(transcript)),
    createTranscript: (input) => dispatch(createTranscriptThunk(input)),
    updateTranscript: (id, updates) =>
      dispatch(updateTranscriptThunk(id, updates)),
    deleteTranscript: (id) => dispatch(deleteTranscriptThunk(id)),
    copyTranscript: (id) => dispatch(copyTranscriptThunk(id)),
    refreshTranscripts: () => dispatch(fetchTranscripts()),
    initialize: () => dispatch(initializeTranscripts()),
    setScope: (next) => dispatch(setTranscriptsScope(next)),
  };
}
