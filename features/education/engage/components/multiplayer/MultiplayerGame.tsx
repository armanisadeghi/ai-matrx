"use client";

// features/education/engage/components/multiplayer/MultiplayerGame.tsx
//
// Thin client wrapper that code-splits the heavy multiplayer surface behind
// `next/dynamic({ ssr: false })`. MultiplayerGameImpl pulls in the Supabase
// Broadcast channel, presence, the game engine, and live-score state — all
// browser-only — so it must never enter a server/SSR render path or bloat a
// route chunk. This wrapper is the single client boundary; the page imports
// only this. (CLAUDE.md heavy-client-code-split rule.)

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const MultiplayerGameImpl = dynamic(
  () => import("./MultiplayerGameImpl").then((m) => m.MultiplayerGameImpl),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function MultiplayerGame({
  roomId,
  code,
}: {
  roomId: string;
  code: string;
}) {
  return <MultiplayerGameImpl roomId={roomId} code={code} />;
}
