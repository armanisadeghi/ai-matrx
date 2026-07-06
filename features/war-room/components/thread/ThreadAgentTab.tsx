"use client";

// features/war-room/components/thread/ThreadAgentTab.tsx
//
// Agent view: the REAL Scribe "Agent+" collaboration panel, embedded. The user
// talks to (and records turns for) an assistant agent while co-editing a working
// document — all bound to the TILE's own studio_sessions row, the SAME session
// the Audio tab records into. So the tile's recordings are the agent's transcript
// context, and the agent's working-document edits land in the doc this tile owns.
//
// This thin shell resolves the tile's session id exactly like ThreadAudioTab
// (selectActiveAudioSessionId → ensureThreadAudioSession; spinner until it exists)
// and then renders the composed panel. The panel itself is code-split via
// next/dynamic (ssr:false) — it pulls the whole agent execution + TTS +
// working-document graph, so loading it lazily keeps it out of the War Room
// bundle and the gallery hydrates fast.

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectActiveAudioSessionId } from "@/features/war-room/redux/selectors";
import {
  ensureThreadAudioSession,
  startThreadConversation,
} from "@/features/war-room/redux/thunks";
import { useThreadConversationSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

// Code-split: ThreadAgentPanel pulls the Scribe Agent+ graph (agents execution +
// TTS + working-document). Lazy so it never weighs down the room bundle; it
// loads on demand the first time an Agent tab is opened.
const ThreadAgentPanel = dynamic(
  () =>
    import("./ThreadAgentPanel").then((m) => {
      console.log(
        "[Track War Room] 8b, ThreadAgentTab.tsx — ThreadAgentPanel dynamic chunk loaded",
      );
      return m;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

/**
 * The Chat tab's toolbar row — identical chrome to Notes/Audio: blue chat
 * icon, then the canonical AssociationEntitySelect over the thread's
 * `conversation → thread` edges. The label is the conversation's real title
 * (the server auto-labels seconds after the first turn); a chat that hasn't
 * been submitted yet shows its AGENT's name instead. "+" doesn't name a chat —
 * it opens the canonical AgentListDropdown (the /chat route picker): picking
 * an agent mints a fresh conversation, attaches it to the thread, and binds
 * the panel to it.
 */
function ThreadChatChrome({
  threadId,
  sessionId,
}: {
  threadId: string;
  sessionId: string | null;
}) {
  const dispatch = useAppDispatch();
  const adapter = useThreadConversationSelectAdapter(threadId, sessionId);

  return (
    <AssociationEntitySelect
      token="conversation"
      adapter={adapter}
      align="start"
      emptyLabel="Chat"
      iconClassName="text-primary"
      className="min-w-0 flex-1"
      createSlot={(close) => (
        <AgentListDropdown
          onSelect={(agentId) => {
            if (!sessionId) return;
            void dispatch(
              startThreadConversation(threadId, sessionId, agentId),
            );
            close();
          }}
          triggerSlot={
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              New Chat
            </button>
          }
        />
      )}
    />
  );
}

export function ThreadAgentTab({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectActiveAudioSessionId(threadId));

  // Ensure the tile has a backing studio session so the agent panel always has
  // one to bind to (idempotent + coalesced inside the thunk). Shared with the
  // Audio tab — recordings made there become this agent's transcript context.
  useEffect(() => {
    if (!sessionId) void dispatch(ensureThreadAudioSession(threadId));
  }, [sessionId, threadId, dispatch]);

  useEffect(() => {
    traceWarRoomRenderPath(7, "ThreadAgentTab.tsx", "mount", { threadId });
  }, [threadId]);

  useEffect(() => {
    if (!sessionId) return;
    traceWarRoomRenderPath(8, "ThreadAgentTab.tsx", "studio session ready", {
      threadId,
      studioSessionId: sessionId,
    });
  }, [threadId, sessionId]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pass the threadId through so the panel can expose the tile's task / notes /
  // files to the assistant as read-only context (ThreadAgentPanel builds those).
  //
  // NO `key={sessionId}` here: a key would force a full remount on every session
  // switch, which unmounts ExperimentalAgentScreen and KILLS in-flight read-aloud
  // (the speaker now lives at app-root, but the screen still publishes/clears its
  // request on mount/unmount). ThreadAgentPanel + ExperimentalAgentScreen re-bind
  // to a changed `sessionId` prop via their own effects, so a remount is both
  // unnecessary and harmful. See providers/AudioOutputHost.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact ? (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
          <ThreadChatChrome threadId={threadId} sessionId={sessionId} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ThreadAgentPanel
          sessionId={sessionId}
          threadId={threadId}
          compact={compact}
        />
      </div>
    </div>
  );
}
