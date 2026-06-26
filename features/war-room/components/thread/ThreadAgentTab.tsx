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
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveAudioSessionId } from "@/features/war-room/redux/selectors";
import { ensureThreadAudioSession } from "@/features/war-room/redux/thunks";
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
    <ThreadAgentPanel sessionId={sessionId} threadId={threadId} compact={compact} />
  );
}
