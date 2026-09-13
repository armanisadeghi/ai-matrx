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
  currentRealtimeManager,
  defineChannelNamespace,
  subscribeToRealtimeManager,
  type WriteLedger,
} from "@ai-matrx/realtime";
import {
  upsertNoteFromServer,
  removeNote,
  setRealtimeConnected,
  setNoteEditor,
  clearNoteEditor,
} from "./slice";
import { fetchNotesList, fetchSharedNotesList } from "./thunks";

/** Thunk-aware dispatch — this middleware refreshes lists via async thunks. */
type NotesDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

/** One place names this channel. A second, different declaration throws. */
const notesChannel = defineChannelNamespace({
  namespace: "notes",
  parts: ["userId"],
  description: "workbench.notes rows visible to one user (owned + shared)",
});

const NOTES_TABLE = "workbench.notes";

/** Postgres change payloads are usually full rows, but that is transport
 * behavior, not a reducer contract. A partial event may advance version
 * evidence while it must never be used as a complete conflict comparison. */
function isCompleteNotePayload(row: Record<string, unknown>): boolean {
  return [
    "id",
    "organization_id",
    "label",
    "content",
    "folder_name",
    "tags",
    "metadata",
    "visibility",
    "position",
    "version",
    "updated_at",
    "created_at",
    "created_by",
  ].every((field) => Object.hasOwn(row, field));
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
  return JSON.stringify([
    row.label ?? null,
    row.content ?? null,
    row.folder_name ?? null,
    row.tags ?? null,
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
          note: {
            id: noteId,
            label: newRecord.label as string,
            content: newRecord.content as string,
            folder_name: newRecord.folder_name as string,
            tags: newRecord.tags as string[],
            metadata: newRecord.metadata as Record<string, unknown>,
            organization_id: newRecord.organization_id as string,
            updated_at: newRecord.updated_at as string,
            created_at: newRecord.created_at as string | undefined,
            created_by: newRecord.created_by as string | undefined,
            version: newRecord.version as number | undefined,
          },
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
      storeApi.dispatch(
        upsertNoteFromServer({
          note: {
            id: noteId,
            label: (newRecord.label as string) ?? "New Note",
            content: (newRecord.content as string) ?? "",
            folder_name: (newRecord.folder_name as string) ?? "Draft",
            tags: (newRecord.tags as string[]) ?? [],
            organization_id: newRecord.organization_id as string,
            updated_at:
              (newRecord.updated_at as string) ?? new Date().toISOString(),
            created_at: newRecord.created_at as string | undefined,
            created_by: newRecord.created_by as string | undefined,
            version: newRecord.version as number | undefined,
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
        storeApi.dispatch(setRealtimeConnected(status === "connected"));
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
    if (stopChannel) {
      stopChannel();
      stopChannel = null;
      storeApi.dispatch(setRealtimeConnected(false));
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
      const ticket = manager.ledger.begin({
        table: NOTES_TABLE,
        id,
        fingerprint: noteFingerprint(local as unknown as Record<string, unknown>),
      });
      openWrites.set(id, ticket);
      return;
    }

    if (type === "notes/markNoteSaved") {
      const payload = (action as {
        payload?: { id?: string; updatedAt?: string };
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
      });
    }
  }

  return (next) => (action) => {
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
