"use client";

// features/war-room/components/thread/ThreadAgentPanel.tsx
//
// The composed REAL Scribe "Agent+" collaboration panel, embedded in a War Room
// tile. This is the heavy half of the Agent tab — it pulls the whole agent
// execution + TTS + working-document graph, so ThreadAgentTab loads it lazily via
// next/dynamic (ssr:false), the same way ThreadAudioTab loads CleanupPad. Keeping
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
// (its Audio session), resolved by ThreadAgentTab. Sharing that session is the
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

import { useCallback, useEffect, useRef, useState } from "react";
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
  selectAttachmentsForThread,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";
import { loadThreadSubtasks } from "@/features/war-room/redux/thunks";
import { buildThreadAgentContextEntries } from "@/features/war-room/service/warRoomAgentContext";
import { prefetchThreadFileSignals } from "@/features/war-room/service/prefetchThreadFileSignals";
import { WAR_ROOM_THREAD_AGENT_ID } from "@/features/war-room/constants";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";
import { setClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { WAR_ROOM_TOOL_NAMES } from "@/features/agents/war-room-tools/tools/names";
import {
  registerWarRoomToolBinding,
  clearWarRoomToolBinding,
} from "@/features/agents/war-room-tools/binding-registry";

console.log(
  "[Track War Room] 8c, ThreadAgentPanel.tsx — module evaluated (chunk loaded)",
);

export default function ThreadAgentPanel({
  sessionId,
  threadId,
  compact,
}: {
  sessionId: string;
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();

  // ── Tile context (READ-ONLY) the assistant should SEE every turn ─────────
  // Subscribe to the tile's task / subtasks / active note / attachments so this
  // panel re-renders (and rebuilds the extra-context callback) whenever any of
  // them changes. The data itself is already in Redux (hydrated on room load);
  // we only need subtasks pulled in (hydrateTileTasks loads the parent only).
  const taskId = useAppSelector(selectThreadTaskId(threadId));
  const task = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId) : undefined,
  );
  const subtasks = useAppSelector((s) =>
    taskId ? selectSubtasksByParent(s, taskId) : EMPTY_SUBTASKS,
  );
  const noteId = useAppSelector(selectActiveNoteId(threadId));
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );
  const attachments = useAppSelector(selectAttachmentsForThread(threadId));

  // Ensure the task's subtasks are hydrated so `tile_task.subtasks` is complete.
  useEffect(() => {
    if (taskId) void dispatch(loadThreadSubtasks(taskId));
  }, [taskId, dispatch]);

  // ── Hydrate the attached files' extraction + RAG-searchable signals ──────
  // The `war_room` <files> manifest is built SYNC from Redux + a module cache,
  // so the flags (extraction="yes|no", rag="indexed|no") are only accurate once
  // we've probed each attached cld_file. Prefetch on mount / whenever the file
  // set changes; bumping `filesProbeTick` when the searchable probes land
  // re-pushes the context with the now-known flags. Best-effort — a failed
  // probe just leaves a flag unknown (the builder omits it), never blocks.
  const [filesProbeTick, setFilesProbeTick] = useState(0);
  const userFileIds = attachments
    .filter((a) => a.entity_type === "user_file")
    .map((a) => a.entity_id)
    .join(",");
  useEffect(() => {
    const ids = userFileIds ? userFileIds.split(",") : [];
    if (ids.length === 0) return undefined;
    const ac = new AbortController();
    void prefetchThreadFileSignals({
      fileIds: ids,
      dispatch,
      signal: ac.signal,
      onResolved: () => setFilesProbeTick((t) => t + 1),
    });
    return () => ac.abort();
  }, [userFileIds, dispatch]);

  // A builder the assistant hook calls against fresh state. Its identity changes
  // whenever the tile's task/subtasks/note/files change (the values it closes
  // over), which is exactly what re-triggers the hook's context-refresh effect.
  // Keeping it keyed on the data — not just threadId — is what makes edits to the
  // task/note/files reach the agent without waiting for a recording or cleanup.
  const buildExtraEntries = useCallback(
    (state: RootState) => buildThreadAgentContextEntries(state, threadId),
    // Deliberately keyed on the underlying tile DATA (not just threadId) so the
    // hook re-pushes context when the task/note/files change. (exhaustive-deps
    // is disabled repo-wide; listed here for intent.)
    [
      threadId,
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
      // Re-push when the attached files' extraction/RAG signals resolve, so the
      // <files> manifest's flags become accurate without a recording/cleanup.
      filesProbeTick,
    ],
  );

  // Resolve this tile's assistant conversation (same hook the screens use; it is
  // de-duplicated by sessionId, so mounting it here costs nothing extra). We
  // merge in the tile's read-only context via buildExtraEntries (Scribe omits
  // this, so its context is untouched), and default a FRESH tile conversation to
  // the dedicated War Room Thread persona (which knows its thread role and can
  // list/read the user's data) instead of the audio-cleanup scribe.
  const { conversationId } = useStudioAssistant(sessionId, {
    buildExtraEntries,
    defaultAgentId: WAR_ROOM_THREAD_AGENT_ID,
  });

  useEffect(() => {
    traceWarRoomRenderPath(9, "ThreadAgentPanel.tsx", "mount", {
      threadId,
      studioSessionId: sessionId,
    });
  }, [threadId, sessionId]);

  useEffect(() => {
    if (!conversationId) return;
    traceWarRoomRenderPath(10, "ThreadAgentPanel.tsx", "conversation ready", {
      threadId,
      conversationId,
    });
  }, [threadId, conversationId]);

  // ── Arm the War Room WRITE tools on THIS conversation only ───────────────
  // The war-room agent is the same studio-assistant agent used by Scribe; the
  // ONLY thing that lets it EDIT the tile (vs just see it) is arming the
  // war_room_* client tools here + binding the tile so the handlers know which
  // tile to mutate. Scribe never mounts this panel, so its conversation stays
  // read-only. buildToolInjection reads instanceClientTools on every turn and
  // declares these as delegated tools; the server then offers them to the agent
  // and emits `tool_delegated` when one is called (routed to the war-room
  // dispatcher, which gates the write behind the user's approval).
  useEffect(() => {
    if (!conversationId) return undefined;
    registerWarRoomToolBinding(conversationId, threadId);
    dispatch(
      setClientTools({
        conversationId,
        // Plus the read-only war_room_read_thread (no tile binding, no HITL —
        // routes to the read dispatcher by name) to read ANOTHER thread's chain
        // by its tile id. NOTE: war_room_read_file is intentionally NOT armed —
        // reading an attached file's extracted text is SERVER-side data and was
        // wrongly a client-delegated tool, which HARD-SUSPENDS the agent loop
        // (the conversation "stops") to round-trip server data through React.
        // File reading now happens server-side via the agent's data tools (see
        // the war-room-thread surface defaults + the aidream file-extraction read).
        tools: [...WAR_ROOM_TOOL_NAMES, "war_room_read_thread"],
      }),
    );
    return () => {
      clearWarRoomToolBinding(conversationId, threadId);
      // Disarm on unmount so a later non-war-room use of the same conversation
      // (should never happen — it's durable per session — but be exact) doesn't
      // keep these tools offered.
      dispatch(setClientTools({ conversationId, tools: [] }));
    };
  }, [conversationId, threadId, dispatch]);

  // Re-pull the working document the moment this session's agent turn finishes,
  // covering the non-active-tile realtime gap described above.
  const status = useAppSelector((s) =>
    conversationId
      ? selectPrimaryRequest(conversationId)(s)?.status
      : undefined,
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
      <AssistantAgentBar sessionId={sessionId} compact={compact} />
      <WorkingDocumentHeader sessionId={sessionId} compact={compact} />

      {/* The Agent+ conversation + voice controls fill the rest. `revealInput`
          shows the REAL chat SmartAgentInput (its ConversationContextRail —
          working document + scratchpad + context layers + attachments — plus the
          textarea / resource chips / run controls), so the War Room agent tab IS
          the chat surface, not a stripped voice-only fork. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ExperimentalAgentScreen
          sessionId={sessionId}
          compact={compact}
          revealInput
        />
      </div>
    </div>
  );
}

// Stable empty reference so the no-task case never produces a new array (which
// would needlessly bust the buildExtraEntries identity every render).
const EMPTY_SUBTASKS: ReturnType<typeof selectSubtasksByParent> = [];
