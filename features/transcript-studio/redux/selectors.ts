/**
 * features/transcript-studio/redux/selectors.ts
 *
 * Memoized selectors for the transcript studio.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  CleanedSegment,
  RawSegment,
  RecordingSegment,
  StudioDocument,
  StudioSession,
} from "../types";

const selectScope = (state: RootState) => state.transcriptStudio;

export const selectFetchStatus = (state: RootState) =>
  state.transcriptStudio.fetchStatus;

export const selectFetchError = (state: RootState) =>
  state.transcriptStudio.fetchError;

export const selectActiveSessionId = (state: RootState) =>
  state.transcriptStudio.activeSessionId;

export const selectSessionsById = (state: RootState) =>
  state.transcriptStudio.byId;

export const selectAllSessions = createSelector(
  selectSessionsById,
  (byId): StudioSession[] =>
    Object.values(byId).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
);

export const selectSessionById = (id: string | null) =>
  createSelector(selectSessionsById, (byId) =>
    id ? (byId[id] ?? null) : null,
  );

export const selectActiveSession = createSelector(
  [selectSessionsById, selectActiveSessionId],
  (byId, activeId) => (activeId ? (byId[activeId] ?? null) : null),
);

export const selectSessionUi = (id: string | null) => (state: RootState) =>
  id ? (state.transcriptStudio.ui[id] ?? null) : null;

export const selectActiveSessionUi = (state: RootState) => {
  const id = state.transcriptStudio.activeSessionId;
  return id ? (state.transcriptStudio.ui[id] ?? null) : null;
};

export const selectCursorTime =
  (sessionId: string | null) =>
  (state: RootState): number => {
    if (!sessionId) return 0;
    return state.transcriptStudio.ui[sessionId]?.cursorTime ?? 0;
  };

export const selectLeaderColumn =
  (sessionId: string | null) => (state: RootState) => {
    if (!sessionId) return null;
    return state.transcriptStudio.ui[sessionId]?.leaderColumn ?? null;
  };

// ── Raw segments ────────────────────────────────────────────────────

const EMPTY_RAW: RawSegment[] = [];

/**
 * Memoize the materialized array per (idsList, byIdMap) reference pair so
 * `useAppSelector` returns the same reference across renders when nothing
 * changed. We can't reuse `createSelector` here because each call to
 * `selectRawSegments(sessionId)` would otherwise need its own instance,
 * which causes subscription tearing in React 19.
 */
const rawSegmentsCache = new WeakMap<
  ReadonlyArray<string>,
  { byId: Record<string, RawSegment>; result: RawSegment[] }
>();

export function selectRawSegments(sessionId: string | null) {
  return (state: RootState): RawSegment[] => {
    if (!sessionId) return EMPTY_RAW;
    const ids = state.transcriptStudio.rawIdsBySession[sessionId];
    const byId = state.transcriptStudio.rawById[sessionId];
    if (!ids || !byId) return EMPTY_RAW;

    const cached = rawSegmentsCache.get(ids);
    if (cached && cached.byId === byId) return cached.result;

    const result: RawSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg) result.push(seg);
    }
    rawSegmentsCache.set(ids, { byId, result });
    return result;
  };
}

export const selectRawSegmentCount =
  (sessionId: string | null) =>
  (state: RootState): number => {
    if (!sessionId) return 0;
    return state.transcriptStudio.rawIdsBySession[sessionId]?.length ?? 0;
  };

// ── Cleaned segments ────────────────────────────────────────────────

const EMPTY_CLEANED: CleanedSegment[] = [];

const cleanedSegmentsCache = new WeakMap<
  ReadonlyArray<string>,
  { byId: Record<string, CleanedSegment>; result: CleanedSegment[] }
>();

export function selectCleanedSegments(sessionId: string | null) {
  return (state: RootState): CleanedSegment[] => {
    if (!sessionId) return EMPTY_CLEANED;
    const ids = state.transcriptStudio.cleanedIdsBySession[sessionId];
    const byId = state.transcriptStudio.cleanedById[sessionId];
    if (!ids || !byId) return EMPTY_CLEANED;
    const cached = cleanedSegmentsCache.get(ids);
    if (cached && cached.byId === byId) return cached.result;
    const result: CleanedSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg) result.push(seg);
    }
    cleanedSegmentsCache.set(ids, { byId, result });
    return result;
  };
}

