"use client";

// features/war-room/components/room/useWarRoomWriteHandlers.ts
//
// The WRITE half of the `matrx-user/war-room` surface — one handler per
// `writeTargets` entry declared in `features/surfaces/manifests/war-room.manifest.ts`.
//
// Rules this file exists to hold (mirrors the tasks exemplar in
// `features/tasks/components/editor/TaskEditorBody.tsx`):
//  • Every handler VALIDATES its input and THROWS on a bad shape. The writeback
//    seam (`features/surfaces/runtime/surface-writeback.ts`) converts a throw
//    into a safe error envelope the agent reads and can correct against — a
//    silently coerced value would be a lie told to both sides.
//  • Every handler runs the SAME thunk the user's own control dispatches:
//    `updateRoomIdentity` (RoomIdentityButton), `renameThread`
//    (useThreadActions.rename), `createThread` (QuickAddThread). Never a
//    parallel write, never the service directly, never raw supabase.
//  • Every handler CONFIRMS the write actually landed before returning. The
//    room thunks are optimistic and/or swallow their errors into a toast, so a
//    bare `await dispatch(...)` would report success for a write the server
//    rejected — the one failure mode that makes an agent confidently wrong.
//    `updateRoomIdentity` reports via its boolean; `renameThread` and
//    `createThread` are checked against the store afterwards.
//
// Handlers are rebuilt per call (the `getWriteHandlers` contract), so they read
// the LIVE store rather than a render snapshot.

import { useCallback } from "react";

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  selectOrderedGalleryThreadIds,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import {
  createThread,
  renameThread,
  updateRoomIdentity,
} from "@/features/war-room/redux/thunks";
import { resolveStagedId, useRoomView } from "./roomViewContext";

/** Max threads one `add_threads` call may create — a runaway-model backstop. */
const MAX_ADDED_THREADS = 12;

export function useWarRoomWriteHandlers(
  sessionId: string,
): () => SurfaceWriteHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const roomView = useRoomView();
  const { chosenStageId } = roomView;

  return useCallback((): SurfaceWriteHandlers => {
    /**
     * The thread the agent means by "the staged thread" — resolved EXACTLY as
     * `buildWarRoomRoomScope` resolves the `active_thread_id` it emitted, so
     * the read twin the agent saw and the row this writes are the same thread.
     */
    const stagedThreadId = (): string | null => {
      const state = store.getState();
      const visible = selectOrderedGalleryThreadIds(sessionId)(state);
      return (
        resolveStagedId(chosenStageId, visible) ??
        state.warRoom.sessionsById[sessionId]?.active_thread_id ??
        visible[0] ??
        null
      );
    };

    return {
      // ── Room identity ───────────────────────────────────────────────────
      room_name: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("room_name expects a non-empty string.");
        const ok = await dispatch(
          updateRoomIdentity(sessionId, { title: value.trim() }),
        );
        // Optimistic thunk: a rejected server write is rolled back in the
        // store and reported there, so `false` MUST fail the write here too.
        if (!ok)
          throw new Error(
            "Renaming the room did not persist — the server rejected the change (or the room is not loaded).",
          );
      },
      room_description: async (value: unknown) => {
        if (typeof value !== "string")
          throw new Error(
            "room_description expects a string (empty string clears it).",
          );
        const ok = await dispatch(
          updateRoomIdentity(sessionId, { description: value }),
        );
        if (!ok)
          throw new Error(
            "Saving the room description did not persist — the server rejected the change (or the room is not loaded).",
          );
      },

      // ── Threads ─────────────────────────────────────────────────────────
      active_thread_title: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("active_thread_title expects a non-empty string.");
        const threadId = stagedThreadId();
        // Refuse loudly rather than writing into nothing — with no staged
        // thread there is no row this target could mean.
        if (!threadId)
          throw new Error(
            "This room has no staged thread, so there is no thread title to write. Ask the user to stage a thread first.",
          );
        const next = value.trim();
        await dispatch(renameThread(threadId, next));
        // `renameThread` swallows its failure into a toast, so the store is
        // the only honest evidence that the rename landed.
        const saved = store.getState().warRoom.threadsById[threadId]?.title;
        if ((saved ?? "").trim() !== next)
          throw new Error(
            "Retitling the staged thread did not persist — the server rejected the change.",
          );
      },
      add_threads: async (value: unknown) => {
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          !value.every((v) => typeof v === "string" && v.trim())
        )
          throw new Error(
            "add_threads expects a non-empty array of thread title strings.",
          );
        if (value.length > MAX_ADDED_THREADS)
          throw new Error(
            `add_threads accepts at most ${MAX_ADDED_THREADS} threads per call; ${value.length} were requested.`,
          );
        // Positions append after everything already in the room — the same
        // `allIds.length` the Add-thread card passes as `nextPosition`.
        const basePosition = selectThreadIdsForRoom(sessionId)(
          store.getState(),
        ).length;
        for (const [index, title] of (value as string[]).entries()) {
          const thread = await dispatch(
            createThread({
              roomId: sessionId,
              position: basePosition + index,
              title: title.trim(),
              anchorType: "canvas",
              activeTab: "task",
            }),
          );
          // `createThread` returns null (and toasts) on failure — stop at the
          // first one rather than reporting a partial batch as a success.
          if (!thread)
            throw new Error(
              `Creating the thread "${title.trim()}" failed; ${index} of ${value.length} thread(s) were created.`,
            );
        }
      },
    };
  }, [dispatch, store, sessionId, chosenStageId]);
}
