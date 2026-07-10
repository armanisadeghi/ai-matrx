// features/notes/redux/realtimeMiddleware.ts
// Single Supabase realtime subscription for notes, managed as Redux middleware.
// Starts on fetchNotesList.fulfilled, stops on resetNotesState (logout).
// Echo suppression: _savingNoteIds + _pendingDispatchIds + sync-engine isPendingEcho.
//
// No `created_by=` filter — RLS + REPLICA IDENTITY FULL gates events so both
// owned notes and shared-with-me notes arrive. Filter-by-owner hid sharee updates.

import type { Middleware } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RootState } from "@/lib/redux/rootReducer";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import type { SyncEngineApi } from "@/lib/sync/engine/middleware";
import {
  upsertNoteFromServer,
  removeNote,
  setRealtimeConnected,
} from "./slice";
import { fetchNotesList, fetchSharedNotesList } from "./thunks";

let channel: RealtimeChannel | null = null;
let subscribedUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

type StoreWithSync = {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
  _sync?: { engineApi?: () => SyncEngineApi | null };
};

function isOwnEcho(storeApi: StoreWithSync, noteId: string): boolean {
  const state = storeApi.getState() as RootState;
  // Only suppress while a save is in flight. The old 10s `_pendingDispatchIds`
  // window dropped collaborator edits that arrived right after a local save.
  if (state.notes._savingNoteIds.includes(noteId)) return true;
  const engineApi = storeApi._sync?.engineApi?.() ?? null;
  if (engineApi?.isPendingEcho?.("notes", noteId)) return true;
  return false;
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
export const notesRealtimeMiddleware: Middleware = (storeApi) => {
  const storeWithSync = storeApi as typeof storeApi & StoreWithSync;

  function scheduleReconnect(userId: string, reason: string) {
    clearReconnectTimer();
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

      if (isOwnEcho(storeWithSync, noteId)) {
        console.log("[Notes RT] Echo suppressed for", noteId);
        return;
      }

      if (newRecord.deleted_at) {
        storeApi.dispatch(removeNote(noteId));
        return;
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
      if (isOwnEcho(storeWithSync, noteId)) {
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
          reconnectAttempt = 0;
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
    subscribedUserId = null;
    reconnectAttempt = 0;
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
