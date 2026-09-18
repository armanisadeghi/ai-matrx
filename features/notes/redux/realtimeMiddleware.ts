// features/notes/redux/realtimeMiddleware.ts
//
// Single realtime subscription for notes, managed as Redux middleware.
// Starts on fetchNotesList.fulfilled, stops on resetNotesState (logout).
//
// No `created_by=` filter — RLS + REPLICA IDENTITY FULL gates events so both
// owned notes and shared-with-me notes arrive. Filter-by-owner hid sharee updates.
//
// REALTIME — THIS FILE USED TO BE THE DOCTRINE; NOW THE PACKAGE IS.
// -----------------------------------------------------------------
// `@ai-matrx/realtime` owns the channel and everything this module used to
// hand-roll: unique instance topics, the write ledger, dedup, the decoupled
// ordered handler queue, jittered reconnect WITH the stability reset (and its
// own sustained-outage alarm), tab-sleep and network awareness, diagnostics.
// What was deleted from here, and where it lives now:
//
//   isOwnEcho (~60 lines)        -> manager.ledger.classify. Every leg of it:
//                                   the monotonic updated_at guard, the
//                                   equal-timestamp content match, and the
//                                   same-actor-while-a-write-is-pending test
//                                   (the package reads `updated_by`, stamped by
//                                   the DB `_stamp_actor` trigger, against the
//                                   provider's actorId). Own echoes never reach
//                                   the handler at all now.
//   scheduleReconnect + backoff  -> the package's jittered backoff. Its
//   + BACKOFF_RESET_AFTER_MS        30s stability reset is the same rule, for
//   + RECONNECT_ALARM_ATTEMPT       the same reason: resetting on SUBSCRIBED
//                                   let a flapping channel cycle at the 1s
//                                   floor forever, firing a full catch-up each
//                                   time.
//   the catchUp flag             -> onBackfill, which also fires on tab wake,
//                                   network restore and queue overflow — none
//                                   of which the status callback could see.
//
// THE WRITES ARE REGISTERED ON THE LEDGER, and this is the load-bearing half:
// classify can only recognize an echo of a write it was told about. Notes has
// several write paths (the autosave middleware's INSERT and UPDATE, the
// saveNote thunk, notesService for legacy surfaces) and they all converge on
// `markNoteSaving` / `markNoteSaved`, so the registration happens THERE, in one
// place, rather than being copied into each writer.
//
// Live-editor attribution ("X is editing") is NOT echo suppression and stays
// here — it is this feature's UX, built on the same `updated_by` stamp.

import type {
  Middleware,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  canonicalRevision,
  currentRealtimeManager,
  defineChannelNamespace,
  realtimeDiagnostics,
  subscribeToRealtimeManager,
  type RealtimeStatus,
  type WriteLedger,
} from "@ai-matrx/realtime";
import {
  upsertNoteFromServer,
  removeNote,
  setRealtimeSyncStatus,
  setNoteEditor,
  clearNoteEditor,
} from "./slice";
import { NOTE_ROW_KEYS } from "./notes.types";
import type { Note } from "../types";
import { fetchNotesList, fetchSharedNotesList } from "./thunks";
import { captureNoteDrafts } from "../utils/notesDrafts";

/** Thunk-aware dispatch — this middleware refreshes lists via async thunks. */
type NotesDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

/** One place names this channel. A second, different declaration throws. */
const notesChannel = defineChannelNamespace({
  namespace: "notes",
  parts: ["userId"],
  description: "workbench.notes rows visible to one user (owned + shared)",
});

const NOTES_TABLE = "workbench.notes";

/** Postgres change payloads are usually full rows (REPLICA IDENTITY FULL),
 * but that is transport behavior, not a reducer contract. A partial event may
 * advance version evidence while it must never become an edit base or a
 * complete conflict comparison. Completeness is judged against the ONE row
 * key list the reducer's edit-base check reads, so the two can never drift. */
function isCompleteNotePayload(row: Record<string, unknown>): boolean {
  return NOTE_ROW_KEYS.every((field) => Object.hasOwn(row, field));
}

