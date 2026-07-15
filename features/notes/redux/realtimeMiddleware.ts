// features/notes/redux/realtimeMiddleware.ts
// Single Supabase realtime subscription for notes, managed as Redux middleware.
// Starts on fetchNotesList.fulfilled, stops on resetNotesState (logout).
// Echo suppression: content-aware while `_savingNoteIds` / sync-engine
// `isPendingEcho` — only drop payloads that match local content+label.
//
// No `created_by=` filter — RLS + REPLICA IDENTITY FULL gates events so both
// owned notes and shared-with-me notes arrive. Filter-by-owner hid sharee updates.

import type {
  Middleware,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RootState } from "@/lib/redux/rootReducer";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import type { SyncEngineApi } from "@/lib/sync/engine/middleware";
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

let channel: RealtimeChannel | null = null;
let subscribedUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
// Backoff resets only after the channel stays healthy for this long. Resetting
// on SUBSCRIBED alone let a flapping channel (SUBSCRIBED → CHANNEL_ERROR →
// SUBSCRIBED …) cycle at the 1s backoff floor forever — each cycle firing a
// full-list catch-up fetch, a self-sustaining fetch storm.
const BACKOFF_RESET_AFTER_MS = 30_000;
let backoffResetTimer: ReturnType<typeof setTimeout> | null = null;

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

type StoreWithSync = {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
  _sync?: { engineApi?: () => SyncEngineApi | null };
};

