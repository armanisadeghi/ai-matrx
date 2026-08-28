"use client";

import dynamic from "next/dynamic";

const SharedCanvasView = dynamic(
  () =>
    import("@/features/canvas/shared/SharedCanvasView").then(
      (m) => m.SharedCanvasView,
    ),
  { ssr: false },
);

export function SharedCanvasViewClient({ shareToken }: { shareToken: string }) {
  return (
    <div data-public-immersive-surface className="h-full min-h-0">
      <SharedCanvasView shareToken={shareToken} className="h-full min-h-0" />
    </div>
  );
}
