"use client";

// features/war-room/components/tile/TileAgentPanel.tsx
//
// The composed REAL Scribe "Agent+" collaboration panel, embedded in a War Room
// tile. This is the heavy half of the Agent tab — it pulls the whole agent
// execution + TTS + working-document graph, so TileAgentTab loads it lazily via
// next/dynamic (ssr:false), the same way TileAudioTab loads CleanupPad. Keeping
// it out of the room bundle lets the gallery hydrate fast.
//
// We REUSE the Scribe components unchanged — they are parameterized purely by a
// studio_sessions id:
//   • AssistantAgentBar       — pick / switch the assistant agent (+ history)
//   • WorkingDocumentHeader   — the user+agent co-edited working document
//   • ExperimentalAgentScreen — the Agent+ conversation column + the
//                               [auto-voice · record · text-input] controls and
//                               the RecordActionSheet (send vs transcribe).
//
// What we DON'T bring over is the Scribe mobile page shell (the ScribeScreen
// header, mode tabs, h-dvh / safe-area chrome). We compose the three pieces in a
// plain bounded flex column — agent bar + working doc on top, the conversation +
// voice below — exactly as ScribeScreen stacks them, minus the page header.
//
// SESSION BINDING: the `sessionId` here is the TILE's own studio_sessions row
// (its Audio session), resolved by TileAgentTab. Sharing that session is the
// whole point — the tile's recordings ARE the agent's transcript context, and
// agent edits land in the same working document the Audio tab transcribes into.
//
// MULTI-TILE REALTIME RECOVERY: the studio realtime middleware subscribes the
// per-session document/segment channel for ONLY ONE session at a time
// (transcriptStudio.activeSessionId). In a War Room with several Agent tiles,
// the agent can edit the working document (server-side ctx_patch) for a tile
// whose session is NOT the active realtime channel, so that tile would miss the
// patch. We backstop that by re-fetching this session's documents whenever its
// own agent turn completes — the edit has landed by then. (Loud-recovery: a
// targeted fetch keyed off THIS tile's conversation, not a guess.)

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useStudioAssistant } from "@/features/transcript-studio/hooks/useStudioAssistant";
import { fetchStudioDocumentsThunk } from "@/features/transcript-studio/redux/thunks";
import { AssistantAgentBar } from "@/features/transcript-studio/components/scribe/AssistantAgentBar";
import { WorkingDocumentHeader } from "@/features/transcript-studio/components/scribe/WorkingDocumentHeader";
import { ExperimentalAgentScreen } from "@/features/transcript-studio/components/scribe/ExperimentalAgentScreen";
import {
  selectSubtasksByParent,
  selectTaskById,
} from "@/features/agent-context/redux/tasksSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";
import {
  selectActiveNoteId,
  selectAttachmentsForTile,
  selectTileById,
} from "@/features/war-room/redux/selectors";
import { loadTileSubtasks } from "@/features/war-room/redux/thunks";
import { buildTileAgentContextEntries } from "@/features/war-room/service/warRoomAgentContext";

export default function TileAgentPanel({
  sessionId,
  tileId,
}: {
  sessionId: string;
  tileId: string;
}) {
  const dispatch = useAppDispatch();

  // ── Tile context (READ-ONLY) the assistant should SEE every turn ─────────
  // Subscribe to the tile's task / subtasks / active note / attachments so this
  // panel re-renders (and rebuilds the extra-context callback) whenever any of
  // them changes. The data itself is already in Redux (hydrated on room load);
  // we only need subtasks pulled in (hydrateTileTasks loads the parent only).
  const tile = useAppSelector(selectTileById(tileId));
  const taskId = tile?.task_id ?? null;
  const task = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId) : undefined,
  );
  const subtasks = useAppSelector((s) =>
    taskId ? selectSubtasksByParent(s, taskId) : EMPTY_SUBTASKS,
  );
  const noteId = useAppSelector(selectActiveNoteId(tileId)) ?? tile?.note_id ?? null;
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );
  const attachments = useAppSelector(selectAttachmentsForTile(tileId));

  // Ensure the task's subtasks are hydrated so `tile_task.subtasks` is complete.
  useEffect(() => {
    if (taskId) void dispatch(loadTileSubtasks(taskId));
  }, [taskId, dispatch]);

  // A builder the assistant hook calls against fresh state. Its identity changes
  // whenever the tile's task/subtasks/note/files change (the values it closes
  // over), which is exactly what re-triggers the hook's context-refresh effect.
  // Keeping it keyed on the data — not just tileId — is what makes edits to the
  // task/note/files reach the agent without waiting for a recording or cleanup.
  const buildExtraEntries = useCallback(
    (state: RootState) => buildTileAgentContextEntries(state, tileId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bust identity on
    // the underlying tile data so the hook re-pushes context when it changes.
    [
      tileId,
      taskId,
      task?.title,
      task?.status,
      task?.priority,
      task?.due_date,
      task?.description,
      subtasks,
      noteId,
      note?.content,
      note?.label,
      attachments,
    ],
  );

  // Resolve this tile's assistant conversation (same hook the screens use; it is
  // de-duplicated by sessionId, so mounting it here costs nothing extra). We
  // merge in the tile's read-only context via buildExtraEntries (Scribe omits
  // this, so its context is untouched).
  const { conversationId } = useStudioAssistant(sessionId, { buildExtraEntries });

  // Re-pull the working document the moment this session's agent turn finishes,
  // covering the non-active-tile realtime gap described above.
  const status = useAppSelector((s) =>
    conversationId ? selectPrimaryRequest(conversationId)(s)?.status : undefined,
  );
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (status === "complete" && prevStatusRef.current !== "complete") {
      void dispatch(fetchStudioDocumentsThunk({ sessionId }));
    }
    prevStatusRef.current = status;
  }, [status, sessionId, dispatch]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Agent picker + co-edited working document — shared header, exactly as
          ScribeScreen stacks them above the body. Both shrink-0; the working
          document expands in place when opened. */}
      <AssistantAgentBar sessionId={sessionId} />
      <WorkingDocumentHeader sessionId={sessionId} />

      {/* The Agent+ conversation + voice controls fill the rest. */}
      <div className="min-h-0 flex-1">
        <ExperimentalAgentScreen sessionId={sessionId} />
      </div>
    </div>
  );
}

// Stable empty reference so the no-task case never produces a new array (which
// would needlessly bust the buildExtraEntries identity every render).
const EMPTY_SUBTASKS: ReturnType<typeof selectSubtasksByParent> = [];
