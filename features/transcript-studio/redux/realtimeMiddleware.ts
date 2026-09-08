// Two-channel realtime middleware for the studio.
//
// Channel A (sessions): subscribed once after the first sessions list fetch,
// keeps the sidebar in sync across tabs/devices for the same user. Filtered
// by `created_by` (the table's owner column — there is no `user_id`).
//
// Channel B (active session): subscribed when an active session is selected
// and torn down + rebuilt when the active session changes. Listens to the
// four per-segment tables filtered by `session_id`.
//
// Routing per event type matters:
//   - INSERT → *Appended / cleanedSegmentApplied (supersede on new pass)
//   - UPDATE → *Updated (in-place; never re-fire the supersede logic)
//   - DELETE → *Removed (cross-tab delete propagation)
//
// Earlier versions used `event: "*"` for cleaned segments and routed every
// echo (including UPDATEs from edits and from supersede stamps) through
// `cleanedSegmentApplied`, which deletes all active rows where
// `tStart >= segment.tStart`. That clobbered every later segment any time a
// user edited an earlier one — the bug behind the "edit a row and lose
// everything after it" report.
//
// REALTIME: `@ai-matrx/realtime` owns both channels — unique instance topics,
// echo suppression, dedup, the decoupled ordered handler queue, jittered
// reconnect with the stability reset, tab sleep, diagnostics. What was here was
// two raw `.channel(...).subscribe()` blocks with manual `removeChannel`
// teardown and NO catch-up read on either: a studio tab that slept through a
// cleaning pass woke with the sidebar and the segment list frozen at the last
// event it heard, looking perfectly healthy. `onBackfill` re-reads through the
// service and dispatches the SAME `*Loaded` actions the initial hydration uses.
//
// The backfill deliberately calls `../service/studioService` rather than the
// fetch thunks: `./thunks` transitively reaches the whole agent-execution
// system, and this middleware is registered in the store, so importing it pulls
// that graph into every authenticated route (see the note on actionTypes below).
//
// This middleware is not a component, so the manager arrives through the
// package's ambient door (`subscribeToRealtimeManager`, realtime 0.6.0).
import type { Middleware } from "@reduxjs/toolkit";
import {
  defineChannelNamespace,
  subscribeToRealtimeManager,
} from "@ai-matrx/realtime";
import type { RootState } from "@/lib/redux/store";
import {
  listSessions,
  listRawSegments,
  listCleanedSegments,
  listConceptItems,
  listModuleSegments,
  listRecordingSegments,
  listStudioDocuments,
  rowToSession,
  rowToRawSegment,
  rowToCleanedSegment,
  rowToConceptItem,
  rowToModuleSegment,
  rowToRecordingSegment,
  rowToStudioDocument,
  type SessionRow,
  type RawSegmentRow,
  type CleanedSegmentRow,
  type ConceptItemRow,
  type ModuleSegmentRow,
  type RecordingSegmentRow,
  type StudioDocumentRow,
} from "../service/studioService";
import {
  sessionsListLoaded,
  rawSegmentsLoaded,
  cleanedSegmentsLoaded,
  conceptsLoaded,
  moduleSegmentsLoaded,
  recordingSegmentsLoaded,
  studioDocumentsLoaded,
  sessionUpserted,
  sessionRemoved,
  rawSegmentsAppended,
  rawSegmentUpdated,
  rawSegmentRemoved,
  cleanedSegmentApplied,
  cleanedSegmentUpdated,
  cleanedSegmentRemoved,
  conceptsAppended,
  conceptItemUpdated,
  conceptItemRemoved,
  moduleSegmentsAppended,
  moduleSegmentUpdated,
  moduleSegmentRemoved,
  recordingSegmentUpserted,
  recordingSegmentRemoved,
  studioDocumentUpserted,
} from "./slice";
// Match the action by TYPE, never by importing the thunk. `./thunks` transitively
// reaches cleanRecording.thunk -> launch-agent-execution.thunk (the whole agent
// execution system) -> canvas materialization -> the markdown content-IR pipeline,
// and this middleware is registered in lib/redux/store.ts, so importing it pulled all
// of that into every authenticated route's graph purely to obtain a string.
// ./actionTypes is a leaf (constants only); the thunk definition reads the same
// constant, so the two cannot drift apart.
import { TRANSCRIPT_STUDIO_FETCH_SESSIONS_FULFILLED } from "./actionTypes";

