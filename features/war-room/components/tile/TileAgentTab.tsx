"use client";

// features/war-room/components/tile/TileAgentTab.tsx
//
// Agent view: the REAL Scribe "Agent+" collaboration panel, embedded. The user
// talks to (and records turns for) an assistant agent while co-editing a working
// document — all bound to the TILE's own studio_sessions row, the SAME session
// the Audio tab records into. So the tile's recordings are the agent's transcript
// context, and the agent's working-document edits land in the doc this tile owns.
//
// This thin shell resolves the tile's session id exactly like TileAudioTab
// (selectActiveAudioSessionId → ensureTileAudioSession; spinner until it exists)
// and then renders the composed panel. The panel itself is code-split via
// next/dynamic (ssr:false) — it pulls the whole agent execution + TTS +
// working-document graph, so loading it lazily keeps it out of the War Room
// bundle and the gallery hydrates fast.

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveAudioSessionId } from "@/features/war-room/redux/selectors";
import { ensureTileAudioSession } from "@/features/war-room/redux/thunks";

// Code-split: TileAgentPanel pulls the Scribe Agent+ graph (agents execution +
// TTS + working-document). Lazy so it never weighs down the room bundle; it
// loads on demand the first time an Agent tab is opened.
const TileAgentPanel = dynamic(() => import("./TileAgentPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function TileAgentTab({ tileId }: { tileId: string }) {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectActiveAudioSessionId(tileId));

  // Ensure the tile has a backing studio session so the agent panel always has
  // one to bind to (idempotent + coalesced inside the thunk). Shared with the
  // Audio tab — recordings made there become this agent's transcript context.
  useEffect(() => {
    if (!sessionId) void dispatch(ensureTileAudioSession(tileId));
  }, [sessionId, tileId, dispatch]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pass the tileId through so the panel can expose the tile's task / notes /
  // files to the assistant as read-only context (TileAgentPanel builds those).
  return (
    <TileAgentPanel key={sessionId} sessionId={sessionId} tileId={tileId} />
  );
}