/**
 * The active cleaned segment for a single recording (recording-aligned model),
 * or null if that recording hasn't been cleaned yet. Returns the latest
 * (highest passIndex) when more than one is somehow active. The returned object
 * is a stable reference from the cleaned list, so it is safe for useAppSelector.
 */
export function selectCleanedSegmentForRecording(
  sessionId: string | null,
  recordingSegmentId: string | null,
) {
  return (state: RootState): CleanedSegment | null => {
    if (!sessionId || !recordingSegmentId) return null;
    const cleaned = selectCleanedSegments(sessionId)(state);
    let best: CleanedSegment | null = null;
    for (const c of cleaned) {
      if (c.recordingSegmentId !== recordingSegmentId) continue;
      if (c.processorKey !== "clean") continue;
      if (!best || c.passIndex > best.passIndex) best = c;
    }
    return best;
  };
}

/**
 * Full-session cleaned transcript = ordered concatenation of all active cleaned
 * segments (recording-aligned, by tStart). This is the single source of truth
 * for "all clean" — there is no separate monolithic clean document. Returns a
 * primitive string, so it is reference-stable for useAppSelector.
 */
export function selectSessionCleanedText(sessionId: string | null) {
  return (state: RootState): string => {
    if (!sessionId) return "";
    return [...selectCleanedSegments(sessionId)(state)]
      .filter((c) => c.processorKey === "clean")
      .sort((a, b) => a.tStart - b.tStart)
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
  };
}

/**
 * Full-session raw transcript = all raw chunks across recordings, in order.
 * Primitive string return → reference-stable for useAppSelector.
 */
export function selectSessionRawText(sessionId: string | null) {
  return (state: RootState): string => {
    if (!sessionId) return "";
    return selectRawSegments(sessionId)(state)
      .map((r) => r.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  };
}

// ── Recording segments (mobile cards) ───────────────────────────────

const EMPTY_RECORDING: RecordingSegment[] = [];

const recordingSegmentsCache = new WeakMap<
  ReadonlyArray<string>,
  { byId: Record<string, RecordingSegment>; result: RecordingSegment[] }
>();

/**
 * Active recordings for a session — the main card list. Excludes archived and
 * detached ("unsorted") recordings so the list, the assistant context, and the
 * cleaned passes all see only what's actually in the session.
 */
export function selectRecordingSegments(sessionId: string | null) {
  return (state: RootState): RecordingSegment[] => {
    if (!sessionId) return EMPTY_RECORDING;
    const ids = state.transcriptStudio.recordingSegmentIdsBySession[sessionId];
    const byId = state.transcriptStudio.recordingSegmentsById[sessionId];
    if (!ids || !byId) return EMPTY_RECORDING;
    const cached = recordingSegmentsCache.get(ids);
    if (cached && cached.byId === byId) return cached.result;
    const result: RecordingSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg && !seg.archivedAt && !seg.detachedAt) result.push(seg);
    }
    recordingSegmentsCache.set(ids, { byId, result });
    return result;
  };
}

const archivedRecordingsCache = new WeakMap<
  ReadonlyArray<string>,
  { byId: Record<string, RecordingSegment>; result: RecordingSegment[] }
>();

/** Archived (in-place) recordings for a session — the session's Archived view. */
export function selectArchivedRecordingSegments(sessionId: string | null) {
  return (state: RootState): RecordingSegment[] => {
    if (!sessionId) return EMPTY_RECORDING;
    const ids = state.transcriptStudio.recordingSegmentIdsBySession[sessionId];
    const byId = state.transcriptStudio.recordingSegmentsById[sessionId];
    if (!ids || !byId) return EMPTY_RECORDING;
    const cached = archivedRecordingsCache.get(ids);
    if (cached && cached.byId === byId) return cached.result;
    const result: RecordingSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg && seg.archivedAt && !seg.detachedAt) result.push(seg);
    }
    archivedRecordingsCache.set(ids, { byId, result });
    return result;
  };
}