/** One place names each channel. A second, different declaration throws. */
const studioSessionsChannel = defineChannelNamespace({
  namespace: "studio-sessions",
  parts: ["userId"],
  description: "transcripts.studio_sessions rows for one user",
});

const studioSegmentsChannel = defineChannelNamespace({
  namespace: "studio-segments",
  parts: ["sessionId"],
  description:
    "transcripts.studio_{raw,cleaned,concept,module,recording}_* + documents for one studio session",
});

let stopSessions: (() => void) | null = null;
let stopActiveSession: (() => void) | null = null;
let activeSessionId: string | null = null;

function teardownSessions() {
  if (stopSessions) {
    stopSessions();
    stopSessions = null;
  }
}

function teardownActiveSession() {
  if (stopActiveSession) {
    stopActiveSession();
    stopActiveSession = null;
    activeSessionId = null;
  }
}

export const transcriptStudioRealtimeMiddleware: Middleware =
  (storeApi) => (next) => (action) => {
    const result = next(action);
    const state = storeApi.getState() as RootState;
    const userId = state.userAuth?.id;

    // Subscribe to sessions table once after the first list fetch
    if (
      (action as { type?: string })?.type ===
        TRANSCRIPT_STUDIO_FETCH_SESSIONS_FULFILLED &&
      userId &&
      !stopSessions
    ) {
      stopSessions = subscribeToRealtimeManager(() => ({
        topic: studioSessionsChannel.topic({ userId }),
        postgresChanges: [
          {
            event: "*",
            schema: "transcripts",
            table: "studio_sessions",
            filter: `created_by=eq.${userId}`,
            rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
            fingerprint: (row) =>
              JSON.stringify([row.title ?? null, row.deleted_at ?? null]),
            onChange: ({ payload, row }) => {
              const newRow = row as SessionRow | null;
              const oldRow = payload.old as SessionRow | undefined;
              if (payload.eventType === "DELETE" && oldRow?.id) {
                storeApi.dispatch(sessionRemoved(oldRow.id));
                return;
              }
              if (newRow?.id) {
                if (newRow.deleted_at) {
                  storeApi.dispatch(sessionRemoved(newRow.id));
                  return;
                }
                storeApi.dispatch(sessionUpserted(rowToSession(newRow)));
              }
            },
          },
        ],
        // Realtime has no replay: a session created or renamed on another
        // device while this tab slept would never reach the sidebar.
        onBackfill: async () => {
          try {
            storeApi.dispatch(sessionsListLoaded(await listSessions()));
          } catch (error) {
            console.warn(
              "[studio RT] sessions catch-up failed — the sidebar may be " +
                "stale until the next event or a reload.",
              error,
            );
          }
        },
      }));
    }

    // Active-session change → re-subscribe per-session segment channel
    const nextActiveId = state.transcriptStudio?.activeSessionId ?? null;
    if (nextActiveId !== activeSessionId) {
      teardownActiveSession();
      if (nextActiveId) {
        activeSessionId = nextActiveId;
        const sid = nextActiveId;
        const scoped = (table: string, event: "INSERT" | "UPDATE" | "DELETE" | "*") =>
          ({
            event,
            schema: "transcripts",
            table,
            filter: `session_id=eq.${sid}`,
            rowId: (row: Record<string, unknown>) =>
              typeof row.id === "string" ? row.id : undefined,
          }) as const;

        const deletedId = (payload: { old?: unknown }): string | undefined => {
          const old = payload.old as { id?: string } | undefined;
          return old?.id;
        };

        stopActiveSession = subscribeToRealtimeManager(() => ({
          topic: studioSegmentsChannel.topic({ sessionId: sid }),
          postgresChanges: [
            // ── studio_raw_segments ────────────────────────────────────
            {
              ...scoped("studio_raw_segments", "INSERT"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  rawSegmentsAppended({
                    sessionId: sid,
                    segments: [rowToRawSegment(row as unknown as RawSegmentRow)],
                  }),
                );
              },
            },
            {
              ...scoped("studio_raw_segments", "UPDATE"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  rawSegmentUpdated({
                    sessionId: sid,
                    segment: rowToRawSegment(row as unknown as RawSegmentRow),
                  }),
                );
              },
            },
            {
              ...scoped("studio_raw_segments", "DELETE"),
              onChange: ({ payload }) => {
                const id = deletedId(payload);
                if (!id) return;
                storeApi.dispatch(
                  rawSegmentRemoved({ sessionId: sid, segmentId: id }),
                );
              },
            },

            // ── studio_cleaned_segments ────────────────────────────────
            //
            // INSERT = a new cleanup pass landed → apply with supersede.
            // UPDATE = either an in-place edit OR the supersede stamp the
            //   apply-flow itself fires. Both are routed to *Updated which
            //   does an in-place patch — applying the supersede reducer on
            //   a UPDATE echo would re-drop every later row.
            // DELETE = explicit user delete (or session cleanup).
            {
              ...scoped("studio_cleaned_segments", "INSERT"),
              onChange: ({ row }) => {
                const cleaned = row as unknown as CleanedSegmentRow | null;
                if (!cleaned) return;
                // Brand-new active row only — superseded inserts shouldn't
                // happen but guard anyway.
                if (cleaned.superseded_at !== null) return;
                storeApi.dispatch(
                  cleanedSegmentApplied({
                    sessionId: sid,
                    segment: rowToCleanedSegment(cleaned),
                  }),
                );
              },
            },
            {
              ...scoped("studio_cleaned_segments", "UPDATE"),
              onChange: ({ row }) => {
                const cleaned = row as unknown as CleanedSegmentRow | null;
                if (!cleaned) return;
                if (cleaned.superseded_at !== null) {
                  // The row got superseded by a later cleanup pass — drop it
                  // from the active registry so we never render two
                  // overlapping rows after a cross-tab cleanup.
                  storeApi.dispatch(
                    cleanedSegmentRemoved({
                      sessionId: sid,
                      segmentId: cleaned.id,
                    }),
                  );
                  return;
                }
                storeApi.dispatch(
                  cleanedSegmentUpdated({
                    sessionId: sid,
                    segment: rowToCleanedSegment(cleaned),
                  }),
                );
              },
            },
            {
              ...scoped("studio_cleaned_segments", "DELETE"),
              onChange: ({ payload }) => {
                const id = deletedId(payload);
                if (!id) return;
                storeApi.dispatch(
                  cleanedSegmentRemoved({ sessionId: sid, segmentId: id }),
                );
              },
            },

            // ── studio_concept_items ───────────────────────────────────
            {
              ...scoped("studio_concept_items", "INSERT"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  conceptsAppended({
                    sessionId: sid,
                    items: [rowToConceptItem(row as unknown as ConceptItemRow)],
                  }),
                );
              },
            },
            {
              ...scoped("studio_concept_items", "UPDATE"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  conceptItemUpdated({
                    sessionId: sid,
                    item: rowToConceptItem(row as unknown as ConceptItemRow),
                  }),
                );
              },
            },
            {
              ...scoped("studio_concept_items", "DELETE"),
              onChange: ({ payload }) => {
                const id = deletedId(payload);
                if (!id) return;
                storeApi.dispatch(
                  conceptItemRemoved({ sessionId: sid, itemId: id }),
                );
              },
            },

            // ── studio_module_segments ─────────────────────────────────
            {
              ...scoped("studio_module_segments", "INSERT"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  moduleSegmentsAppended({
                    sessionId: sid,
                    segments: [
                      rowToModuleSegment(row as unknown as ModuleSegmentRow),
                    ],
                  }),
                );
              },
            },
            {
              ...scoped("studio_module_segments", "UPDATE"),
              onChange: ({ row }) => {
                if (!row) return;
                storeApi.dispatch(
                  moduleSegmentUpdated({
                    sessionId: sid,
                    segment: rowToModuleSegment(row as unknown as ModuleSegmentRow),
                  }),
                );
              },
            },
            {
              ...scoped("studio_module_segments", "DELETE"),
              onChange: ({ payload }) => {
                const id = deletedId(payload);
                if (!id) return;
                storeApi.dispatch(
                  moduleSegmentRemoved({ sessionId: sid, segmentId: id }),
                );
              },
            },

            // ── studio_recording_segments (mobile cards) ────────────────
            {
              ...scoped("studio_recording_segments", "*"),
              onChange: ({ payload, row }) => {
                if (payload.eventType === "DELETE") {
                  const id = deletedId(payload);
                  if (id) {
                    storeApi.dispatch(
                      recordingSegmentRemoved({ sessionId: sid, segmentId: id }),
                    );
                  }
                  return;
                }
                if (!row) return;
                storeApi.dispatch(
                  recordingSegmentUpserted({
                    sessionId: sid,
                    segment: rowToRecordingSegment(
                      row as unknown as RecordingSegmentRow,
                    ),
                  }),
                );
              },
            },

            // ── studio_documents (assistant working document) ───────────
            // INSERT + UPDATE both upsert. The assistant's ctx_patch writes
            // land here via the backend writeback handler and arrive as UPDATEs.
            {
              ...scoped("studio_documents", "*"),
              onChange: ({ payload, row }) => {
                if (payload.eventType === "DELETE") return;
                if (!row) return;
                storeApi.dispatch(
                  studioDocumentUpserted({
                    sessionId: sid,
                    document: rowToStudioDocument(
                      row as unknown as StudioDocumentRow,
                    ),
                  }),
                );
              },
            },
          ],
          // THE CATCH-UP READ this middleware never had. Realtime has no
          // replay, so a studio tab that slept through a cleaning pass came
          // back frozen at the last event it heard. Re-read all six lists and
          // dispatch the same `*Loaded` actions the initial hydration uses —
          // note these call the SERVICE, not the fetch thunks (see the header).
          onBackfill: async () => {
            try {
              const [raw, cleaned, concepts, modules, recordings, documents] =
                await Promise.all([
                  listRawSegments(sid),
                  listCleanedSegments(sid),
                  listConceptItems(sid),
                  listModuleSegments(sid),
                  listRecordingSegments(sid),
                  listStudioDocuments(sid),
                ]);
              // ONE batched dispatch per list — never per row.
              storeApi.dispatch(
                rawSegmentsLoaded({ sessionId: sid, segments: raw }),
              );
              storeApi.dispatch(
                cleanedSegmentsLoaded({ sessionId: sid, segments: cleaned }),
              );
              storeApi.dispatch(
                conceptsLoaded({ sessionId: sid, items: concepts }),
              );
              storeApi.dispatch(
                moduleSegmentsLoaded({ sessionId: sid, segments: modules }),
              );
              storeApi.dispatch(
                recordingSegmentsLoaded({
                  sessionId: sid,
                  segments: recordings,
                }),
              );
              storeApi.dispatch(
                studioDocumentsLoaded({ sessionId: sid, documents }),
              );
            } catch (error) {
              console.warn(
                `[studio RT] catch-up failed for session ${sid} — this view may ` +
                  "be stale until the next event or a reload.",
                error,
              );
            }
          },
        }));
      }
    }

    if ((action as { type?: string }).type === "transcriptStudio/resetState") {
      teardownSessions();
      teardownActiveSession();
    }

    return result;
  };
