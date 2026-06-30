"use client";

// features/flashcards/fast-fire/components/FastFireClient.tsx
//
// Thin client wrapper that code-splits the heavy FastFire surface behind
// `next/dynamic({ ssr: false })`. FastFireSurface pulls in MediaRecorder, the
// shared AudioContext, rAF timers, and the agent-execution slices — all
// browser-only — so it must NEVER enter a server/SSR render path or bloat a
// route chunk. This wrapper is the single client boundary; the page imports
// only this. (CLAUDE.md heavy-client-code-split rule.)

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const FastFireSurface = dynamic(
  () => import("./FastFireSurface").then((m) => m.FastFireSurface),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function FastFireClient({ setId }: { setId?: string | null }) {
  return <FastFireSurface setId={setId} />;
}
