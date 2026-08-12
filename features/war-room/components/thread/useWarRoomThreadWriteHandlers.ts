"use client";

// features/war-room/components/thread/useWarRoomThreadWriteHandlers.ts
//
// The WRITE half of the `matrx-user/war-room-thread` surface — one handler per
// `writeTargets` entry declared in
// `features/surfaces/manifests/war-room-thread.manifest.ts`.
//
// Rules this file exists to hold (mirrors the tasks exemplar in
// `features/tasks/components/editor/TaskEditorBody.tsx` and its room-level twin
// `../room/useWarRoomWriteHandlers.ts`):
//  • Every handler VALIDATES its input and THROWS on a bad shape. The writeback
//    seam (`features/surfaces/runtime/surface-writeback.ts`) converts a throw
//    into a safe error envelope the agent reads and can correct against — a
//    silently coerced value would be a lie told to both sides.
//  • Every handler runs the SAME dispatch the user's own control fires:
//    `updateNoteContent` is exactly what `ThreadNotesTab`'s editor `onChange`
//    dispatches (autosave middleware persists it), and `updateTaskFieldThunk`
//    is what `ThreadTaskTab` dispatches. Never a parallel write, never the
//    service directly, never raw supabase.
//  • Every handler resolves its target row the SAME way `buildWarRoomThreadScope`
//    resolved the read twin it emitted (`selectActiveNoteId` /
//    `selectThreadTaskId`), so the value the agent SAW and the row this WRITES
//    are the same record.
//  • A thread with no note (or no anchored task) REFUSES loudly rather than
//    inventing one — creating the record is the user's call, not a side effect
//    of an edit.
//
// Handlers are rebuilt per call (the `getWriteHandlers` contract), so they read
// the LIVE store rather than a render snapshot.

