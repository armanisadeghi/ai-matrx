"use client";

// features/education/spoken-practice/components/SpokenPracticeClient.tsx
//
// Thin client boundary that code-splits the heavy Spoken Practice surface behind
// `next/dynamic({ ssr: false })`. The surface pulls in the shared AudioContext,
// mic capture, agent-execution slices, and TTS — all browser-only — so it must
// never enter a server/SSR render path (CLAUDE.md heavy-client-code-split rule).

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const SpokenPracticeSurface = dynamic(
  () =>
    import("./SpokenPracticeSurface").then((m) => m.SpokenPracticeSurface),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function SpokenPracticeClient({
  initialMode,
}: {
  initialMode?: string | null;
}) {
  return <SpokenPracticeSurface initialMode={initialMode} />;
}
