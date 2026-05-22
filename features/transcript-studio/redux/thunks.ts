/**
 * features/transcript-studio/redux/thunks.ts
 *
 * Async thunks bridging the studio slice and Supabase via studioService.
 * Phase 1 covers session-level CRUD only.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import type { ChunkCompleteInfo } from "@/features/audio/hooks/useChunkedRecordAndTranscribe";
import {
  createSession,
  deleteCleanedSegment,
  deleteConceptItem,
  deleteModuleSegment,
  deleteRawSegment,
  deleteRecordingSegment,
  fetchSessionSettings,
  getOrCreateWorkingDocument,
  insertRawSegment,
  insertRecordingSegment,
  listCleanedSegments,
  listConceptItems,
  listModuleSegments,
  listRawSegments,
  listRecordingSegments,
  listSessions,
  listStudioDocuments,
  listUnsortedRecordingSegments,
  setRecordingSegmentState,
  softDeleteSession,
  updateCleanedSegmentText,
  updateConceptItem,
  updateModuleSegmentPayload,
  updateRawSegmentText,
  updateRecordingSegment,
  updateSession,
  updateStudioDocumentContent,
  upsertSessionSettings,
  type ConceptItemPatch,
  type UpsertSessionSettingsInput,
} from "../service/studioService";
import type {
  CleanedSegment,
  ConceptItem,
  CreateSessionInput,
  ModuleSegment,
  RawSegment,
  RecordingSegment,
  SessionSettings,
  StudioDocument,
  StudioSession,
  UpdateSessionInput,
} from "../types";
import { audioSafetyStore } from "@/features/audio/services/audioSafetyStore";
import { saveAudioToStorage } from "@/features/transcripts/service/audioStorageService";
import { getUserId } from "@/utils/auth/getUserId";
import {
  activeSessionIdSet,
  cleanedSegmentRemoved,
  cleanedSegmentUpdated,
  cleanedSegmentsLoaded,
  conceptItemRemoved,
  conceptItemUpdated,
  conceptsLoaded,
  moduleSegmentRemoved,
  moduleSegmentUpdated,
  moduleSegmentsLoaded,
  moduleSwitched,
  rawSegmentRemoved,
  rawSegmentUpdated,
  rawSegmentsAppended,
  rawSegmentsLoaded,
  recordingSegmentRemoved,
  recordingSegmentUpserted,
  recordingSegmentsLoaded,
  unsortedRecordingsLoaded,
  sessionRemoved,
  sessionSettingsLoaded,
  sessionsListFailed,
  sessionsListLoaded,
  sessionsListLoading,
  sessionUpserted,
  studioDocumentUpserted,
  studioDocumentsLoaded,
} from "./slice";

interface CreateSessionThunkArg extends CreateSessionInput {
  /** auth.users.id of the caller — passed in to avoid an extra fetch in the thunk. */
  userId: string;
  /** When true, sets the new session as active immediately. */
  activate?: boolean;
}

export const fetchSessionsThunk = createAsyncThunk<StudioSession[], void>(
  "transcriptStudio/fetchSessions",
  async (_, { dispatch, rejectWithValue }) => {
    dispatch(sessionsListLoading());
    try {
      const sessions = await listSessions();
      dispatch(sessionsListLoaded(sessions));
      return sessions;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load sessions";
      dispatch(sessionsListFailed(message));
      return rejectWithValue(message);
    }
  },
);

export const createSessionThunk = createAsyncThunk<
  StudioSession,
  CreateSessionThunkArg
