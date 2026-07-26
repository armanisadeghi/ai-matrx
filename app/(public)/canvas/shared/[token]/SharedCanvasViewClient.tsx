"use client";

import dynamic from "next/dynamic";

const SharedCanvasView = dynamic(
    () => import("@/features/canvas/shared/SharedCanvasView").then((m) => m.SharedCanvasView),
    { ssr: false }
);

export function SharedCanvasViewClient({ shareToken }: { shareToken: string }) {
    return <SharedCanvasView shareToken={shareToken} />;
}