/**
 * Project a realtime row onto the client's `Note` shape — every column the
 * client models and nothing else (a table can carry search vectors and
 * embeddings the client never stores). Passing the WHOLE row, not a
 * hand-picked subset, is what lets the reducer (a) compare every user-edited
 * field against the edit base — `folder_id` and `visibility` were missing
 * from the old subset, so no realtime row could ever match a base — and (b)
 * advance the base itself when the row is complete.
 */
function projectNoteRow(row: Record<string, unknown>, noteId: string): Partial<Note> & { id: string } {
  const projected: Record<string, unknown> = {};
  for (const key of NOTE_ROW_KEYS) {
    if (Object.hasOwn(row, key)) projected[key] = row[key];
  }
  projected.id = noteId;
  return projected as Partial<Note> & { id: string };
}

/** Ledger tickets for saves currently in flight, keyed by note id. */
const openWrites = new Map<string, ReturnType<WriteLedger["begin"]>>();

let stopChannel: (() => void) | null = null;
let subscribedUserId: string | null = null;

/**
 * The content a save can change. This is what the package's ledger compares to
 * decide own-echo vs a same-millisecond collaborator write, so it must cover
 * every field the autosave path writes and nothing volatile.
 */
function noteFingerprint(row: Record<string, unknown>): string {
  // Every user-edited field (NOTE_EDITED_FIELDS). folder_id and visibility
  // were missing: a collaborator changing only those matched our pending
  // write's fingerprint and was dropped as our echo (review, 2026-09-13).
  return JSON.stringify([
    row.label ?? null,
    row.content ?? null,
    row.folder_name ?? null,
    row.folder_id ?? null,
    row.tags ?? null,
    row.visibility ?? null,
  ]);
}

// ── Live-editor attribution ─────────────────────────────────────────────
// `workbench.notes._stamp_actor` (DB trigger) writes `updated_by` on every
// UPDATE, so each realtime payload already identifies its editor — no
// presence channel needed. We surface "X is editing" per note and clear it
// after a short idle window. Emails resolve once per user via the
// `get_user_emails_by_ids` RPC (secure auth.users accessor) into a
// module-level cache.
const EDITOR_IDLE_CLEAR_MS = 8_000;
const editorEmailCache = new Map<string, string | null>();
const editorEmailInFlight = new Set<string>();
const editorClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearAllEditorTimers() {
  for (const timer of editorClearTimers.values()) clearTimeout(timer);
  editorClearTimers.clear();
}

/**
 * Middleware that manages a single Supabase realtime channel for notes.
 * - Subscribes when fetchNotesList completes successfully
 * - Unsubscribes on resetNotesState (logout / cleanup)
 * - Reconnects with backoff + list catch-up on CHANNEL_ERROR / TIMED_OUT
 */
export const notesRealtimeMiddleware: Middleware<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- RTK Middleware DispatchExt default
  {},
  RootState,
  NotesDispatch
