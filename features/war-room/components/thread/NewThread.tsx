"use client";

// features/war-room/components/thread/NewThread.tsx
//
// The always-present "start a thread" affordance. A thin shell over the shared
// QuickAddThread composer (features/war-room/components/thread/QuickAddThread.tsx)
// so the Grid cell and the Stage rail share one inline create flow:
//
//   click → AUTO-FOCUSED name field → Enter = Create (stay, ready for the next
//   quick-add) · Shift/Cmd+Enter = Create and Open · Tab = description field.
//
// `onCreated` is the "open this new thread" hook (callers stage the returned
// tile) — it fires on the composer's Create-and-Open action, preserving the
// prior contract while Create-only now keeps the operator in place.
//   · "card" — a dashed cell for the Grid gallery.
//   · "rail" — a slim dashed row that matches the Stage rail rhythm.

import { QuickAddThread } from "./QuickAddThread";

export function NewThread({
  sessionId,
  nextPosition,
  variant = "card",
  onCreated,
}: {
  sessionId: string;
  nextPosition: number;
  variant?: "card" | "rail";
  onCreated?: (threadId: string) => void;
}) {
  return (
    <QuickAddThread
      sessionId={sessionId}
      nextPosition={nextPosition}
      variant={variant}
      onOpen={onCreated}
    />
  );
}
