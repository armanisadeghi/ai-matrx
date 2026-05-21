// Two-channel realtime middleware for the studio.
//
// Channel A (sessions): subscribed once after the first sessions list fetch,
// keeps the sidebar in sync across tabs/devices for the same user. Filtered
// by `user_id`.
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
// Pattern stolen from features/notes/redux/realtimeMiddleware.ts.
import type { Middleware } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RootState } from "@/lib/redux/store";
import {
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
import { fetchSessionsThunk } from "./thunks";

let sessionsChannel: RealtimeChannel | null = null;
let activeSessionChannel: RealtimeChannel | null = null;
let activeSessionId: string | null = null;

function teardownSessions() {
  if (sessionsChannel) {
    supabase.removeChannel(sessionsChannel);
    sessionsChannel = null;
  }
}

function teardownActiveSession() {
  if (activeSessionChannel) {
    supabase.removeChannel(activeSessionChannel);
    activeSessionChannel = null;
    activeSessionId = null;
  }
}

export const transcriptStudioRealtimeMiddleware: Middleware =
  (storeApi) => (next) => (action) => {
    const result = next(action);
    const state = storeApi.getState() as RootState;
    const userId = state.userAuth?.id;

    // Subscribe to sessions table once after the first list fetch
    if (fetchSessionsThunk.fulfilled.match(action) && userId && !sessionsChannel) {
      sessionsChannel = supabase
        .channel(`studio-sessions-rt:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "studio_sessions",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newRow = payload.new as SessionRow | undefined;
            const oldRow = payload.old as SessionRow | undefined;
            if (payload.eventType === "DELETE" && oldRow?.id) {
              storeApi.dispatch(sessionRemoved(oldRow.id));
              return;
            }
            if (newRow?.id) {
              if (newRow.is_deleted) {
                storeApi.dispatch(sessionRemoved(newRow.id));
                return;
              }
              storeApi.dispatch(sessionUpserted(rowToSession(newRow)));
            }
          },
        )
        .subscribe();
    }

    // Active-session change → re-subscribe per-session segment channel
    const nextActiveId = state.transcriptStudio?.activeSessionId ?? null;
    if (nextActiveId !== activeSessionId) {
      teardownActiveSession();
      if (nextActiveId) {
        activeSessionId = nextActiveId;
        const sid = nextActiveId;
        activeSessionChannel = supabase
          .channel(`studio-segments-rt:${sid}`)

          // ── studio_raw_segments ────────────────────────────────────
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "studio_raw_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as RawSegmentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                rawSegmentsAppended({
                  sessionId: sid,
                  segments: [rowToRawSegment(row)],
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "studio_raw_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as RawSegmentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                rawSegmentUpdated({
                  sessionId: sid,
                  segment: rowToRawSegment(row),
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "studio_raw_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const old = payload.old as { id?: string } | undefined;
              if (!old?.id) return;
              storeApi.dispatch(
                rawSegmentRemoved({ sessionId: sid, segmentId: old.id }),
              );
            },
          )

          // ── studio_cleaned_segments ────────────────────────────────
          //
          // INSERT = a new cleanup pass landed → apply with supersede.
          // UPDATE = either an in-place edit OR the supersede stamp the
          //   apply-flow itself fires. Both are routed to *Updated which
          //   does an in-place patch — applying the supersede reducer on
          //   a UPDATE echo would re-drop every later row.
          // DELETE = explicit user delete (or session cleanup).
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "studio_cleaned_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as CleanedSegmentRow | undefined;
              if (!row) return;
              // Brand-new active row only — superseded inserts shouldn't
              // happen but guard anyway.
              if (row.superseded_at !== null) return;
              storeApi.dispatch(
                cleanedSegmentApplied({
                  sessionId: sid,
                  segment: rowToCleanedSegment(row),
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "studio_cleaned_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as CleanedSegmentRow | undefined;
              if (!row) return;
              if (row.superseded_at !== null) {
                // The row got superseded by a later cleanup pass — drop
                // it from the active registry so we never render two
                // overlapping rows after a cross-tab cleanup.
                storeApi.dispatch(
                  cleanedSegmentRemoved({
                    sessionId: sid,
                    segmentId: row.id,
                  }),
                );
                return;
              }
              storeApi.dispatch(
                cleanedSegmentUpdated({
                  sessionId: sid,
                  segment: rowToCleanedSegment(row),
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "studio_cleaned_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const old = payload.old as { id?: string } | undefined;
              if (!old?.id) return;
              storeApi.dispatch(
                cleanedSegmentRemoved({
                  sessionId: sid,
                  segmentId: old.id,
                }),
              );
            },
          )

          // ── studio_concept_items ────────────────────────────────────
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "studio_concept_items",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as ConceptItemRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                conceptsAppended({
                  sessionId: sid,
                  items: [rowToConceptItem(row)],
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "studio_concept_items",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as ConceptItemRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                conceptItemUpdated({
                  sessionId: sid,
                  item: rowToConceptItem(row),
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "studio_concept_items",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const old = payload.old as { id?: string } | undefined;
              if (!old?.id) return;
              storeApi.dispatch(
                conceptItemRemoved({ sessionId: sid, itemId: old.id }),
              );
            },
          )

          // ── studio_module_segments ──────────────────────────────────
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "studio_module_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as ModuleSegmentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                moduleSegmentsAppended({
                  sessionId: sid,
                  segments: [rowToModuleSegment(row)],
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "studio_module_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const row = payload.new as ModuleSegmentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                moduleSegmentUpdated({
                  sessionId: sid,
                  segment: rowToModuleSegment(row),
                }),
              );
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "studio_module_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              const old = payload.old as { id?: string } | undefined;
              if (!old?.id) return;
              storeApi.dispatch(
                moduleSegmentRemoved({
                  sessionId: sid,
                  segmentId: old.id,
                }),
              );
            },
          )

          // ── studio_recording_segments (mobile cards) ────────────────
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "studio_recording_segments",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              if (payload.eventType === "DELETE") {
                const old = payload.old as { id?: string } | undefined;
                if (old?.id) {
                  storeApi.dispatch(
                    recordingSegmentRemoved({
                      sessionId: sid,
                      segmentId: old.id,
                    }),
                  );
                }
                return;
              }
              const row = payload.new as RecordingSegmentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                recordingSegmentUpserted({
                  sessionId: sid,
                  segment: rowToRecordingSegment(row),
                }),
              );
            },
          )

          // ── studio_documents (assistant working document) ───────────
          // INSERT + UPDATE both upsert. The assistant's ctx_patch writes land
          // here via the backend writeback handler and arrive as UPDATEs.
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "studio_documents",
              filter: `session_id=eq.${sid}`,
            },
            (payload) => {
              if (payload.eventType === "DELETE") return;
              const row = payload.new as StudioDocumentRow | undefined;
              if (!row) return;
              storeApi.dispatch(
                studioDocumentUpserted({
                  sessionId: sid,
                  document: rowToStudioDocument(row),
                }),
              );
            },
          )
          .subscribe();
      }
    }

    if ((action as { type?: string }).type === "transcriptStudio/resetState") {
      teardownSessions();
      teardownActiveSession();
    }

    return result;
  };
