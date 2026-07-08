"use client";

// features/education/engage/components/solo/SoloArcade.tsx
//
// Thin client wrapper that code-splits the heavy solo-arcade surface behind
// `next/dynamic({ ssr: false })`. SoloArcadeImpl pulls in the game engine
// (timers, the study-spine writer, per-answer state) — browser-only — so it
// must never enter a server/SSR render path or bloat a route chunk. This
// wrapper is the single client boundary; the page imports only this.
// (CLAUDE.md heavy-client-code-split rule.)

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const SoloArcadeImpl = dynamic(
  () => import("./SoloArcadeImpl").then((m) => m.SoloArcadeImpl),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function SoloArcade({
  sourceSetId,
  sourceTitle,
}: {
  sourceSetId?: string | null;
  sourceTitle?: string | null;
}) {
  return <SoloArcadeImpl sourceSetId={sourceSetId} sourceTitle={sourceTitle} />;
}