function isOwnEcho(
  storeApi: StoreWithSync,
  noteId: string,
  newRecord?: Record<string, unknown>,
): boolean {
  const state = storeApi.getState() as RootState;
  const local = state.notes.notes[noteId];

  // ── Monotonic updated_at guard — runs UNCONDITIONALLY ─────────────────
  // Our own UPDATE's realtime echo lands 50–500ms AFTER the REST response
  // already delivered the fresh `updated_at` via markNoteSaved — so by the
  // time the echo arrives, `_savingNoteIds` is empty and any saving-gated
  // check misses it. THE 2026-07 /notes BROWSER-FREEZE REGRESSION was
  // exactly this: unsuppressed self-echoes flagged false conflicts on every
  // autosave while typing (see FEATURE.md § Realtime echo doctrine).
  // The timestamp is the reliable key: a payload that is not strictly newer
  // than the state we already hold carries zero new information.
  //  - strictly older  → stale out-of-order echo, drop.
  //  - equal timestamp → drop only when content+label also match (a
  //    same-millisecond collaborator write must still land).
  if (local && newRecord) {
    const remoteTs = Date.parse(String(newRecord.updated_at ?? ""));
    const localTs = Date.parse(local.updated_at ?? "");
    const contentMatches =
      newRecord.content === undefined || newRecord.content === local.content;
    const labelMatches =
      newRecord.label === undefined || newRecord.label === local.label;
    if (Number.isFinite(remoteTs) && Number.isFinite(localTs)) {
      if (remoteTs < localTs) return true;
      if (remoteTs === localTs && contentMatches && labelMatches) return true;
    }
  }

  // ── Own-user guard (`updated_by`, stamped by the DB `_stamp_actor`
  // trigger) ───────────────────────────────────────────────────────────
  // While THIS tab is mid-edit (dirty) or mid-save, an echo of the current
  // user's OWN write is never news: the REST response is the authority for
  // updated_at, and the user's live buffer is the authority for content.
  // Without this, a big paste produced the freeze-class false conflict —
  // the save is slow, the user keeps typing/naming, the echo lands with
  // in-flight (stale) content that no longer matches local → treated as a
  // collaborator write → conflict. Same-user cross-TAB races are still
  // caught by the save's optimistic `updated_at` lock, and a clean record
  // still receives own-user echoes (cross-tab sync).
  const saving = state.notes._savingNoteIds.includes(noteId);

  if (local && newRecord) {
    const selfId = state.userAuth?.id;
    if (
      selfId &&
      newRecord.updated_by === selfId &&
      (saving || local._dirty)
    ) {
      return true;
    }
  }

  const engineApi = storeApi._sync?.engineApi?.() ?? null;
  const syncPending = engineApi?.isPendingEcho?.("notes", noteId) ?? false;

  if (!saving && !syncPending) return false;

  // While a local save is in flight, only suppress payloads that match our
  // live local content (true echo). A collaborator's divergent write must
  // reach upsertNoteFromServer so dirty locals surface as conflict.
  if (newRecord) {
    if (!local) return true;
    const remoteContent = newRecord.content;
    const remoteLabel = newRecord.label;
    const contentMatches =
      remoteContent === undefined || remoteContent === local.content;
    const labelMatches =
      remoteLabel === undefined || remoteLabel === local.label;
    if (contentMatches && labelMatches) return true;
    return false;
  }

  return true;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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
  const storeWithSync = storeApi as typeof storeApi & StoreWithSync;

  function scheduleReconnect(userId: string, reason: string) {
    clearReconnectTimer();
    // A failure within the healthy window cancels the pending backoff reset —
    // this is a flap, so the attempt counter must keep climbing.
    if (backoffResetTimer) {
      clearTimeout(backoffResetTimer);
      backoffResetTimer = null;
    }
    const attempt = reconnectAttempt++;
    const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
    console.warn(
      `[Notes RT] ${reason} — reconnecting in ${delayMs}ms (attempt ${attempt + 1})`,
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      subscribe(userId, { catchUp: true });
    }, delayMs);
  }

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
    const eventType = payload.eventType;
    const newRecord = payload.new as Record<string, unknown> | undefined;
    const oldRecord = payload.old as Record<string, unknown> | undefined;

    if (eventType === "UPDATE" && newRecord) {
      const noteId = newRecord.id as string;

      if (isOwnEcho(storeWithSync, noteId, newRecord)) {
        console.log("[Notes RT] Echo suppressed for", noteId);
        return;
      }

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
          fetchStatus: "full",
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
      if (isOwnEcho(storeWithSync, noteId, newRecord)) {
        console.log("[Notes RT] INSERT echo suppressed for", noteId);
        return;
      }
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
          fetchStatus: "full",
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

  function subscribe(userId: string, opts: { catchUp?: boolean } = {}) {
    clearReconnectTimer();
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    subscribedUserId = userId;

    // No created_by filter: RLS + REPLICA IDENTITY FULL delivers owned AND
    // shared-with-me rows. Filtering by owner was the collaboration data-loss hole.
    channel = supabase
      .channel(uniqueChannelTopic(`notes-rt:${userId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "workbench",
          table: "notes",
        },
        (payload) => {
          handlePayload(
            payload as {
              eventType: string;
              new: Record<string, unknown>;
              old: Record<string, unknown>;
            },
          );
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[Notes RT] Connected");
          if (backoffResetTimer) clearTimeout(backoffResetTimer);
          backoffResetTimer = setTimeout(() => {
            backoffResetTimer = null;
            reconnectAttempt = 0;
          }, BACKOFF_RESET_AFTER_MS);
          storeApi.dispatch(setRealtimeConnected(true));
          if (opts.catchUp) {
            // Missed events while disconnected — refresh lists loudly.
            void storeApi.dispatch(fetchNotesList());
            void storeApi.dispatch(fetchSharedNotesList());
          }
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Notes RT] Error:", err);
          storeApi.dispatch(setRealtimeConnected(false));
          if (subscribedUserId) {
            scheduleReconnect(subscribedUserId, "CHANNEL_ERROR");
          }
        } else if (status === "TIMED_OUT") {
          console.warn("[Notes RT] Timed out");
          storeApi.dispatch(setRealtimeConnected(false));
          if (subscribedUserId) {
            scheduleReconnect(subscribedUserId, "TIMED_OUT");
          }
        }
      });
  }

  function unsubscribe() {
    clearReconnectTimer();
    if (backoffResetTimer) {
      clearTimeout(backoffResetTimer);
      backoffResetTimer = null;
    }
    subscribedUserId = null;
    reconnectAttempt = 0;
    clearAllEditorTimers();
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
      storeApi.dispatch(setRealtimeConnected(false));
      console.log("[Notes RT] Disconnected");
    }
  }

  return (next) => (action) => {
    const result = next(action);

    if (fetchNotesList.fulfilled.match(action)) {
      const state = storeApi.getState() as RootState;
      const userId = state.userAuth?.id;
      // Don't tear down a healthy channel just because a catch-up list refresh
      // completed — only (re)subscribe when missing or for a different user.
      if (userId && (subscribedUserId !== userId || !channel)) {
        // Catch-up closes the gap between the list query and SUBSCRIBED.
        subscribe(userId, { catchUp: true });
      }
    }

    if ((action as { type?: string }).type === "notes/resetNotesState") {
      unsubscribe();
    }

    return result;
  };
};