>(
  "transcriptStudio/createSession",
  async (arg, { dispatch, rejectWithValue }) => {
    try {
      const { userId, activate, ...input } = arg;
      const session = await createSession(input, userId);
      dispatch(sessionUpserted(session));
      if (activate) dispatch(activeSessionIdSet(session.id));
      return session;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create session";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const updateSessionThunk = createAsyncThunk<
  StudioSession,
  { id: string; patch: UpdateSessionInput }
>(
  "transcriptStudio/updateSession",
  async ({ id, patch }, { dispatch, rejectWithValue }) => {
    try {
      const session = await updateSession(id, patch);
      dispatch(sessionUpserted(session));
      return session;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update session";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteSessionThunk = createAsyncThunk<string, string>(
  "transcriptStudio/deleteSession",
  async (id, { dispatch, rejectWithValue }) => {
    try {
      await softDeleteSession(id);
      dispatch(sessionRemoved(id));
      return id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete session";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

// ── Recording lifecycle ──────────────────────────────────────────────

export const startSessionRecordingThunk = createAsyncThunk<
  StudioSession,
  { id: string }
>(
  "transcriptStudio/startSessionRecording",
  async ({ id }, { dispatch, rejectWithValue }) => {
    try {
      const session = await updateSession(id, {
        status: "recording",
      });
      dispatch(sessionUpserted(session));
      return session;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mark session recording";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const stopSessionRecordingThunk = createAsyncThunk<
  StudioSession,
  { id: string; totalDurationMs: number }
>(
  "transcriptStudio/stopSessionRecording",
  async ({ id, totalDurationMs }, { dispatch, rejectWithValue }) => {
    try {
      const session = await updateSession(id, {
        status: "stopped",
        endedAt: new Date().toISOString(),
        totalDurationMs,
      });
      dispatch(sessionUpserted(session));
      return session;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to stop session";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const fetchRawSegmentsThunk = createAsyncThunk<
  RawSegment[],
  { sessionId: string }
>(
  "transcriptStudio/fetchRawSegments",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const segments = await listRawSegments(sessionId);
      dispatch(rawSegmentsLoaded({ sessionId, segments }));
      return segments;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load raw segments";
      return rejectWithValue(message);
    }
  },
);

export const fetchCleanedSegmentsThunk = createAsyncThunk<
  CleanedSegment[],
  { sessionId: string }
>(
  "transcriptStudio/fetchCleanedSegments",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const segments = await listCleanedSegments(sessionId);
      dispatch(cleanedSegmentsLoaded({ sessionId, segments }));
      return segments;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load cleaned segments";
      return rejectWithValue(message);
    }
  },
);

/**
 * Persist a single chunk's transcription as a raw segment. Called once per
 * `onChunkComplete` from the global recording provider. Append-only: never
 * patches existing rows. Surface errors quietly via toast — losing one
 * chunk to a transient network blip should not abort the recording.
 */
// Re-export per-column pipelines so callers don't have to know which file
// each thunk lives in. The implementations live in dedicated files to keep
// this file focused on session + raw CRUD.
export { runCleaningPassThunk } from "./runCleaningPass.thunk";
export type { RunCleaningPassResult } from "./runCleaningPass.thunk";
export { runConceptPassThunk } from "./runConceptPass.thunk";
export type { RunConceptPassResult } from "./runConceptPass.thunk";
export { runModulePassThunk } from "./runModulePass.thunk";
export type { RunModulePassResult } from "./runModulePass.thunk";

export const fetchModuleSegmentsThunk = createAsyncThunk<
  ModuleSegment[],
  { sessionId: string }
>(
  "transcriptStudio/fetchModuleSegments",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const segments = await listModuleSegments(sessionId);
      dispatch(moduleSegmentsLoaded({ sessionId, segments }));
      return segments;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load module segments";
      return rejectWithValue(message);
    }
  },
);

// ── Session settings (Phase 8) ────────────────────────────────────────

export const fetchSessionSettingsThunk = createAsyncThunk<
  SessionSettings | null,
  { sessionId: string }
>(
  "transcriptStudio/fetchSessionSettings",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const settings = await fetchSessionSettings(sessionId);
      if (settings) {
        dispatch(sessionSettingsLoaded({ sessionId, settings }));
      }
      return settings;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load session settings";
      return rejectWithValue(message);
    }
  },
);

/**
 * Upsert per-session settings. Optimistically writes the supplied patch
 * into Redux first (so the UI reflects the change immediately), then
 * persists to Supabase. On failure we surface a toast and refetch to
 * restore the canonical state.
 */
export const updateSessionSettingsThunk = createAsyncThunk<
  SessionSettings,
  Omit<UpsertSessionSettingsInput, "sessionId"> & { sessionId: string }
>(
  "transcriptStudio/updateSessionSettings",
  async (input, { dispatch, rejectWithValue }) => {
    try {
      const settings = await upsertSessionSettings(input);
      dispatch(
        sessionSettingsLoaded({ sessionId: input.sessionId, settings }),
      );
      // Mid-session module switch: also flip the session row's moduleId so
      // Column 4 swaps without losing prior segments.
      if (input.moduleId !== undefined) {
        dispatch(
          moduleSwitched({
            sessionId: input.sessionId,
            moduleId: input.moduleId,
          }),
        );
      }
      return settings;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update settings";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const fetchConceptItemsThunk = createAsyncThunk<
  ConceptItem[],
  { sessionId: string }
>(
  "transcriptStudio/fetchConceptItems",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const items = await listConceptItems(sessionId);
      dispatch(conceptsLoaded({ sessionId, items }));
      return items;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load concept items";
      return rejectWithValue(message);
    }
  },
);

export const ingestRawChunkThunk = createAsyncThunk<
  RawSegment,
  {
    sessionId: string;
    info: ChunkCompleteInfo;
    /** Links the chunk to its start→stop recording cycle (the mobile card). */
    recordingSegmentId?: string | null;
  }
>(
  "transcriptStudio/ingestRawChunk",
  async (
    { sessionId, info, recordingSegmentId },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const segment = await insertRawSegment({
        sessionId,
        recordingSegmentId: recordingSegmentId ?? null,
        chunkIndex: info.chunkIndex,
        tStart: info.tStart,
        tEnd: info.tEnd,
        text: info.text,
        source: "chunk",
      });
      dispatch(rawSegmentsAppended({ sessionId, segments: [segment] }));
      return segment;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to persist transcription chunk";
      // Toast quietly; recording continues.
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

// ── Recording segments (mobile cards) ────────────────────────────────

export const fetchRecordingSegmentsThunk = createAsyncThunk<
  RecordingSegment[],
  { sessionId: string }
>(
  "transcriptStudio/fetchRecordingSegments",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const segments = await listRecordingSegments(sessionId);
      dispatch(recordingSegmentsLoaded({ sessionId, segments }));
      return segments;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load recording segments";
      return rejectWithValue(message);
    }
  },
);

/**
 * Open a recording cycle. Inserts a `studio_recording_segments` row at the
 * given session-relative start time and returns it so the caller can stamp
 * every raw chunk for this cycle with `recordingSegmentId`.
 */
export const startRecordingSegmentThunk = createAsyncThunk<
  RecordingSegment,
  { sessionId: string; segmentIndex: number; tStart: number }
>(
  "transcriptStudio/startRecordingSegment",
  async (
    { sessionId, segmentIndex, tStart },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const segment = await insertRecordingSegment({
        sessionId,
        segmentIndex,
        tStart,
        startedAt: new Date().toISOString(),
      });
      dispatch(recordingSegmentUpserted({ sessionId, segment }));
      return segment;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to start recording segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

/**
 * Close a recording cycle: assemble its audio from the crash-safe IndexedDB
 * entry, upload it durably, and write the resulting fileId onto the segment so
 * each card becomes independently playable. The blob is already in IndexedDB
 * before this runs, so a failed upload never loses audio — the orphan
 * reconcile retries it on next session load.
 */
export const finalizeRecordingSegmentThunk = createAsyncThunk<
  RecordingSegment | null,
  {
    sessionId: string;
    recordingSegmentId: string;
    /** Full assembled recording captured at completion (preferred source). */
    audioBlob?: Blob | null;
    /** Fallback: reassemble from the crash-safe IndexedDB entry. */
    safetyId: string | null;
    tEnd: number;
  }
>(
  "transcriptStudio/finalizeRecordingSegment",
  async (
    { sessionId, recordingSegmentId, audioBlob, safetyId, tEnd },
    { dispatch, rejectWithValue },
  ) => {
    // Step 1 — upload the audio (best-effort). A failure here must NOT prevent
    // finalizing the row: the transcript is already saved, and we still want
    // the card to leave its "processing" state. Prefer the in-memory blob;
    // fall back to the IndexedDB copy.
    let audioPath: string | null = null;
    try {
      let blob: Blob | null = audioBlob ?? null;
      if ((!blob || blob.size === 0) && safetyId) {
        blob = await audioSafetyStore.getAudioBlob(safetyId);
      }
      if (blob && blob.size > 0) {
        const userId = getUserId();
        if (userId) {
          const upload = await saveAudioToStorage(blob, userId, undefined, 5);
          audioPath = upload.fileId;
        }
      }
    } catch (err) {
      // Audio is still safe in IndexedDB; surface quietly and continue.
      // eslint-disable-next-line no-console
      console.error("[studio] recording audio upload failed:", err);
    }

    // Step 2 — always finalize the row (tEnd/endedAt), with audioPath when ready.
    try {
      const segment = await updateRecordingSegment(recordingSegmentId, {
        tEnd,
        endedAt: new Date().toISOString(),
        ...(audioPath ? { audioPath } : {}),
      });
      dispatch(recordingSegmentUpserted({ sessionId, segment }));
      return segment;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to finalize recording segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteRecordingSegmentThunk = createAsyncThunk<
  void,
  { sessionId: string; recordingSegmentId: string }
>(
  "transcriptStudio/deleteRecordingSegment",
  async (
    { sessionId, recordingSegmentId },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      // Optimistically remove the card and its raw chunks from Redux.
      const root = getState() as {
        transcriptStudio: {
          rawIdsBySession: Record<string, string[]>;
          rawById: Record<string, Record<string, RawSegment>>;
        };
      };
      const rawIds = root.transcriptStudio.rawIdsBySession[sessionId] ?? [];
      const rawById = root.transcriptStudio.rawById[sessionId] ?? {};
      const ownedRawIds = rawIds.filter(
        (id) => rawById[id]?.recordingSegmentId === recordingSegmentId,
      );
      dispatch(
        recordingSegmentRemoved({ sessionId, segmentId: recordingSegmentId }),
      );
      for (const rawId of ownedRawIds) {
        dispatch(rawSegmentRemoved({ sessionId, segmentId: rawId }));
      }
      await deleteRecordingSegment(recordingSegmentId);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to delete recording";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

// ── Archive (in-place) / Unsort (detach to global pool) ──────────────

export const archiveRecordingThunk = createAsyncThunk<
  void,
  { sessionId: string; recordingSegmentId: string; archived: boolean }
>(
  "transcriptStudio/archiveRecording",
  async (
    { sessionId, recordingSegmentId, archived },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const segment = await setRecordingSegmentState(recordingSegmentId, {
        archivedAt: archived ? new Date().toISOString() : null,
      });
      dispatch(recordingSegmentUpserted({ sessionId, segment }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to archive recording";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

/** Detach a recording from its session into the global Unsorted pool. */
export const detachRecordingThunk = createAsyncThunk<
  void,
  { sessionId: string; recordingSegmentId: string }
>(
  "transcriptStudio/detachRecording",
  async ({ sessionId, recordingSegmentId }, { dispatch, rejectWithValue }) => {
    try {
      const segment = await setRecordingSegmentState(recordingSegmentId, {
        detachedAt: new Date().toISOString(),
      });
      dispatch(recordingSegmentUpserted({ sessionId, segment }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove recording";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

/** Restore an Unsorted recording back to its original session. */
export const restoreRecordingThunk = createAsyncThunk<
  void,
  { recordingSegmentId: string }
>(
  "transcriptStudio/restoreRecording",
  async ({ recordingSegmentId }, { dispatch, rejectWithValue }) => {
    try {
      const segment = await setRecordingSegmentState(recordingSegmentId, {
        detachedAt: null,
      });
      dispatch(
        recordingSegmentUpserted({ sessionId: segment.sessionId, segment }),
      );
      // Refresh the Unsorted pool so the restored row drops out of it.
      await dispatch(fetchUnsortedRecordingsThunk());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restore recording";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const fetchUnsortedRecordingsThunk = createAsyncThunk<
  RecordingSegment[],
  void
>(
  "transcriptStudio/fetchUnsortedRecordings",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const userId = getUserId();
      if (!userId) return [];
      const segments = await listUnsortedRecordingSegments(userId);
      dispatch(unsortedRecordingsLoaded({ segments }));
      return segments;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load Unsorted";
      return rejectWithValue(message);
    }
  },
);

// ── Working document (studio_documents) ──────────────────────────────

export const fetchStudioDocumentsThunk = createAsyncThunk<
  StudioDocument[],
  { sessionId: string }
>(
  "transcriptStudio/fetchStudioDocuments",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const documents = await listStudioDocuments(sessionId);
      dispatch(studioDocumentsLoaded({ sessionId, documents }));
      return documents;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load documents";
      return rejectWithValue(message);
    }
  },
);

export const ensureWorkingDocumentThunk = createAsyncThunk<
  StudioDocument,
  { sessionId: string }
>(
  "transcriptStudio/ensureWorkingDocument",
  async ({ sessionId }, { dispatch, rejectWithValue }) => {
    try {
      const document = await getOrCreateWorkingDocument(sessionId);
      dispatch(studioDocumentUpserted({ sessionId, document }));
      return document;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to prepare working document";
      return rejectWithValue(message);
    }
  },
);

/** Direct user edit of the working document content (Focused Mode editor). */
export const updateWorkingDocumentContentThunk = createAsyncThunk<
  void,
  { sessionId: string; documentId: string; content: string }
>(
  "transcriptStudio/updateWorkingDocumentContent",
  async ({ sessionId, documentId, content }, { dispatch, rejectWithValue }) => {
    try {
      const document = await updateStudioDocumentContent(documentId, content);
      dispatch(studioDocumentUpserted({ sessionId, document }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save document";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

// ── Per-row edit / delete thunks ────────────────────────────────────
//
// Each thunk does an optimistic update first, persists, and reverts on
// error. The reducers (`*Updated` / `*Removed`) are idempotent, so the
// realtime middleware echoing the same change is harmless.

export const updateRawSegmentTextThunk = createAsyncThunk<
  RawSegment,
  { sessionId: string; segmentId: string; text: string }
>(
  "transcriptStudio/updateRawSegmentText",
  async ({ sessionId, segmentId, text }, { dispatch, rejectWithValue }) => {
    try {
      const updated = await updateRawSegmentText(segmentId, text);
      dispatch(rawSegmentUpdated({ sessionId, segment: updated }));
      return updated;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update raw segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteRawSegmentThunk = createAsyncThunk<
  void,
  { sessionId: string; segmentId: string }
>(
  "transcriptStudio/deleteRawSegment",
  async ({ sessionId, segmentId }, { dispatch, rejectWithValue }) => {
    try {
      dispatch(rawSegmentRemoved({ sessionId, segmentId }));
      await deleteRawSegment(segmentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete raw segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const updateCleanedSegmentTextThunk = createAsyncThunk<
  CleanedSegment,
  { sessionId: string; segmentId: string; text: string }
>(
  "transcriptStudio/updateCleanedSegmentText",
  async ({ sessionId, segmentId, text }, { dispatch, rejectWithValue }) => {
    try {
      const updated = await updateCleanedSegmentText(segmentId, text);
      dispatch(cleanedSegmentUpdated({ sessionId, segment: updated }));
      return updated;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to update cleaned segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteCleanedSegmentThunk = createAsyncThunk<
  void,
  { sessionId: string; segmentId: string }
>(
  "transcriptStudio/deleteCleanedSegment",
  async ({ sessionId, segmentId }, { dispatch, rejectWithValue }) => {
    try {
      dispatch(cleanedSegmentRemoved({ sessionId, segmentId }));
      await deleteCleanedSegment(segmentId);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to delete cleaned segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const updateConceptItemThunk = createAsyncThunk<
  ConceptItem,
  { sessionId: string; itemId: string; patch: ConceptItemPatch }
>(
  "transcriptStudio/updateConceptItem",
  async ({ sessionId, itemId, patch }, { dispatch, rejectWithValue }) => {
    try {
      const updated = await updateConceptItem(itemId, patch);
      dispatch(conceptItemUpdated({ sessionId, item: updated }));
      return updated;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update concept";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteConceptItemThunk = createAsyncThunk<
  void,
  { sessionId: string; itemId: string }
>(
  "transcriptStudio/deleteConceptItem",
  async ({ sessionId, itemId }, { dispatch, rejectWithValue }) => {
    try {
      dispatch(conceptItemRemoved({ sessionId, itemId }));
      await deleteConceptItem(itemId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete concept";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const updateModuleSegmentPayloadThunk = createAsyncThunk<
  ModuleSegment,
  { sessionId: string; segmentId: string; payload: unknown }
>(
  "transcriptStudio/updateModuleSegmentPayload",
  async ({ sessionId, segmentId, payload }, { dispatch, rejectWithValue }) => {
    try {
      const updated = await updateModuleSegmentPayload(segmentId, payload);
      dispatch(moduleSegmentUpdated({ sessionId, segment: updated }));
      return updated;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update module segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

export const deleteModuleSegmentThunk = createAsyncThunk<
  void,
  { sessionId: string; segmentId: string }
>(
  "transcriptStudio/deleteModuleSegment",
  async ({ sessionId, segmentId }, { dispatch, rejectWithValue }) => {
    try {
      dispatch(moduleSegmentRemoved({ sessionId, segmentId }));
      await deleteModuleSegment(segmentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete module segment";
      toast.error(message);
      return rejectWithValue(message);
    }
  },
);

