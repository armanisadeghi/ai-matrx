"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { CanvasUnavailableBoundary } from "@/features/canvas/core/CanvasUnavailableBoundary";

const SharedCanvasView = dynamic(
  () =>
    import("@/features/canvas/shared/SharedCanvasView").then(
      (m) => m.SharedCanvasView,
    ),
  { ssr: false },
);

export function SharedCanvasViewClient({
  shareToken,
  serverSummary,
}: {
  shareToken: string;
  /** Server-rendered title + description: in the HTML until the interactive view mounts. */
  serverSummary?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <CanvasUnavailableBoundary>
      {mounted ? null : serverSummary}
      <div data-public-immersive-surface className="h-full min-h-0">
        <SharedCanvasView shareToken={shareToken} className="h-full min-h-0" />
      </div>
    </CanvasUnavailableBoundary>
  );
}
