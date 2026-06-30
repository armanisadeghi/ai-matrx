"use client";

// features/flashcards/fast-fire/capture-test/CaptureTestClient.tsx
//
// Client boundary that code-splits the capture-test surface behind
// `next/dynamic({ ssr: false })`. The surface pulls in the Web-Audio capture core
// (AudioContext, AudioWorklet, mic) — browser-only — so it must never enter an
// SSR path. (CLAUDE.md heavy-client-code-split rule.)

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CaptureTestSurface = dynamic(
  () => import("./CaptureTestSurface").then((m) => m.CaptureTestSurface),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function CaptureTestClient() {
  return <CaptureTestSurface />;
}