> = (storeApi) => {
  /** Surface "X is editing" for a non-self realtime UPDATE, resolve the
   *  editor's email once (cached), and arm the idle-clear timer. */
  function announceEditor(noteId: string, editorId: string) {
    const now = Date.now();
    storeApi.dispatch(
      setNoteEditor({
        noteId,
        userId: editorId,
        email: editorEmailCache.get(editorId) ?? null,
        at: now,
      }),
    );

    const existingTimer = editorClearTimers.get(noteId);
    if (existingTimer) clearTimeout(existingTimer);
    editorClearTimers.set(
      noteId,
      setTimeout(() => {
        editorClearTimers.delete(noteId);
        storeApi.dispatch(clearNoteEditor({ noteId, userId: editorId }));
      }, EDITOR_IDLE_CLEAR_MS),
    );

    if (!editorEmailCache.has(editorId) && !editorEmailInFlight.has(editorId)) {
      editorEmailInFlight.add(editorId);
      void supabase
        .rpc("get_user_emails_by_ids", { user_ids: [editorId] })
        .then(({ data, error }) => {
          editorEmailInFlight.delete(editorId);
          if (error) {
            console.warn("[Notes RT] editor email lookup failed:", error.message);
            return;
          }
          const email = data?.[0]?.email ?? null;
          editorEmailCache.set(editorId, email);
          // Fill the email in-place ONLY if this user is still the note's
          // current editor — never resurrect or extend a stale entry (a
          // different editor may have taken over while the RPC was in flight).
          const current = (storeApi.getState() as RootState).notes.noteEditors[
            noteId
          ];
          if (email && current?.userId === editorId) {
            storeApi.dispatch(
              setNoteEditor({
                noteId,
                userId: editorId,
                email,
                at: current.lastEditAt,
              }),
            );
          }
        });
    }
  }

  function handlePayload(payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) {
    const currentUserId = (storeApi.getState() as RootState).userAuth?.id;
    if (!currentUserId || currentUserId !== subscribedUserId) {
      // Postgres-change callbacks already queued by Supabase can arrive after
      // logout or an account switch, before resetNotesState tears the channel
      // down. Drop the old identity's payload at the producer boundary: it must
      // not mutate the new store or issue authenticated follow-up RPCs (notably
      // the editor identity lookup) under an absent/different session.
      unsubscribe();
      return;
    }

    const eventType = payload.eventType;
    const newRecord = payload.new as Record<string, unknown> | undefined;
    const oldRecord = payload.old as Record<string, unknown> | undefined;

    if (eventType === "UPDATE" && newRecord) {
      const noteId = newRecord.id as string;

      if (newRecord.deleted_at) {
        storeApi.dispatch(removeNote(noteId));
        return;
      }

      // Live-editor attribution: `_stamp_actor` wrote the editor's id.
      const editorId = newRecord.updated_by as string | null | undefined;
      const selfId = (storeApi.getState() as RootState).userAuth?.id;
      if (editorId && editorId !== selfId) {
        announceEditor(noteId, editorId);
      }

      console.log("[Notes RT] UPDATE", noteId);
      storeApi.dispatch(
        upsertNoteFromServer({
          note: projectNoteRow(newRecord, noteId),
          fetchStatus: isCompleteNotePayload(newRecord) ? "full" : "list",
        }),
      );

      window.dispatchEvent(
        new CustomEvent("notes:labelChange", {
          detail: { noteId, label: newRecord.label },
        }),
      );
    }

    if (eventType === "INSERT" && newRecord) {
      if (newRecord.deleted_at) return;
      const noteId = newRecord.id as string;
      console.log("[Notes RT] INSERT", noteId);
      const projected = projectNoteRow(newRecord, noteId);
      storeApi.dispatch(
        upsertNoteFromServer({
          note: {
            ...projected,
            label: projected.label ?? "New Note",
            content: projected.content ?? "",
            folder_name: projected.folder_name ?? "Draft",
            tags: projected.tags ?? [],
            updated_at: projected.updated_at ?? new Date().toISOString(),
          },
          fetchStatus: isCompleteNotePayload(newRecord) ? "full" : "list",
        }),
      );

      window.dispatchEvent(
        new CustomEvent("notes:created", {
          detail: {
            id: noteId,
            label: newRecord.label ?? "New Note",
            folder_name: newRecord.folder_name ?? "Draft",
          },
        }),
      );
    }

    if (eventType === "DELETE" && oldRecord) {
      const noteId = oldRecord.id as string;
      console.log("[Notes RT] DELETE", noteId);
      storeApi.dispatch(removeNote(noteId));
      window.dispatchEvent(
        new CustomEvent("notes:deleted", { detail: { noteId } }),
      );
    }
  }

  // ── THE SYNC-STATUS DOOR (audit N-05, connection half) ────────────────
  //
  // A screen that says "live" while the socket is gone is the lying-screen
  // defect, so the status has to reach Redux with enough detail to tell
  // "still retrying" from "given up". The package pushes only the status
  // string, and `onStatusChange` is EDGE-triggered: the whole backoff ladder
  // sits on one "reconnecting" value, so the callback fires once and the
  // attempt count never arrives that way. The count IS published, per channel,
  // on the diagnostics snapshot (`failedAttempts`), and the alarm threshold is
  // exported (`RECONNECT_ALARM_ATTEMPTS`) — so we read the snapshot at each
  // transition and, while the channel is down, poll it until the number moves.
  // (If the package ever pushes attempts/alarm through `onStatusChange`, delete
  // this poll and take them from the callback.)
  const ATTEMPT_POLL_MS = 2_000;
  let attemptPoll: ReturnType<typeof setInterval> | null = null;
  let lastStatus: RealtimeStatus | null = null;
  let lastAttempts = 0;

  /** The package's own count of consecutive failed joins for OUR channel. */
  function currentFailedAttempts(): number {
    if (!subscribedUserId) return 0;
    const topic = notesChannel.topic({ userId: subscribedUserId });
    const channel = realtimeDiagnostics().channels.find(
      (entry) => entry.topic === topic,
    );
    return channel?.failedAttempts ?? 0;
  }

  function stopAttemptPoll() {
    if (attemptPoll === null) return;
    clearInterval(attemptPoll);
    attemptPoll = null;
  }

  function publishStatus(status: RealtimeStatus) {
    const failedAttempts = status === "connected" ? 0 : currentFailedAttempts();
    lastStatus = status;
    lastAttempts = failedAttempts;
    storeApi.dispatch(setRealtimeSyncStatus({ status, failedAttempts }));

    if (status === "connected" || status === "disconnected") {
      stopAttemptPoll();
      return;
    }
    if (attemptPoll !== null) return;
    // Down and retrying: the attempt number is the only thing that still
    // changes, and nothing will push it. Poll until it crosses the alarm — the
    // difference between "wait a moment" and "reload to see other devices".
    attemptPoll = setInterval(() => {
      if (lastStatus === null || lastStatus === "connected") {
        stopAttemptPoll();
        return;
      }
      const attempts = currentFailedAttempts();
      if (attempts === lastAttempts) return;
      lastAttempts = attempts;
      storeApi.dispatch(
        setRealtimeSyncStatus({ status: lastStatus, failedAttempts: attempts }),
      );
    }, ATTEMPT_POLL_MS);
  }

  function subscribe(userId: string) {
    unsubscribe();
    subscribedUserId = userId;

    stopChannel = subscribeToRealtimeManager(() => ({
      topic: notesChannel.topic({ userId }),
      postgresChanges: [
        {
          // No created_by filter: RLS + REPLICA IDENTITY FULL delivers owned
          // AND shared-with-me rows. Filtering by owner was the collaboration
          // data-loss hole.
          event: "*",
          schema: "workbench",
          table: "notes",
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: noteFingerprint,
          // Own echoes never arrive here — the ledger classified them first,
          // using the writes registered from markNoteSaving / markNoteSaved.
          onChange: ({ payload }) => {
            handlePayload(
              payload as {
                eventType: string;
                new: Record<string, unknown>;
                old: Record<string, unknown>;
              },
            );
          },
        },
      ],
      onStatusChange: (status) => {
        publishStatus(status);
      },
      // THE CATCH-UP READ. Realtime has no replay, and this now fires on tab
      // wake, network restore and queue overflow as well as reconnect — the
      // old catchUp flag only fired on a re-SUBSCRIBED after an error.
      onBackfill: () => {
        const currentUserId = (storeApi.getState() as RootState).userAuth?.id;
        if (!currentUserId || currentUserId !== subscribedUserId) return;
        void storeApi.dispatch(fetchNotesList());
        void storeApi.dispatch(fetchSharedNotesList());
      },
    }));
  }

  function unsubscribe() {
    subscribedUserId = null;
    clearAllEditorTimers();
    stopAttemptPoll();
    if (stopChannel) {
      stopChannel();
      stopChannel = null;
      // Back to `idle`, not `disconnected`: we closed the channel on purpose
      // (logout, account switch), and a screen must never accuse the network
      // of a teardown we asked for.
      storeApi.dispatch(
        setRealtimeSyncStatus({ status: "idle", failedAttempts: 0 }),
      );
    }
  }

  /**
   * REGISTER OUR OWN WRITES ON THE PACKAGE'S LEDGER — the load-bearing half of
   * echo suppression, in the ONE place every notes write path converges.
   *
   * `markNoteSaving` opens the ticket with the content we are about to write;
   * `markNoteSaved` settles it with what the server returned. Between those two
   * the row is "pending", which is what lets classify tell our own in-flight
   * write from a genuine collaborator write that happens to share a timestamp.
   */
  function registerWrite(action: UnknownAction): void {
    const manager = currentRealtimeManager();
    if (!manager) return;
    const type = (action as { type?: string }).type;

    if (type === "notes/markNoteSaving") {
      const id = (action as { payload?: string }).payload;
      if (typeof id !== "string") return;
      const local = (storeApi.getState() as RootState).notes.notes[id];
      if (!local) return;
      // The revision this write PRODUCES: the CAS bumps `version` by one. The
      // ledger recognizes our echo by that number (even when it beats the REST
      // response) and refuses to call anything ABOVE it an echo.
      const producedRevision = canonicalRevision(local.version);
      const ticket = manager.ledger.begin({
        table: NOTES_TABLE,
        id,
        fingerprint: noteFingerprint(local as unknown as Record<string, unknown>),
        ...(producedRevision !== undefined ? { revision: producedRevision + 1 } : {}),
      });
      openWrites.set(id, ticket);
      return;
    }

    if (type === "notes/markNoteSaved") {
      const payload = (action as {
        payload?: { id?: string; updatedAt?: string; version?: number };
      }).payload;
      const id = payload?.id;
      if (typeof id !== "string") return;
      // The reducer has already applied updatedAt + cleared dirty, so state
      // now holds exactly what the server has. Teach the ledger that, and the
      // echo landing 50-500ms from now is silent.
      const local = (storeApi.getState() as RootState).notes.notes[id];
      const fingerprint = local
        ? noteFingerprint(local as unknown as Record<string, unknown>)
        : undefined;
      const ticket = openWrites.get(id);
      if (ticket) {
        openWrites.delete(id);
        manager.ledger.settle(ticket, {
          ...(payload?.updatedAt !== undefined
            ? { updatedAt: payload.updatedAt }
            : {}),
          ...(fingerprint !== undefined ? { fingerprint } : {}),
          // The number the server actually stamped — after a phantom-conflict
          // rebase it is higher than the one `begin` expected.
          ...(canonicalRevision(payload?.version) !== undefined
            ? { revision: payload?.version }
            : {}),
        });
        return;
      }
      // A save that never announced itself (a legacy surface calling
      // notesService directly) still gets its echo suppressed.
      manager.ledger.observe({
        table: NOTES_TABLE,
        id,
        updatedAt: payload?.updatedAt ?? null,
        ...(fingerprint !== undefined ? { fingerprint } : {}),
        ...(canonicalRevision(payload?.version) !== undefined
          ? { revision: payload?.version }
          : {}),
      });
    }
  }

  return (next) => (action) => {
    // `resetNotesState` wipes every dirty buffer. Snapshot unsaved work into
    // the browser-local draft store FIRST (one place, for every dispatcher:
    // account switch, sign-out, the hook's own reset) so the text is offered
    // back instead of vanishing (audit N-02, 2026-09-14).
    if ((action as { type?: string }).type === "notes/resetNotesState") {
      captureNoteDrafts("signed-out");
    }

    // The reducer must run FIRST for markNoteSaved (we read the settled state),
    // and for markNoteSaving the pre-save content is what we want — both are
    // satisfied by registering after `next`.
    const result = next(action);
    registerWrite(action as UnknownAction);

    if (fetchNotesList.fulfilled.match(action)) {
      const state = storeApi.getState() as RootState;
      const userId = state.userAuth?.id;
      // Don't tear down a healthy channel just because a catch-up list refresh
      // completed — only (re)subscribe when missing or for a different user.
      if (userId && (subscribedUserId !== userId || !stopChannel)) {
        subscribe(userId);
      }
    }

    if ((action as { type?: string }).type === "notes/resetNotesState") {
      unsubscribe();
    }

    return result;
  };
};