export const selectRecordingSegmentCount =
  (sessionId: string | null) =>
  (state: RootState): number =>
    selectRecordingSegments(sessionId)(state).length;

export const selectArchivedRecordingCount =
  (sessionId: string | null) =>
  (state: RootState): number =>
    selectArchivedRecordingSegments(sessionId)(state).length;

const unsortedCache = new WeakMap<
  ReadonlyArray<string>,
  { byId: Record<string, RecordingSegment>; result: RecordingSegment[] }
>();

/** Global Unsorted pool (detached recordings across all the user's sessions). */
export function selectUnsortedRecordings(state: RootState): RecordingSegment[] {
  const ids = state.transcriptStudio.unsortedIds;
  const byId = state.transcriptStudio.unsortedById;
  if (ids.length === 0) return EMPTY_RECORDING;
  const cached = unsortedCache.get(ids);
  if (cached && cached.byId === byId) return cached.result;
  const result: RecordingSegment[] = [];
  for (const id of ids) {
    const seg = byId[id];
    if (seg) result.push(seg);
  }
  unsortedCache.set(ids, { byId, result });
  return result;
}

export const selectUnsortedCount = (state: RootState): number =>
  state.transcriptStudio.unsortedIds.length;

/**
 * Memoize per-recording raw-chunk slices off the stable `selectRawSegments`
 * result so `useAppSelector` keeps the same reference when nothing changed.
 */
const rawForRecordingCache = new WeakMap<
  RawSegment[],
  Map<string, RawSegment[]>
>();

/** Raw chunks belonging to one recording cycle, ordered by tStart. */
export function selectRawSegmentsForRecording(
  sessionId: string | null,
  recordingSegmentId: string | null,
) {
  return (state: RootState): RawSegment[] => {
    if (!sessionId || !recordingSegmentId) return EMPTY_RAW;
    const all = selectRawSegments(sessionId)(state);
    if (all.length === 0) return EMPTY_RAW;

    let byRecordingId = rawForRecordingCache.get(all);
    if (!byRecordingId) {
      byRecordingId = new Map();
      rawForRecordingCache.set(all, byRecordingId);
    }

    const cached = byRecordingId.get(recordingSegmentId);
    if (cached) return cached;

    const filtered = all.filter(
      (s) => s.recordingSegmentId === recordingSegmentId,
    );
    const result = filtered.length === 0 ? EMPTY_RAW : filtered;
    byRecordingId.set(recordingSegmentId, result);
    return result;
  };
}

// ── Working document ────────────────────────────────────────────────

export function selectWorkingDocument(sessionId: string | null) {
  return (state: RootState): StudioDocument | null => {
    if (!sessionId) return null;
    const ids = state.transcriptStudio.documentIdsBySession[sessionId];
    const byId = state.transcriptStudio.documentsById[sessionId];
    if (!ids || !byId) return null;
    for (const id of ids) {
      const doc = byId[id];
      if (doc && doc.kind === "working_document") return doc;
    }
    return null;
  };
}

/**
 * The session's one-shot Scribe cleanup document (kind="scribe_cleanup").
 * Persists the AI-cleaned version of the session's raw transcripts and is
 * surfaced to the assistant as the `cleaned_transcripts` named context entry.
 */
export function selectScribeCleanupDocument(sessionId: string | null) {
  return (state: RootState): StudioDocument | null => {
    if (!sessionId) return null;
    const ids = state.transcriptStudio.documentIdsBySession[sessionId];
    const byId = state.transcriptStudio.documentsById[sessionId];
    if (!ids || !byId) return null;
    for (const id of ids) {
      const doc = byId[id];
      if (doc && doc.kind === "scribe_cleanup") return doc;
    }
    return null;
  };
}

export const selectAssistantConversationId =
  (sessionId: string | null) =>
  (state: RootState): string | null => {
    if (!sessionId) return null;
    return (
      state.transcriptStudio.assistantConversationIdBySession[sessionId] ?? null
    );
  };

void selectScope; // reserved — fuller scope-getter once we add per-column buffers
