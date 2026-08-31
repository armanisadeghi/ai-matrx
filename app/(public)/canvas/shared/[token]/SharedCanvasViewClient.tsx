"use client";

import dynamic from "next/dynamic";
import { CanvasUnavailableBoundary } from "@/features/canvas/core/CanvasUnavailableBoundary";

const SharedCanvasView = dynamic(
  () =>
    import("@/features/canvas/shared/SharedCanvasView").then(
      (m) => m.SharedCanvasView,
    ),
  { ssr: false },
);

export function SharedCanvasViewClient({ shareToken }: { shareToken: string }) {
  return (
    <CanvasUnavailableBoundary>
      <div data-public-immersive-surface className="h-full min-h-0">
        <SharedCanvasView shareToken={shareToken} className="h-full min-h-0" />
      </div>
    </CanvasUnavailableBoundary>
  );
}