import { useCallback } from "react";

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { updateNoteContent } from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import {
  TASK_STATUSES,
  type TaskStatus,
} from "@/features/tasks/constants/status";
import { updateTaskFieldThunk } from "@/features/tasks/redux/thunks";
import {
  selectActiveNoteId,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";

export function useWarRoomThreadWriteHandlers(
  threadId: string,
): () => SurfaceWriteHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useCallback((): SurfaceWriteHandlers => {
    /**
     * The note the agent means by "this thread's note" — resolved EXACTLY as
     * `buildWarRoomThreadScope` resolves the `note_id` / `note_content` it
     * emitted, so the body the agent read and the row this writes are one.
     */
    const requireNoteId = (target: string): string => {
      const noteId = selectActiveNoteId(threadId)(store.getState());
      if (!noteId)
        throw new Error(
          `${target}: this thread has no note yet, so there is no body to write. Ask the user to add a note from the thread's Notes tab first.`,
        );
      return noteId;
    };

    /**
     * The note body as the EDITOR currently holds it, hydrating first if need be.
     *
     * Notes load LAZILY — `ThreadNotesTab` fetches on first view — so a thread
     * whose Notes tab was never opened has no record in the notes slice at all.
     * Writing into that gap is silent data loss in both directions: the reducer
     * has no note to patch, and `autoSaveMiddleware` bails on the missing (or
     * non-dirty) record, so the agent would be told "applied" for a write that
     * never reached the note. Hydrate first, and refuse loudly if it will not
     * load — "not loaded" is never the same answer as "empty".
     */
    const loadedNoteContent = async (
      noteId: string,
      target: string,
    ): Promise<string> => {
      const read = () => selectNoteById(noteId)(store.getState());
      if (read()?.content === undefined) await dispatch(fetchNoteContent(noteId));
      const note = read();
      if (!note || note.content === undefined)
        throw new Error(
          `${target}: the note's body could not be loaded, so it cannot be written safely. Open the thread's Notes tab once and try again.`,
        );
      // A thread can still carry an assignment to a SOFT-DELETED note, and
      // `selectActiveNoteId` will happily hand it back (it filters on
      // `is_active`, not `deleted_at`). Writing there succeeds all the way to
      // the database and the user never sees a character of it — the worst
      // shape of "applied" there is. Refuse and name the real fix.
      if (note.deleted_at)
        throw new Error(
          `${target}: the note this thread points at has been deleted, so writing to it would be invisible to the user. Ask them to add a new note from the thread's Notes tab first.`,
        );
      // `null` is a LOADED but empty body — distinct from `undefined` above.
      return note.content ?? "";
    };

    /**
     * Confirm the editor buffer actually took the value. `updateNoteContent` is
     * a plain reducer over a record that may not exist, so a no-op is otherwise
     * indistinguishable from a successful write.
     */
    const confirmNoteWrite = (noteId: string, expected: string) => {
      const saved = selectNoteById(noteId)(store.getState())?.content;
      if (saved !== expected)
        throw new Error(
          "The note edit did not land in the editor buffer — nothing was changed.",
        );
    };

    /**
     * The task the thread is anchored to. `selectThreadTaskId` is the same
     * resolution `buildWarRoomThreadScope` used for `task_id`/`task_title`.
     */
    const requireTaskId = (target: string): string => {
      const taskId = selectThreadTaskId(threadId)(store.getState());
      if (!taskId)
        throw new Error(
          `${target}: this thread is not anchored to a task, so there is no task to update. Only threads with a task anchor have one.`,
        );
      return taskId;
    };

    return {
      // ── Thread note ─────────────────────────────────────────────────────
      thread_note_content: async (value: unknown) => {
        if (typeof value !== "string")
          throw new Error("thread_note_content expects a string.");
        const noteId = requireNoteId("thread_note_content");
        // Hydrate before replacing too, not just before appending: the record
        // must exist for the reducer to patch AND for autosave to see it dirty.
        await loadedNoteContent(noteId, "thread_note_content");
        // The SAME action `ThreadNotesTab`'s editor onChange dispatches — the
        // notes autosave middleware persists it exactly as it does the user's
        // typing, and the edit stays undoable in the editor.
        dispatch(updateNoteContent({ id: noteId, content: value }));
        confirmNoteWrite(noteId, value);
      },
      append_to_thread_note: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "append_to_thread_note expects a non-empty string (the new markdown to add).",
          );
        const noteId = requireNoteId("append_to_thread_note");
        const current = await loadedNoteContent(noteId, "append_to_thread_note");
        const addition = value.trim();
        const next = current.trim()
          ? `${current.replace(/\s+$/, "")}\n\n${addition}`
          : addition;
        dispatch(updateNoteContent({ id: noteId, content: next }));
        confirmNoteWrite(noteId, next);
      },

      // ── Anchored task ───────────────────────────────────────────────────
      thread_task_title: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("thread_task_title expects a non-empty string.");
        const taskId = requireTaskId("thread_task_title");
        const next = value.trim();
        await dispatch(updateTaskFieldThunk({ taskId, patch: { title: next } }));
        // The thunk is optimistic and reports failure by rolling the store
        // back, so the store is the only honest evidence the write landed.
        const saved = selectTaskById(store.getState(), taskId)?.title;
        if ((saved ?? "").trim() !== next)
          throw new Error(
            "Retitling the thread's task did not persist — the server rejected the change.",
          );
      },
      thread_task_status: async (value: unknown) => {
        if (typeof value !== "string")
          throw new Error("thread_task_status expects a string.");
        // Checked against the canonical vocabulary constant, never re-typed
        // literals — the manifest description is generated from the same array.
        if (!(TASK_STATUSES as readonly string[]).includes(value))
          throw new Error(
            `thread_task_status must be one of: ${TASK_STATUSES.join(", ")}. Received "${value}".`,
          );
        const taskId = requireTaskId("thread_task_status");
        const next = value as TaskStatus;
        await dispatch(
          updateTaskFieldThunk({ taskId, patch: { status: next } }),
        );
        const saved = selectTaskById(store.getState(), taskId)?.status;
        if (saved !== next)
          throw new Error(
            "Updating the thread task's status did not persist — the server rejected the change.",
          );
      },
    };
  }, [dispatch, store, threadId]);
}
