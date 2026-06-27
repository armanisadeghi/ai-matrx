// features/notes/redux/realtimeMiddleware.ts
// Single Supabase realtime subscription for notes, managed as Redux middleware.
// Starts on fetchNotesList.fulfilled, stops on resetNotesState (logout).
// Uses _savingNoteIds for echo suppression.

import type { Middleware } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { RootState } from "@/lib/redux/store";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  upsertNoteFromServer,
  removeNote,
  setRealtimeConnected,
} from "./slice";
import { fetchNotesList } from "./thunks";

let channel: RealtimeChannel | null = null;

/**
 * Middleware that manages a single Supabase realtime channel for notes.
 * - Subscribes when fetchNotesList completes successfully
 * - Unsubscribes on resetNotesState (logout / cleanup)
 * - Echo suppression: ignores UPDATE events for notes in _savingNoteIds
 */
export const notesRealtimeMiddleware: Middleware = (storeApi) => {
  function subscribe(userId: string) {
    // Prevent duplicate subscriptions
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    channel = supabase
      .channel(`notes-rt:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `created_by=eq.${userId}`,
        },
        (payload) => {
          const state = storeApi.getState() as RootState;
          const savingIds = state.notes._savingNoteIds;
          const eventType = payload.eventType;
          const newRecord = payload.new as Record<string, unknown> | undefined;
          const oldRecord = payload.old as Record<string, unknown> | undefined;

          if (eventType === "UPDATE" && newRecord) {
            const noteId = newRecord.id as string;

            // Echo suppression — skip our own saves
            if (savingIds.includes(noteId)) {
              console.log("[Notes RT] Echo suppressed for", noteId);
              return;
            }

            // Skip soft-deleted
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
                  updated_at: newRecord.updated_at as string,
                },
                fetchStatus: "full",
              }),
            );

            // Notify sidebar of label/folder changes via custom events
            window.dispatchEvent(
              new CustomEvent("notes:labelChange", {
                detail: { noteId, label: newRecord.label },
              }),
            );
          }

          if (eventType === "INSERT" && newRecord) {
            if (newRecord.deleted_at) return;
            console.log("[Notes RT] INSERT", newRecord.id);
            storeApi.dispatch(
              upsertNoteFromServer({
                note: {
                  id: newRecord.id as string,
                  label: (newRecord.label as string) ?? "New Note",
                  folder_name: (newRecord.folder_name as string) ?? "Draft",
                  tags: (newRecord.tags as string[]) ?? [],
                  updated_at:
                    (newRecord.updated_at as string) ??
                    new Date().toISOString(),
                },
                fetchStatus: "list",
              }),
            );

            window.dispatchEvent(
              new CustomEvent("notes:created", {
                detail: {
                  id: newRecord.id,
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
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[Notes RT] Connected");
          storeApi.dispatch(setRealtimeConnected(true));
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Notes RT] Error:", err);
          storeApi.dispatch(setRealtimeConnected(false));
        } else if (status === "TIMED_OUT") {
          console.warn("[Notes RT] Timed out");
          storeApi.dispatch(setRealtimeConnected(false));
        }
      });
  }

  function unsubscribe() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
      storeApi.dispatch(setRealtimeConnected(false));
      console.log("[Notes RT] Disconnected");
    }
  }

  return (next) => (action) => {
    const result = next(action);

    // Start subscription when notes list is loaded
    if (fetchNotesList.fulfilled.match(action)) {
      const state = storeApi.getState() as RootState;
      const userId = state.userAuth?.id;
      if (userId && !channel) {
        subscribe(userId);
      }
    }

    // Stop subscription on state reset (logout)
    if ((action as { type?: string }).type === "notes/resetNotesState") {
      unsubscribe();
    }

    return result;
  };
};
